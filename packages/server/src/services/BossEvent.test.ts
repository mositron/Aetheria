import { describe, it, expect } from "vitest";
import { BossEventScheduler, BOSS_INTERVAL_S } from "./BossEvent.js";

describe("BossEventScheduler", () => {
  it("waits until interval elapsed before spawning", () => {
    const sched = new BossEventScheduler();
    expect(sched.tick(100, 100, () => false).kind).toBe("wait");
    expect(sched.tick(100, 100, () => false).kind).toBe("wait");
    expect(sched.tick(BOSS_INTERVAL_S, 100, () => false).kind).toBe("spawn");
  });

  it("does not spawn again while a boss is still alive", () => {
    const sched = new BossEventScheduler();
    sched.tick(BOSS_INTERVAL_S, 100, () => false); // spawn
    const r = sched.tick(BOSS_INTERVAL_S, 100, () => true); // boss alive
    expect(r.kind).toBe("wait");
  });

  it("re-enables when boss dies and interval elapses again", () => {
    const sched = new BossEventScheduler();
    sched.tick(BOSS_INTERVAL_S, 100, () => false); // initial spawn
    sched.tick(1, 100, () => true);                // tick while alive
    sched.tick(1, 100, () => false);               // boss died — clears active
    expect(sched.isActive()).toBe(false);
    const r = sched.tick(BOSS_INTERVAL_S, 100, () => false);
    expect(r.kind).toBe("spawn");
  });

  it("spawn coords are within radius ratio of map size", () => {
    const sched = new BossEventScheduler();
    const r = sched.tick(BOSS_INTERVAL_S, 100, () => false);
    if (r.kind !== "spawn") throw new Error("expected spawn");
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(60, 0); // mapHalfSize 100 × 0.6
  });
});
