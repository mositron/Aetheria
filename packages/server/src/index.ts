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

// World grew large with new biomes/items — bump Colyseus encode buffer.
Encoder.BUFFER_SIZE = 64 * 1024;

const PORT = (() => {
  const p = parseInt(process.env.PORT ?? "2567", 10);
  if (!Number.isFinite(p) || p < 1 || p > 65535) {
    console.error("[server] invalid PORT, falling back to 2567");
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
  console.log(`[server] listening on http://localhost:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// On SIGTERM/SIGINT, drain rooms (savePlayer runs in each room's onLeave) and
// close the HTTP server before exiting. Prevents data loss on container eviction.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal} — graceful shutdown (saving players)`);
  try {
    await gameServer.gracefullyShutdown(false); // false = don't exit; we'll exit after http close
  } catch (e) {
    console.error("[server] gracefullyShutdown error", e);
  }
  httpServer.close(() => {
    console.log("[server] HTTP server closed; exiting");
    process.exit(0);
  });
  // hard exit if cleanup hangs > 10s
  setTimeout(() => {
    console.error("[server] shutdown timeout (10s) — forcing exit");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("[server] unhandledRejection", reason));
process.on("uncaughtException", (err) => console.error("[server] uncaughtException", err));
