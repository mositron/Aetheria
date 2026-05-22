import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runHarness, type HarnessResult } from "./LoadTestHarness.js";

describe.skip("LoadTestHarness", () => {
  // Skip by default — run manually or with `pnpm test:harness`
  // Requires a live server. Set ROOM_URL env var.

  const ROOM_URL = process.env.ROOM_URL || "ws://localhost:2567/map_field";
  const BOT_COUNT = parseInt(process.env.BOT_COUNT || "10", 10); // small count for CI

  let result: HarnessResult;

  beforeAll(async () => {
    result = await runHarness({
      roomUrl: ROOM_URL,
      botCount: BOT_COUNT,
      durationMs: 30_000,
      warmupMs: 5_000,
    });
  }, 60_000);

  it("connects bots successfully", () => {
    expect(result.connected).toBeGreaterThan(0);
    expect(result.failed).toBeLessThan(BOT_COUNT);
  });

  it("rtt p95 < 200 ms", () => {
    const rttP95 = result.summary.rttP95;
    expect(rttP95).toBeLessThan(200);
  });

  it("passes acceptance criteria", () => {
    expect(result.summary.pass).toBe(true);
  });

  it("no errors during test", () => {
    expect(result.errors).toHaveLength(0);
  });
});