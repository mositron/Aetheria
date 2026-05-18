import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { GAME_CONFIG, JOBS, type JobId } from "@game/shared";

const SECRET = process.env.JWT_SECRET ?? "dev-secret";
const TOKEN_TTL = "365d";
const MAX_CHARACTERS_PER_USER = 3;

export const authRouter = Router();

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
  if (typeof username !== "string" || typeof password !== "string" || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: "invalid username/password" });
  }
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: "username taken" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  const token = jwt.sign({ uid: user.id, username }, SECRET, { expiresIn: TOKEN_TTL });
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
  if (!user) return res.status(401).json({ error: "bad credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "bad credentials" });
  const token = jwt.sign({ uid: user.id, username }, SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, username, characters: user.characters.map(summarizeCharacter) });
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
    // No water — must drink at lake/river. Apple + potion as starter only.
    const starterInv = JSON.stringify([
      { itemId: "apple", qty: 2 },
      { itemId: "hp_potion", qty: 2 },
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
    res.status(500).json({ error: e.message ?? "failed to create" });
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
  await prisma.character.delete({ where: { id: c.id } });
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
