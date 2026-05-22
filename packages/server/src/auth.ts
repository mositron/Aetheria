import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { GAME_CONFIG, JOBS, type JobId } from "@game/shared";
import { logger } from "./logger.js";
import { auditService } from "./services/AuditService.js";

// JWT_SECRET must be set in env. In dev only, allow a clearly-marked fallback
// but log a loud warning so it's obvious if it's accidentally used in prod.
const SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("[FATAL] JWT_SECRET must be set (>= 16 chars) in production");
  }
  logger.warn("auth.jwtSecret.insecureFallback", { reason: "missing or too short" });
  return "dev-only-insecure-fallback-DO-NOT-USE-IN-PROD";
})();
const TOKEN_TTL: any = process.env.JWT_TTL ?? "30d";
const REFRESH_TTL_SECS = 60 * 60 * 24 * 90; // 90 days
const MAX_CHARACTERS_PER_USER = 3;
// Dummy bcrypt hash to equalize login timing for non-existent users (prevent username enumeration)
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuv1234567890abcdefghijklmnopqrstuv";

// ── Redis presence ─────────────────────────────────────────────────────────
async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  try {
    const { default: Redis } = await import("ioredis-mock");
    return new Redis(process.env.REDIS_URL);
  } catch { return null; }
}

// ── Refresh token helpers ───────────────────────────────────────────────────
async function storeRefreshToken(uid: string, token: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.setex(`refresh:${uid}:${token}`, REFRESH_TTL_SECS, "1");
}

async function revokeRefreshToken(uid: string, token: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(`refresh:${uid}:${token}`);
}

async function revokeAllRefreshTokens(uid: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  const keys = await redis.keys(`refresh:${uid}:*`);
  if (keys.length) await redis.del(...keys);
}

