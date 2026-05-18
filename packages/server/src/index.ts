import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAPS } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom.js";
import { authRouter } from "./auth.js";
import { getTop } from "./leaderboard.js";
import { logger } from "./logger.js";

// World grew large with new biomes/items — bump Colyseus encode buffer.
Encoder.BUFFER_SIZE = 64 * 1024;

const PORT = (() => {
  const p = parseInt(process.env.PORT ?? "2567", 10);
  if (!Number.isFinite(p) || p < 1 || p > 65535) {
    logger.error("invalid PORT, falling back to 2567", { provided: process.env.PORT });
    return 2567;
  }
  return p;
})();

const startedAt = Date.now();

const app = express();
// Restrictive CORS in production; permissive in dev.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: "32kb" })); // cap body to prevent DoS
app.use("/auth", authRouter);
app.get("/", (_req, res) => res.json({ ok: true, name: "game-v1 server" }));
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeMs: Date.now() - startedAt,
    nodeEnv: process.env.NODE_ENV ?? "development",
    pid: process.pid,
  });
});
app.get("/leaderboard", (_req, res) => res.json({ entries: getTop(10) }));

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// one room per map
for (const id of Object.keys(MAPS)) {
  gameServer.define(`map_${id}`, GameRoom, { mapId: id }).filterBy(["mapId"]);
}

gameServer.listen(PORT).then(() => {
  logger.info("server.listening", { port: PORT, nodeEnv: process.env.NODE_ENV ?? "development", pid: process.pid });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// On SIGTERM/SIGINT, drain rooms (savePlayer runs in each room's onLeave) and
// close the HTTP server before exiting. Prevents data loss on container eviction.
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
