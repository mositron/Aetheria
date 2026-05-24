/**
 * Headless Colyseus load-test runner. Spawns N bot clients via the official
 * colyseus.js SDK (so the matchmaking handshake is correct), drives 20 Hz
 * input messages, and reports rtt/tick percentiles.
 *
 * Usage:
 *   # Terminal 1 — boot the server
 *   pnpm --filter @game/server dev
 *
 *   # Terminal 2 — run the harness
 *   pnpm test:harness
 *
 *   # Override defaults
 *   BOT_COUNT=100 DURATION_MS=120000 SERVER_URL=ws://localhost:2567 pnpm test:harness
 */
import { Client } from "colyseus.js";

const SERVER_URL = process.env.SERVER_URL ?? "ws://localhost:2567";
const BOT_COUNT  = parseInt(process.env.BOT_COUNT  ?? "50",    10);
const DURATION   = parseInt(process.env.DURATION_MS ?? "60000", 10);
const WARMUP     = parseInt(process.env.WARMUP_MS   ?? "10000", 10);
const TICK_MS    = parseInt(process.env.TICK_MS     ?? "50",    10);

type Bot = {
  id: number;
  room: any;
  alive: boolean;
  tickTimer?: NodeJS.Timeout;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function main() {
  console.log("[harness] starting", { SERVER_URL, BOT_COUNT, DURATION, WARMUP });
  const bots: Bot[] = [];
  let connected = 0, failed = 0;
  const rttSamples: number[] = [];

  // ── Connect phase ─────────────────────────────────────────────────────────
  await Promise.all(
    Array.from({ length: BOT_COUNT }, (_, i) =>
      (async () => {
        try {
          const client = new Client(SERVER_URL);
          const room = await client.joinOrCreate("world", { token: `dev:bot_${i}` });
          connected++;
          const bot: Bot = { id: i, room, alive: true };
          bots.push(bot);
          // Stop on remote close
          room.onLeave(() => { bot.alive = false; });
        } catch (err: any) {
          failed++;
          if (failed <= 3) console.error(`[harness] bot ${i} connect failed:`, err.message ?? err);
        }
      })()
    )
  );

  console.log(`[harness] connected=${connected} failed=${failed} — warming up ${WARMUP}ms`);
  await sleep(WARMUP);

  // ── Measure phase ─────────────────────────────────────────────────────────
  const start = Date.now();
  for (const bot of bots) {
    if (!bot.alive) continue;
    bot.tickTimer = setInterval(() => {
      if (!bot.alive) return;
      const seq = Date.now();
      try {
        bot.room.send("input", {
          mx: Math.random() * 2 - 1,
          mz: Math.random() * 2 - 1,
          rotY: Math.random() * Math.PI * 2,
          seq,
        });
      } catch { /* room may have closed */ }
    }, TICK_MS);
    // RTT echo: server may broadcast state — we approximate latency by tracking
    // patch arrival time
    bot.room.onStateChange(() => {
      const now = Date.now();
      if (bot.room.state?._lastSeq) {
        const rtt = now - bot.room.state._lastSeq;
        if (rtt >= 0 && rtt < 5000) rttSamples.push(rtt);
      }
    });
  }

  console.log(`[harness] measuring for ${DURATION}ms`);
  await sleep(DURATION);

  // ── Teardown ───────────────────────────────────────────────────────────────
  for (const bot of bots) {
    if (bot.tickTimer) clearInterval(bot.tickTimer);
    try { await bot.room.leave(); } catch { /* */ }
  }

  const sorted = [...rttSamples].sort((a, b) => a - b);
  const elapsedMs = Date.now() - start;
  const stillConnected = bots.filter((b) => b.alive).length;
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const p99 = percentile(sorted, 0.99);
  const pass = p95 < 200 && connected >= BOT_COUNT * 0.9;

  console.log("\n[harness] DONE");
  console.log("  target bots    :", BOT_COUNT);
  console.log("  connected      :", connected);
  console.log("  failed         :", failed);
  console.log("  stillConnected :", stillConnected);
  console.log("  rtt samples    :", rttSamples.length);
  console.log("  rtt p50/p95/p99:", p50, "/", p95, "/", p99, "ms");
  console.log("  elapsed        :", elapsedMs, "ms");
  console.log("  PASS           :", pass);
  process.exit(pass ? 0 : 1);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("[harness] FATAL", err);
  process.exit(2);
});
