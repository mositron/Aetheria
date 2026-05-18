// Godot's "groups" — tag-based entity registry + spatial index.
// O(1) add/remove, O(group_size) iteration, O(grid_cell) nearby queries.
//
//   groups.add("aggressive", monsterId);
//   groups.add("hostile", monsterId);
//   groups.move(monsterId, x, z);                       // update spatial grid
//   for (const id of groups.tagged("aggressive")) { ... }
//   for (const id of groups.nearby(px, pz, 30)) { ... } // within radius
//   for (const id of groups.nearbyTagged("aggressive", px, pz, 30)) { ... }

type Id = string;

export class Groups {
  private byTag = new Map<string, Set<Id>>();
  private byEntity = new Map<Id, Set<string>>();
  private pos = new Map<Id, { x: number; z: number; cell: number }>();
  private grid = new Map<number, Set<Id>>();
  private cellSize: number;

  constructor(cellSize = 16) { this.cellSize = cellSize; }

  // ── Tag operations ────────────────────────────────────────────────────────
  add(tag: string, id: Id): void {
    (this.byTag.get(tag) ?? this.byTag.set(tag, new Set()).get(tag)!).add(id);
    (this.byEntity.get(id) ?? this.byEntity.set(id, new Set()).get(id)!).add(tag);
  }

  remove(tag: string, id: Id): void {
    this.byTag.get(tag)?.delete(id);
    this.byEntity.get(id)?.delete(tag);
  }

  removeAll(id: Id): void {
    const tags = this.byEntity.get(id);
    if (tags) for (const t of tags) this.byTag.get(t)?.delete(id);
    this.byEntity.delete(id);
    const p = this.pos.get(id);
    if (p) this.grid.get(p.cell)?.delete(id);
    this.pos.delete(id);
  }

  has(tag: string, id: Id): boolean { return !!this.byTag.get(tag)?.has(id); }
  tagged(tag: string): Iterable<Id> { return this.byTag.get(tag) ?? EMPTY; }
  count(tag: string): number { return this.byTag.get(tag)?.size ?? 0; }
  tagsOf(id: Id): Iterable<string> { return this.byEntity.get(id) ?? EMPTY_STR; }

  // ── Spatial index ─────────────────────────────────────────────────────────
  private cellOf(x: number, z: number): number {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    // pack into single int (works up to ~32k×32k world)
    return (cx + 16384) * 32768 + (cz + 16384);
  }

  move(id: Id, x: number, z: number): void {
    const cell = this.cellOf(x, z);
    const prev = this.pos.get(id);
    if (prev?.cell === cell) { prev.x = x; prev.z = z; return; }
    if (prev) this.grid.get(prev.cell)?.delete(id);
    (this.grid.get(cell) ?? this.grid.set(cell, new Set()).get(cell)!).add(id);
    this.pos.set(id, { x, z, cell });
  }

  *nearby(x: number, z: number, radius: number): Iterable<Id> {
    const r2 = radius * radius;
    const cellR = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    for (let dx = -cellR; dx <= cellR; dx++) {
      for (let dz = -cellR; dz <= cellR; dz++) {
        const c = (cx + dx + 16384) * 32768 + (cz + dz + 16384);
        const ids = this.grid.get(c);
        if (!ids) continue;
        for (const id of ids) {
          const p = this.pos.get(id);
          if (!p) continue;
          const ddx = p.x - x, ddz = p.z - z;
          if (ddx * ddx + ddz * ddz <= r2) yield id;
        }
      }
    }
  }

  *nearbyTagged(tag: string, x: number, z: number, radius: number): Iterable<Id> {
    const tagged = this.byTag.get(tag);
    if (!tagged) return;
    for (const id of this.nearby(x, z, radius)) {
      if (tagged.has(id)) yield id;
    }
  }

  // Closest entity in a tag, optionally within radius. Returns null if none.
  closest(tag: string, x: number, z: number, maxRadius = Infinity): Id | null {
    let best: Id | null = null;
    let bestDist = maxRadius * maxRadius;
    for (const id of this.nearbyTagged(tag, x, z, isFinite(maxRadius) ? maxRadius : 64)) {
      const p = this.pos.get(id);
      if (!p) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDist) { bestDist = d; best = id; }
    }
    return best;
  }

  clear(): void { this.byTag.clear(); this.byEntity.clear(); this.pos.clear(); this.grid.clear(); }
}

const EMPTY: Set<Id> = new Set();
const EMPTY_STR: Set<string> = new Set();

// Common tag constants — keep typos at bay.
export const TAG = {
  PLAYER:      "player",
  MONSTER:     "monster",
  HOSTILE:     "hostile",       // attacks players
  PASSIVE:     "passive",       // doesn't attack
  BOSS:        "boss",
  ITEM_DROP:   "drop",
  NPC:         "npc",
  GATHERABLE:  "gatherable",
  BOT:         "bot",
} as const;
