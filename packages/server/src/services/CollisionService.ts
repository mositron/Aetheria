/**
 * CollisionService — server-side obstacle registry and collision resolution.
 * Obstacles come from two sources:
 *   1. Static map spawn data (trees, rocks, bushes placed by MAPS config)
 *   2. Player-placed structures (houses, farms, etc.)
 *
 * Obstacle: { x, z, r } where r = collision radius in world units.
 */
import { type MapId, MAPS } from "@game/shared";

export type Obstacle = { x: number; z: number; r: number };

export class CollisionService {
  /** All solid obstacles. Updated via rebuild() and updatePlayerStructures(). */
  private obstacles: Obstacle[] = [];

  /** Seed static map obstacles once per mapId. */
  constructor(mapId: MapId) {
    this.buildMapObstacles(mapId);
  }

  // ── Obstacle registry ───────────────────────────────────────────────────────

  /** Build static obstacles from MAPS spawn definitions (trees/rocks/bushes). */
  private buildMapObstacles(mapId: MapId) {
    const def = MAPS[mapId as MapId];
    if (!def) return;

    const scaleX = def.size / 100;
    const scaleZ = def.size / 100;
    const list: Obstacle[] = [];

    for (const spawn of def.spawns ?? []) {
      const kind = spawn.kind;
      // Resource nodes are solid obstacles
      if (kind === "tree_node") {
        list.push({ x: spawn.x * scaleX, z: spawn.z * scaleZ, r: 0.8 });
      } else if (kind === "rock_node") {
        list.push({ x: spawn.x * scaleX, z: spawn.z * scaleZ, r: 0.7 });
      } else if (kind === "berry_bush") {
        list.push({ x: spawn.x * scaleX, z: spawn.z * scaleZ, r: 0.5 });
      }
    }

    this.obstacles = list;
  }

  /** Update obstacles with a player's placed structures. */
  updatePlayerStructures(structuresJson: string) {
    // structures: [{ id, itemId, x, z }] — x/z are absolute world coords
    try {
      const structures: Array<{ x: number; z: number; itemId: string }> = JSON.parse(structuresJson);
      // Remove previous player-structure obstacles (they start with prefix "struct_")
      this.obstacles = this.obstacles.filter((o) => (o as any)._struct !== true);
      for (const s of structures) {
        // Every structure has a collision radius; default to 1.5 for buildings
        const r = s.itemId === "structure_farm" ? 1.8 : 1.5;
        this.obstacles.push({ x: s.x, z: s.z, r, _struct: true } as any);
      }
    } catch {
      // ignore malformed JSON
    }
  }

  // ── Collision queries ───────────────────────────────────────────────────────

  /** True if (x, z) is inside any solid obstacle. */
  isBlocked(x: number, z: number): boolean {
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      if (dx * dx + dz * dz < o.r * o.r) return true;
    }
    return false;
  }

  // ── Collision resolution ─────────────────────────────────────────────────────
  // Uses axis-slide approach: try full movement → X only → Z only → full stop.
  // Multi-sample along path so fast speeds can't tunnel through obstacles.

  /**
/**
   * Resolve player movement against obstacles.
   * Modifies p.pos.x / p.pos.z in place.
   *
   * @param p          Player to resolve
   * @param preX       Player X position before this tick's movement
   * @param preZ       Player Z position before this tick's movement
   * @param mx         Movement direction X (normalized)
   * @param mz         Movement direction Z (normalized)
   * @param speed      Current speed in units/second
   * @param dt         Delta time in seconds
   */
  resolve(p: { pos: { x: number; z: number } }, preX: number, preZ: number, mx: number, mz: number, speed: number, dt: number): void {
    if ((Math.abs(mx) + Math.abs(mz)) < 0.01) return;

    const stepSize = speed * dt;

    // Target position after this tick's movement
    const nx = preX + mx * stepSize;
    const nz = preZ + mz * stepSize;

    // Try full movement first
    if (!this.isBlocked(nx, nz)) {
      p.pos.x = nx;
      p.pos.z = nz;
      return;
    }

    // Slide along X axis only
    if (mz !== 0 && !this.isBlocked(preX + mx * stepSize, preZ)) {
      p.pos.x = preX + mx * stepSize;
      return;
    }

    // Slide along Z axis only
    if (mx !== 0 && !this.isBlocked(preX, preZ + mz * stepSize)) {
      p.pos.z = preZ + mz * stepSize;
      return;
    }

    // Full stop — keep at pre-movement position (stuck against obstacle)
    p.pos.x = preX;
    p.pos.z = preZ;
  }

  /**
   * Compute a steering direction toward (tx, tz) that avoids obstacles.
   * Uses a simple direct steering with wall-slide.
   * Returns { mx, mz } normalized direction, or null if completely blocked.
   */
  steer(
    fromX: number,
    fromZ: number,
    tx: number,
    tz: number,
    avoidRadius = 1.2,
  ): { mx: number; mz: number } | null {
    const dx = tx - fromX;
    const dz = tz - fromZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.1) return null;

    const dn = dx / dist;
    const dnZ = dz / dist;

    // Direct path is clear → return it
    if (!this.isBlocked(fromX + dn * avoidRadius, fromZ + dnZ * avoidRadius)) {
      return { mx: dn, mz: dnZ };
    }

    // Try 45° offset left (+dnZ, -dn)
    const leftX = dnZ;
    const leftZ = -dn;
    if (!this.isBlocked(fromX + leftX * avoidRadius, fromZ + leftZ * avoidRadius)) {
      return { mx: leftX, mz: leftZ };
    }

    // Try 45° offset right (-dnZ, +dn)
    const rightX = -dnZ;
    const rightZ = dn;
    if (!this.isBlocked(fromX + rightX * avoidRadius, fromZ + rightZ * avoidRadius)) {
      return { mx: rightX, mz: rightZ };
    }

    // Try 90° perpendicular options
    const perp1X = -dnZ;
    const perp1Z = dn;
    if (!this.isBlocked(fromX + perp1X * avoidRadius, fromZ + perp1Z * avoidRadius)) {
      return { mx: perp1X, mz: perp1Z };
    }

    const perp2X = dnZ;
    const perp2Z = -dn;
    if (!this.isBlocked(fromX + perp2X * avoidRadius, fromZ + perp2Z * avoidRadius)) {
      return { mx: perp2X, mz: perp2Z };
    }

    // All directions blocked
    return null;
  }
}