// Shared registry of solid obstacles in the scene (trees, houses, rocks, etc).
// Environment.tsx pushes positions on mount; Scene.tsx queries before sending
// movement input to block walking through them.

type Obstacle = { x: number; z: number; r: number; jumpable?: boolean };

let OBSTACLES: Obstacle[] = [];

export function setObstacles(list: Obstacle[]) {
  OBSTACLES = list;
}

export function addObstacle(o: Obstacle) {
  OBSTACLES.push(o);
}

export function clearObstacles() {
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
