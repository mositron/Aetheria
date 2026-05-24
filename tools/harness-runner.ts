/**
 * Headless Colyseus load-test runner. Spawns N bot clients via the official
 * colyseus.js SDK, joins the `world` room with seeded credentials, drives
 * 20 Hz input messages, and reports rtt/tick percentiles.
 *
 * Usage:
 *   # 1. Seed bots once (writes tools/.load-bots.json)
 *   pnpm seed:load-bots
 *
 *   # 2. Boot the server (terminal 1)
 *   pnpm --filter @game/server dev
 *
 *   # 3. Run the harness (terminal 2)
 *   pnpm test:harness
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "colyseus.js";

const SERVER_URL = process.env.SERVER_URL ?? "ws://localhost:2567";
const BOT_COUNT  = parseInt(process.env.BOT_COUNT  ?? "50",    10);
const DURATION   = parseInt(process.env.DURATION_MS ?? "60000", 10);
const WARMUP     = parseInt(process.env.WARMUP_MS   ?? "5000",  10);
const TICK_MS    = parseInt(process.env.TICK_MS     ?? "50",    10);

type BotCred = { token: string; characterId: string; name: string };
type Bot = { id: number; room: any; alive: boolean; tickTimer?: NodeJS.Timeout };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function main() {
  const credPath = resolve(import.meta.dirname ?? __dirname, ".load-bots.json");
  let creds: BotCred[];
  try {
    creds = JSON.parse(readFileSync(credPath, "utf8"));
  } catch (err) {
    console.error(`\n[harness] missing ${credPath}\n         Run: pnpm seed:load-bots first.\n`);
    process.exit(1);
  }
  if (creds.length < BOT_COUNT) {
    console.error(`[harness] only ${creds.length} seeded bots, need ${BOT_COUNT}. Re-seed with BOT_COUNT=${BOT_COUNT} pnpm seed:load-bots`);
    process.exit(1);
  }

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
          const room = await client.joinOrCreate("world", {
            token: creds[i].token,
            characterId: creds[i].characterId,
            // Pin all bots into one room so we actually stress a single instance.
            // Defaults to 200, override with MAX_PLAYERS env.
            maxPlayers: parseInt(process.env.MAX_PLAYERS ?? "200", 10),
            worldId: "loadtest",
          });
          connected++;
          const bot: Bot = { id: i, room, alive: true };
          bots.push(bot);
          room.onLeave(() => { bot.alive = false; });
        } catch (err: any) {
          failed++;
          if (failed <= 3) console.error(`[harness] bot ${i} connect failed:`, err?.message ?? err);
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
    let lastSent = 0;
    bot.tickTimer = setInterval(() => {
      if (!bot.alive) return;
      lastSent = Date.now();
      try {
        bot.room.send("input", {
          mx: Math.random() * 2 - 1,
          mz: Math.random() * 2 - 1,
          rotY: Math.random() * Math.PI * 2,
        });
      } catch { /* room may have closed */ }
    }, TICK_MS);
    bot.room.onStateChange(() => {
      if (lastSent > 0) {
        const rtt = Date.now() - lastSent;
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
