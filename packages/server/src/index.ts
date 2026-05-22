import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import rateLimit from "express-rate-limit";
import { authRouter } from "./auth.js";
import { logger } from "./logger.js";
import { getTop } from "./leaderboard.js";
import { WorldManager } from "./services/WorldManager.js";
import { WorldRoom } from "./rooms/WorldRoom.js";

// ── App + HTTP ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173", "http://127.0.0.1:4173"],
  credentials: true,
}));
app.use(helmet());
const httpServer = http.createServer(app);

// ── World Manager ───────────────────────────────────────────────────────────
const worldManager = new WorldManager();

// ── Rate limiting ───────────────────────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 15_000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

// Strict rate limit on auth routes (prevent credential stuffing)
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ── HTTPS enforcement (production) ────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
    if (proto !== "https") {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

app.use("/api/auth", authRouter);

// GET /api/worlds — list public worlds
app.get("/api/worlds", async (_req, res) => {
  try {
    const worlds = await worldManager.listPublicWorlds(20);
    res.json({ worlds });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/worlds/create — create a new world
app.post("/api/worlds/create", async (req, res) => {
  try {
    const { name, template, mode, privacy, maxPlayers } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    const world = await worldManager.createWorld({
      hostId: (req.headers["x-user-id"] as string) ?? "anon",
      hostName: (req.headers["x-user-name"] as string) ?? "Anonymous",
      name: name.trim(),
      template: template ?? "forest",
      mode: mode ?? "adventure",
      privacy: privacy ?? "private",
      maxPlayers: Math.min(32, Math.max(1, Number(maxPlayers) || 8)),
    });
    res.json({ worldId: world.id, inviteCode: world.inviteCode });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/worlds/by-code/:code — resolve invite code → worldId + name
app.get("/api/worlds/by-code/:code", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const worldId = worldManager.resolveCode(code);
  if (!worldId) return res.status(404).json({ error: "invalid code" });
  try {
    const world = await worldManager.getWorld(worldId);
    if (!world) return res.status(404).json({ error: "world not found" });
    res.json({ worldId: world.id, name: world.name, hostName: world.hostName, template: world.template, mode: world.mode });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leaderboard/:scope?
app.get("/api/leaderboard/:scope?", async (req, res) => {
  try {
    const scope = req.params.scope ?? "all";
    const n = scope === "daily" ? 5 : scope === "weekly" ? 10 : scope === "monthly" ? 20 : 10;
    const top = await getTop(n);
    res.json({ scope, top });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Colyseus game server ────────────────────────────────────────────────────
const serverOpts: any = { transport: new WebSocketTransport({ server: httpServer }) };
if (process.env.REDIS_URL) {
  try {
    const { RedisPresence } = await import("@colyseus/redis-presence");
    const { RedisDriver } = await import("@colyseus/redis-driver");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serverOpts as any).presence = new RedisPresence(process.env.REDIS_URL);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serverOpts as any).driver = new RedisDriver(process.env.REDIS_URL);
    logger.info("server.scaleOut.enabled", { url: process.env.REDIS_URL.replace(/:[^:@]+@/, ":***@") });
  } catch (e) {
    logger.error("server.scaleOut.initFailed", { err: String(e) });
  }
}

const gameServer = new Server(serverOpts);

// one WorldRoom handles all mapIds; warp within same room via state.mapId changes
gameServer.define("world", WorldRoom);

// GET /health — server health + active player/room counts
app.get("/health", (_req, res) => {
  // @ts-ignore — rooms is a public registry map on Server
  const roomMap: Map<string, any> = (gameServer as any).rooms ?? new Map();
  let players = 0;
  for (const [, room] of roomMap) {
    players += (room as any).clients?.length ?? 0;
  }
  res.json({
    uptime: Math.floor(process.uptime()),
    players,
    rooms: roomMap.size,
  });
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server.shutdown.start", { signal });
  try {
    await gameServer.gracefullyShutdown(false);
  } catch (e) {
    logger.error("server.shutdown.gracefulFailed", { err: String(e) });
  }
  httpServer.close(() => {
    logger.info("server.shutdown.complete");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("server.shutdown.timeout", { timeoutMs: 10000 });
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => logger.error("unhandledRejection", { reason: String(reason) }));
process.on("uncaughtException", (err) => logger.error("uncaughtException", { err: err?.message, stack: err?.stack }));

const PORT = Number(process.env.PORT) || 2567;
gameServer.listen(PORT).then(() => {
  logger.info("server.listening", { port: PORT, nodeEnv: process.env.NODE_ENV ?? "development", pid: process.pid });
});