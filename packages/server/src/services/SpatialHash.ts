// Chunk-based spatial hash for entity lookups.
//
// Replaces O(N × M) nearest-neighbor scans (e.g., "find nearest player to each
// monster every tick") with O(cells) where cells = nearby chunks only.
//
// CELL_SIZE is independent of the rendering chunk size — tune for AI range.
// Default 16m matches typical aggro ranges (5-10m).

const CELL_SIZE = 16;

export type SpatialEntity = {
  id: string;
  x: number;
  z: number;
};

export class SpatialHash<E extends SpatialEntity> {
  private buckets = new Map<string, Map<string, E>>();
  private locations = new Map<string, string>(); // entityId → cellKey (for cheap removal)

  private static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private cellOf(x: number, z: number): string {
    return SpatialHash.key(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE));
  }

  /** Insert or move an entity to its current (x,z). O(1). */
  update(e: E): void {
    const newKey = this.cellOf(e.x, e.z);
    const oldKey = this.locations.get(e.id);
    if (oldKey === newKey) {
      // Same cell — just update reference (x/z may still have shifted within cell)
      this.buckets.get(newKey)!.set(e.id, e);
      return;
    }
    if (oldKey) this.buckets.get(oldKey)?.delete(e.id);
    let bucket = this.buckets.get(newKey);
    if (!bucket) { bucket = new Map(); this.buckets.set(newKey, bucket); }
    bucket.set(e.id, e);
    this.locations.set(e.id, newKey);
  }

  /** Remove an entity. O(1). */
  remove(id: string): void {
    const key = this.locations.get(id);
    if (!key) return;
    this.buckets.get(key)?.delete(id);
    this.locations.delete(id);
  }

  /**
   * Return all entities within `radius` meters of (x,z).
   * Cost: O(cells touched × avg entities per cell).
   */
  queryRadius(x: number, z: number, radius: number): E[] {
    const cellRadius = Math.ceil(radius / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const out: E[] = [];
    const r2 = radius * radius;
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const bucket = this.buckets.get(SpatialHash.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const e of bucket.values()) {
          const ex = e.x - x, ez = e.z - z;
          if (ex * ex + ez * ez <= r2) out.push(e);
        }
      }
    }
    return out;
  }

  /** Nearest entity within `radius`, or null. */
  findNearest(x: number, z: number, radius: number, predicate?: (e: E) => boolean): { entity: E; distance: number } | null {
    const cellRadius = Math.ceil(radius / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    let bestE: E | null = null;
    let bestD2 = radius * radius;
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const bucket = this.buckets.get(SpatialHash.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const e of bucket.values()) {
          if (predicate && !predicate(e)) continue;
          const ex = e.x - x, ez = e.z - z;
          const d2 = ex * ex + ez * ez;
          if (d2 < bestD2) { bestD2 = d2; bestE = e; }
        }
      }
    }
    return bestE ? { entity: bestE, distance: Math.sqrt(bestD2) } : null;
  }

  size(): number { return this.locations.size; }

  clear(): void {
    this.buckets.clear();
    this.locations.clear();
  }
}
