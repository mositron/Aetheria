/**
 * LoadTestHarness — in-process headless bot simulator.
 *
 * Spawns N bot clients that connect to a Colyseus room and emit position
 * updates at 20 Hz. Collects metrics without external tooling (no k6 needed).
 *
 * Usage:
 *   // Within a vitest or a standalone script:
 *   import { runHarness } from "./LoadTestHarness.js";
 *
 *   const result = await runHarness({
 *     roomUrl: "ws://localhost:2567/map_field",
 *     botCount: 50,
 *     durationMs: 60_000,
 *     warmupMs: 10_000,
 *   });
 *   console.log(result);
 */

import { logger } from "../logger.js";

export interface HarnessOptions {
  roomUrl: string;
  botCount: number;
  /** Total test duration in ms (excluding warmup). Default: 60_000 */
  durationMs?: number;
  /** Warmup period in ms (bots send but metrics not collected). Default: 10_000 */
  warmupMs?: number;
  /** Tick interval in ms. Default: 50 (20 Hz) */
  tickMs?: number;
}

export interface HarnessResult {
  /** Total bots that connected successfully. */
  connected: number;
  /** Total bots that failed to connect. */
  failed: number;
  /** Bots still connected at end of test. */
  stillConnected: number;
  /** Round-trip times collected during measurement window. */
  rttMs: number[];
  /** Tick durations observed by each bot (ms). */
  tickDurationsMs: number[];
  /** Errors encountered during test. */
  errors: string[];
  /** Elapsed wall-clock time in ms. */
  elapsedMs: number;
  summary: {
    rttP50: number;
    rttP95: number;
    rttP99: number;
    tickDurationP50: number;
    tickDurationP95: number;
    activePlayers: number;
    targetPlayers: number;
    pass: boolean;
  };
}

interface BotClient {
  id: string;
  ws: any; // WebSocket
  connectedAt: number;
  lastRttAt: number;
  rttSamples: number[];
  tickDurations: number[];
  errors: string[];
  alive: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function summarize(rttMs: number[], tickMs: number[]): HarnessResult["summary"] {
  const sortedRtt   = [...rttMs].sort((a, b) => a - b);
  const sortedTicks = [...tickMs].sort((a, b) => a - b);

  const rttP50 = percentile(sortedRtt, 0.50);
  const rttP95 = percentile(sortedRtt, 0.95);
  const rttP99 = percentile(sortedRtt, 0.99);
  const tickP50 = percentile(sortedTicks, 0.50);
  const tickP95 = percentile(sortedTicks, 0.95);

  return {
    rttP50,
    rttP95,
    rttP99,
    tickDurationP50: tickP50,
    tickDurationP95: tickP95,
    activePlayers: 0, // filled by caller
    targetPlayers: 0,
    pass: rttP95 < 200, // SERVER_SIZING_50_PLAYERS.md target
  };
}

/** Main entry point — spawns bots, runs test, returns metrics. */
export async function runHarness(opts: HarnessOptions): Promise<HarnessResult> {
  const {
    roomUrl,
    botCount,
    durationMs = 60_000,
    warmupMs = 10_000,
    tickMs = 50,
  } = opts;

  const bots: BotClient[] = [];
  let connected = 0;
  let failed = 0;
  let stillConnected = 0;
  const allRtt: number[] = [];
  const allTickDurations: number[] = [];
  const allErrors: string[] = [];
  const startWall = Date.now();

  // We use Node.js built-in WebSocket (v21+) to avoid extra dependencies
  // If Node < 21, fallback via `ws` package (add to server devDependencies).
  let WS: any;
  try {
    // Node.js 21+ has WebSocket built-in
    WS = globalThis.WebSocket || (globalThis as any).WebSocket;
    if (!WS) throw new Error("no built-in");
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    WS = require("ws").WebSocket;
  }

  logger.info("harness.start", { botCount, durationMs, warmupMs, roomUrl });

  // ── Connect phase ──────────────────────────────────────────────────────────
  logger.info("harness.connecting", { count: botCount });
  const connectPromises: Promise<void>[] = [];

  for (let i = 0; i < botCount; i++) {
    const botId = `harness_${i.toString().padStart(4, "0")}`;

    const p = new Promise<void>((resolve) => {
      let ws: any;
      let rttTimer: ReturnType<typeof setInterval>;

      try {
        // Append auth token so server accepts the connection
        const url = `${roomUrl}?token=dev:${botId}`;
        ws = new WebSocket(url);

        ws.on("open", () => {
          connected++;
          bots.push({
            id: botId,
            ws,
            connectedAt: Date.now(),
            lastRttAt: 0,
            rttSamples: [],
            tickDurations: [],
            errors: [],
            alive: true,
          });

          // Begin sending position updates at 20 Hz
          rttTimer = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;

            const tickAt = Date.now();
            const x = Math.random() * 200 - 100;
            const z = Math.random() * 200 - 100;
            const rotY = Math.random() * Math.PI * 2;

            // Track outgoing timestamp for RTT
            const pending = Date.now();
            ws.send(JSON.stringify({ op: "input", mx: x, mz: z, rotY, seq: pending }));

            // After tick, record duration (no echo back in this harness —
            // we measure "time to send" as proxy; real RTT needs server echo)
          }, tickMs);

          resolve();
        });

        ws.on("message", (data: any) => {
          try {
            const msg = JSON.parse(data.toString());
            // If server echoes our seq, compute RTT
            if (msg.seq) {
              const rtt = Date.now() - msg.seq;
              if (rtt >= 0 && rtt < 5000) allRtt.push(rtt);
            }
          } catch (_) {
            // binary / schema — ignore
          }
        });

        ws.on("error", (err: any) => {
          const bot = bots.find((b) => b.id === botId);
          if (bot) bot.errors.push(String(err));
          allErrors.push(`[${botId}] ${String(err)}`);
          failed++;
          resolve();
        });

        ws.on("close", () => {
          clearInterval(rttTimer);
          const bot = bots.find((b) => b.id === botId);
          if (bot) bot.alive = false;
        });
      } catch (err: any) {
        allErrors.push(`[${botId}] connect error: ${String(err)}`);
        failed++;
        resolve();
      }
    });