function generateRefreshToken(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export const authRouter = Router();

/** Returns null if valid, or an error message string. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a digit";
  return null;
}

function summarizeCharacter(c: any) {
  return {
    id: c.id,
    name: c.name,
    job: c.job,
    level: c.level,
    mapId: c.mapId,
    appearance: c.appearance,
    createdAt: c.createdAt,
  };
}

authRouter.post("/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || username.length < 3) {
    return res.status(400).json({ error: "invalid username/password" });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: "username taken" });

  // 12 rounds — ~250ms on modern CPUs; balances UX vs offline brute-force cost.
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  const token = jwt.sign({ uid: user.id, username }, SECRET, { expiresIn: TOKEN_TTL });
  auditService.log("auth.register", { userId: user.id, ip: req.ip });
  res.json({ token, username, characters: [] });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "invalid body" });
  }
  const user = await prisma.user.findUnique({
    where: { username },
    include: { characters: { orderBy: { createdAt: "asc" } } },
  });
  // Always run bcrypt to equalize response time (prevents username enumeration)
  const ok = user
    ? await bcrypt.compare(password, user.passwordHash)
    : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!user || !ok) {
    logger.warn("auth.login.failed", { username: username.slice(0, 24), ip: req.ip });
    auditService.log("auth.login.fail", { userId: null, ip: req.ip, metadata: { username } });
    return res.status(401).json({ error: "bad credentials" });
  }
  logger.info("auth.login.ok", { uid: user.id });
  auditService.log("auth.login.success", { userId: user.id, ip: req.ip });
  const token = jwt.sign({ uid: user.id, username }, SECRET, { expiresIn: TOKEN_TTL });
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user.id, refreshToken);
  res.json({ token, refreshToken, username, characters: user.characters.map(summarizeCharacter) });
});

function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid token" });
  req.user = payload;
  next();
}

authRouter.post("/refresh", async (req, res) => {
  const { uid, refreshToken } = req.body ?? {};
  if (typeof uid !== "string" || typeof refreshToken !== "string") {
    return res.status(400).json({ error: "invalid body" });
  }
  const redis = await getRedis();
  if (redis) {
    const exists = await redis.get(`refresh:${uid}:${refreshToken}`);
    if (!exists) return res.status(401).json({ error: "token revoked or expired" });
  }
  const newAccess = jwt.sign({ uid, username: "" }, SECRET, { expiresIn: TOKEN_TTL });
  const newRefresh = generateRefreshToken();
  await storeRefreshToken(uid, newRefresh);
  res.json({ token: newAccess, refreshToken: newRefresh });
});

authRouter.post("/logout", async (req, res) => {
  const { uid, refreshToken } = req.body ?? {};
  if (typeof uid === "string" && typeof refreshToken === "string") {
    await revokeRefreshToken(uid, refreshToken);
  }
  res.json({ ok: true });
});

authRouter.get("/characters", authMiddleware, async (req: any, res) => {
  const chars = await prisma.character.findMany({
    where: { userId: req.user.uid },
    orderBy: { createdAt: "asc" },
  });
  res.json({ characters: chars.map(summarizeCharacter) });
});

authRouter.post("/characters", authMiddleware, async (req: any, res) => {
  const { name, job, appearance } = req.body ?? {};
  if (typeof name !== "string" || name.length < 2 || name.length > 16) {
    return res.status(400).json({ error: "name must be 2-16 chars" });
  }
  if (!/^[a-zA-Z0-9_฀-๿]+$/.test(name)) {
    return res.status(400).json({ error: "name has invalid characters" });
  }
  const jobId = typeof job === "string" && JOBS[job as JobId] ? (job as JobId) : "novice";
  // only novice is allowed for new characters (job change happens at Lv5 in-game)
  if (jobId !== "novice") {
    return res.status(400).json({ error: "new characters must start as novice" });
  }
  const appearanceJson = typeof appearance === "object" && appearance !== null
    ? JSON.stringify(appearance).slice(0, 500)
    : "{}";

  const count = await prisma.character.count({ where: { userId: req.user.uid } });
  if (count >= MAX_CHARACTERS_PER_USER) {
    return res.status(400).json({ error: `max ${MAX_CHARACTERS_PER_USER} characters` });
  }
  const nameTaken = await prisma.character.findUnique({ where: { name } });
  if (nameTaken) return res.status(409).json({ error: "name already taken" });

  try {
    // Generous starter pack: lots of potions for safe early-game.
    const starterInv = JSON.stringify([
      { itemId: "apple", qty: 2 },
      { itemId: "hp_potion", qty: 1000 },
      { itemId: "mp_potion", qty: 1000 },
    ]);
    const c = await prisma.character.create({
      data: {
        userId: req.user.uid,
        name,
        job: jobId,
        hp: GAME_CONFIG.PLAYER_BASE_HP,
        maxHp: GAME_CONFIG.PLAYER_BASE_HP,
        atk: GAME_CONFIG.PLAYER_BASE_ATK,
        appearance: appearanceJson,
        inventoryJson: starterInv,
      },
    });
    res.json({ character: summarizeCharacter(c) });
  } catch (e: any) {
    logger.error("auth.character.createFailed", { err: e?.message, code: e?.code });
    // Don't leak DB schema details to client
    const friendly = String(e?.code) === "P2002" ? "name already taken" : "failed to create character";
    res.status(500).json({ error: friendly });
  }
});

// List mailbox by character name
authRouter.get("/mailbox/:name", authMiddleware, async (req: any, res) => {
  const name = String(req.params.name ?? "");
  // verify ownership
  const c = await prisma.character.findUnique({ where: { name } });
  if (!c || c.userId !== req.user.uid) return res.status(404).json({ error: "not found" });
  const mails = await prisma.mail.findMany({
    where: { toName: name },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  res.json({ mails });
});

authRouter.delete("/characters/:id", authMiddleware, async (req: any, res) => {
  const c = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!c || c.userId !== req.user.uid) return res.status(404).json({ error: "not found" });
  const charId = c.id;
  const charName = c.name;
  await prisma.character.delete({ where: { id: charId } });
  auditService.log("character.delete", { userId: req.user.uid, characterId: charId, metadata: { charName } });
  res.json({ ok: true });
});

export function verifyToken(token: string): { uid: string; username: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { uid: string; username: string };
    return { uid: payload.uid, username: payload.username };
  } catch {
    return null;
  }
}
