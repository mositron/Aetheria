// Shared registry of solid obstacles in the scene (trees, houses, rocks, etc).
// Sources push their obstacles under a namespace so chunks can stream in/out
// without wiping village/structure obstacles.

type Obstacle = { x: number; z: number; r: number; jumpable?: boolean };

const SOURCES = new Map<string, Obstacle[]>();
let OBSTACLES: Obstacle[] = [];

function rebuild() {
  const all: Obstacle[] = [];
  for (const list of SOURCES.values()) for (const o of list) all.push(o);
  OBSTACLES = all;
}

/** Register or update obstacles belonging to a named source (replaces prev). */
export function registerObstacles(source: string, list: Obstacle[]) {
  SOURCES.set(source, list);
  rebuild();
}

/** Remove all obstacles owned by a source (chunk unload, etc). */
export function unregisterObstacles(source: string) {
  SOURCES.delete(source);
  rebuild();
}

// Back-compat: old "setObstacles" wipes everything and sets one bulk list.
export function setObstacles(list: Obstacle[]) {
  SOURCES.clear();
  SOURCES.set("__bulk__", list);
  rebuild();
}

export function addObstacle(o: Obstacle) {
  const list = SOURCES.get("__add__") ?? [];
  list.push(o);
  SOURCES.set("__add__", list);
  rebuild();
}

export function clearObstacles() {
  SOURCES.clear();
  OBSTACLES = [];
}

/** True if (x, z) is inside any solid obstacle. */
export function isBlocked(x: number, z: number): boolean {
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz < o.r * o.r) return true;
  }
  return false;
}

/** Return the obstacle blocking (x, z) — or null if free. */
export function obstacleAt(x: number, z: number): Obstacle | null {
  for (const o of OBSTACLES) {
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz < o.r * o.r) return o;
  }
  return null;
}