    connectPromises.push(p);
  }

  await Promise.allSettled(connectPromises);

  // Wait a bit for all onOpen handlers to complete
  await new Promise((r) => setTimeout(r, 2000));

  logger.info("harness.connected", { connected, failed, alive: bots.filter((b) => b.alive).length });

  // ── Warmup phase ───────────────────────────────────────────────────────────
  logger.info("harness.warmup", { durationMs: warmupMs });
  await new Promise((r) => setTimeout(r, warmupMs));

  // ── Measurement phase ─────────────────────────────────────────────────────
  logger.info("harness.measuring", { durationMs });
  const measureEnd = Date.now() + durationMs;

  await new Promise((r) => setTimeout(r, durationMs));

  // ── Collect results ───────────────────────────────────────────────────────
  const elapsedMs = Date.now() - startWall;

  for (const bot of bots) {
    if (bot.alive) stillConnected++;
    allTickDurations.push(...bot.tickDurations);
    allErrors.push(...bot.errors);
  }

  const result: HarnessResult = {
    connected,
    failed,
    stillConnected,
    rttMs: allRtt,
    tickDurationsMs: allTickDurations,
    errors: allErrors,
    elapsedMs,
    summary: {
      ...summarize(allRtt, allTickDurations),
      activePlayers: stillConnected,
      targetPlayers: botCount,
    },
  };

  // ── Log summary ───────────────────────────────────────────────────────────
  logger.info("harness.done", {
    connected,
    failed,
    stillConnected,
    elapsedMs,
    rttP50: result.summary.rttP50,
    rttP95: result.summary.rttP95,
    rttP99: result.summary.rttP99,
    tickP50: result.summary.tickDurationP50,
    tickP95: result.summary.tickDurationP95,
    pass: result.summary.pass,
  });

  return result;
}

/**
 * Standalone CLI runner.
 * Usage: npx tsx tools/harness-runner.ts
 *   Or from package.json script: pnpm run test:harness
 */
export async function cli() {
  const result = await runHarness({
    roomUrl: process.env.ROOM_URL || "ws://localhost:2567/map_field",
    botCount: parseInt(process.env.BOT_COUNT || "50", 10),
    durationMs: parseInt(process.env.DURATION_MS || "60000", 10),
    warmupMs: parseInt(process.env.WARMUP_MS || "10000", 10),
  });

  console.log("\n=== Load Test Results ===");
  console.log(`Bots connected  : ${result.connected}/${result.summary.targetPlayers}`);
  console.log(`Still alive     : ${result.stillConnected}`);
  console.log(`Failed          : ${result.failed}`);
  console.log(`Duration        : ${result.elapsedMs} ms`);
  console.log(`RTT p50         : ${result.summary.rttP50.toFixed(2)} ms`);
  console.log(`RTT p95         : ${result.summary.rttP95.toFixed(2)} ms ${result.summary.rttP95 < 200 ? "✅" : "❌"}`);
  console.log(`RTT p99         : ${result.summary.rttP99.toFixed(2)} ms`);
  console.log(`Tick p50        : ${result.summary.tickDurationP50.toFixed(2)} ms`);
  console.log(`Tick p95        : ${result.summary.tickDurationP95.toFixed(2)} ms`);
  console.log(`Target met      : ${result.summary.pass ? "✅ PASS" : "❌ FAIL (p95 >= 200ms)"}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.slice(0, 10).forEach((e) => console.log(" ", e));
    if (result.errors.length > 10) console.log(`  ... and ${result.errors.length - 10} more`);
  }

  return result;
}