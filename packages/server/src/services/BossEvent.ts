// Periodic boss spawn — runs every BOSS_INTERVAL_S (default 600).
// Pure scheduler: WorldRoom owns the actual spawnMonster + broadcast side
// effects; this service only decides WHEN and WHERE.

export const BOSS_INTERVAL_S = 600;
export const BOSS_RADIUS_RATIO = 0.6; // spawn at 60% of map half-size

export type BossDecision =
  | { kind: "spawn"; x: number; z: number; message: string }
  | { kind: "wait" };

export class BossEventScheduler {
  private acc = 0;
  private active = false;

  /** Advance timer by dt seconds. Returns a spawn decision (or wait). */
  tick(dt: number, mapHalfSize: number, isStillAlive: () => boolean): BossDecision {
    if (this.active) {
      // Don't restart timer until current boss is dead
      if (!isStillAlive()) this.active = false;
      return { kind: "wait" };
    }
    this.acc += dt;
    if (this.acc < BOSS_INTERVAL_S) return { kind: "wait" };
    this.acc = 0;
    this.active = true;
    const a = Math.random() * Math.PI * 2;
    const r = mapHalfSize * BOSS_RADIUS_RATIO;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return {
      kind: "spawn",
      x, z,
      message: `⚜ ผู้พิทักษ์เงา (Dark Lord) ปรากฏที่ (${x.toFixed(0)}, ${z.toFixed(0)})!`,
    };
  }

  /** For tests / save migration. */
  isActive(): boolean { return this.active; }
  forceClear(): void { this.active = false; this.acc = 0; }
  /** Seconds remaining until next spawn (0 if active or due). */
  nextSpawnIn(): number {
    if (this.active) return 0;
    return Math.max(0, BOSS_INTERVAL_S - this.acc);
  }
}
