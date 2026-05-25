import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import rateLimit from "express-rate-limit";
import { authRouter, verifyToken } from "./auth.js";
import { logger } from "./logger.js";
import { getTop } from "./leaderboard.js";
import { WorldManager } from "./services/WorldManager.js";
import { WorldRoom } from "./rooms/WorldRoom.js";
import { prisma } from "./db.js";
import { auditService } from "./services/AuditService.js";
import * as Sentry from "@sentry/node";

// ── Sentry (gated on SENTRY_DSN) ─────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
  logger.info("sentry.enabled");
}

// ── App + HTTP ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "256kb" }));
// CORS: explicit whitelist + LAN regex (192.168.*, 10.*, 172.16-31.*) so
// phones/tablets on the same Wi-Fi can connect to the dev server.
const LAN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);        // server-to-server / native clients
    if (LAN_RE.test(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
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

// ── HTTPS enforcement ─────────────────────────────────────────────────────
// Opt-in via ENFORCE_HTTPS=true. Skip in local Docker so http://localhost works
// even with NODE_ENV=production. Enable on the production VPS (Caddy sets
// x-forwarded-proto=https when terminating TLS).
if (process.env.ENFORCE_HTTPS === "true") {
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

// POST /api/worlds/create — create a new world record; Colyseus room is created on first player join
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

// GET /api/admin/audit?action=&limit=50 — admin only (checks userId in Bearer token)
app.get("/api/admin/audit", async (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid token" });

  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const where: Record<string, unknown> = {};
  if (action) where.action = action;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ logs });
});

// ── Colyseus game server ────────────────────────────────────────────────────
const serverOpts: any = { transport: new WebSocketTransport({ server: httpServer }) };
if (process.env.REDIS_URL) {
  try {
    const { RedisPresence } = await import("@colyseus/redis-presence");
    const { RedisDriver } = await import("@colyseus/redis-driver");
     
    (serverOpts as any).presence = new RedisPresence(process.env.REDIS_URL);
     
    (serverOpts as any).driver = new RedisDriver(process.env.REDIS_URL);
    logger.info("server.scaleOut.enabled", { url: process.env.REDIS_URL.replace(/:[^:@]+@/, ":***@") });
  } catch (e) {
    logger.error("server.scaleOut.initFailed", { err: String(e) });
  }
}

const gameServer = new Server(serverOpts);

// one WorldRoom handles all mapIds; warp within same room via state.mapId changes
gameServer.define("world", WorldRoom);

// GET /health — server health + active player/room counts + tick metrics
app.get("/health", (_req, res) => {
  // @ts-ignore — rooms is a public registry map on Server
  const roomMap: Map<string, any> = (gameServer as any).rooms ?? new Map();
  let players = 0;
  const tick: Record<string, ReturnType<any>> = {};
  for (const [id, room] of roomMap) {
    players += (room as any).clients?.length ?? 0;
    if (typeof (room as any).getTickStats === "function") {
      tick[id] = (room as any).getTickStats();
    }
  }
  const mem = process.memoryUsage();
  res.json({
    uptime: Math.floor(process.uptime()),
    players,
    rooms: roomMap.size,
    tick,
    mem: {
      rssMb:  Math.round(mem.rss / 1024 / 1024),
      heapMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
  });
});

// GET /metrics — admin-gated HTML dashboard polling /health every 2s
app.get("/metrics", (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(503).type("text/plain").send("ADMIN_TOKEN env var not set");
    return;
  }
  if (String(req.query.token ?? "") !== adminToken) {
    res.status(401).type("text/plain").send("unauthorized");
    return;
  }
  res.type("text/html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Aetheria · Metrics</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
  h1{margin:0 0 16px;font-size:20px;color:#22d3ee}
  .card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px}
  .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:13px}
  .label{width:120px;color:#94a3b8}
  .val{font-weight:bold;width:80px;text-align:right;font-variant-numeric:tabular-nums}
  .bar{flex:1;height:10px;background:#0f172a;border:1px solid #334155;border-radius:4px;overflow:hidden}
  .fill{height:100%;background:linear-gradient(90deg,#22d3ee,#a855f7);transition:width .3s}
  .fill.warn{background:linear-gradient(90deg,#f59e0b,#ef4444)}
  .room{border-left:3px solid #22d3ee;padding-left:10px;margin:8px 0}
  code{color:#fbbf24}
</style></head><body>
<h1>⚡ Aetheria · Live Metrics</h1>
<div class="card">
  <div class="row"><div class="label">Uptime</div><div class="val" id="uptime">—</div></div>
  <div class="row"><div class="label">Players</div><div class="val" id="players">—</div></div>
  <div class="row"><div class="label">Rooms</div><div class="val" id="rooms">—</div></div>
  <div class="row"><div class="label">Memory (RSS)</div><div class="val" id="rss">—</div><div class="bar"><div class="fill" id="rssBar" style="width:0%"></div></div></div>
  <div class="row"><div class="label">Heap</div><div class="val" id="heap">—</div><div class="bar"><div class="fill" id="heapBar" style="width:0%"></div></div></div>
</div>
<div id="rooms-container"></div>
<script>
const TOKEN = ${JSON.stringify(adminToken)};
function bar(ms, max=200){return Math.min(100, ms/max*100)}
async function poll(){
  try{
    const r = await fetch('/health');
    const j = await r.json();
    document.getElementById('uptime').textContent = j.uptime + 's';
    document.getElementById('players').textContent = j.players;
    document.getElementById('rooms').textContent = j.rooms;
    document.getElementById('rss').textContent = j.mem.rssMb + ' MB';
    document.getElementById('heap').textContent = j.mem.heapMb + ' MB';
    document.getElementById('rssBar').style.width = Math.min(100, j.mem.rssMb/1024*100) + '%';
    document.getElementById('heapBar').style.width = Math.min(100, j.mem.heapMb/512*100) + '%';
    const c = document.getElementById('rooms-container');
    c.innerHTML = '';
    for (const [id, t] of Object.entries(j.tick || {})) {
      const div = document.createElement('div');
      div.className = 'card';
      const cls = (v) => v > 40 ? 'fill warn' : 'fill';
      div.innerHTML = '<div class="room">Room <code>' + id + '</code></div>' +
        '<div class="row"><div class="label">tick avg</div><div class="val">' + (t.avg?.toFixed(1) ?? '—') + 'ms</div><div class="bar"><div class="' + cls(t.avg) + '" style="width:' + bar(t.avg) + '%"></div></div></div>' +
        '<div class="row"><div class="label">tick p50</div><div class="val">' + (t.p50?.toFixed(1) ?? '—') + 'ms</div><div class="bar"><div class="' + cls(t.p50) + '" style="width:' + bar(t.p50) + '%"></div></div></div>' +
        '<div class="row"><div class="label">tick p95</div><div class="val">' + (t.p95?.toFixed(1) ?? '—') + 'ms</div><div class="bar"><div class="' + cls(t.p95) + '" style="width:' + bar(t.p95) + '%"></div></div></div>' +
        '<div class="row"><div class="label">tick max</div><div class="val">' + (t.max?.toFixed(1) ?? '—') + 'ms</div><div class="bar"><div class="' + cls(t.max) + '" style="width:' + bar(t.max) + '%"></div></div></div>';
      c.appendChild(div);
    }
  } catch(e){ console.error(e); }
}
poll(); setInterval(poll, 2000);
</script>
</body></html>`);
});

// ── Static client (production) ─────────────────────────────────────────────
// In Docker/prod, the server serves the built Vite client. In dev, vite's
// own dev server handles this on :5173. Resolved from the runtime image
// layout: dist/server/src/index.js + dist/client/dist/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_CANDIDATES = [
  path.resolve(__dirname, "../../client/dist"),         // build output: packages/server/dist/src + packages/client/dist
  path.resolve(__dirname, "../../../client/dist"),      // if rootDir differs
  path.resolve(process.cwd(), "packages/client/dist"),  // monorepo run from root
];
const clientDist = CLIENT_DIST_CANDIDATES.find((p) => fs.existsSync(path.join(p, "index.html")));
if (clientDist) {
  logger.info("client.static.serving", { from: clientDist });
  app.use(express.static(clientDist, { maxAge: "1h", index: false }));
  // SPA fallback — anything not /api, /health, /metrics, /matchmake → index.html
  app.get(/^\/(?!api|health|metrics|matchmake).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  logger.info("client.static.skipped", { reason: "no dist found — assuming dev mode" });
}

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
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { reason: String(reason) });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason, (scope) => {
      scope.setLevel("error");
      return scope;
    });
  }
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { err: err?.message, stack: err?.stack });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, (scope) => {
      scope.setLevel("error");
      // Attach user context if available (via x-user-id header tracked at startup)
      if ((global as any).__sentryUser) {
        scope.setUser((global as any).__sentryUser);
      }
      return scope;
    });
  }
});

const PORT = Number(process.env.PORT) || 2567;
gameServer.listen(PORT).then(() => {
  logger.info("server.listening", { port: PORT, nodeEnv: process.env.NODE_ENV ?? "development", pid: process.pid });
});