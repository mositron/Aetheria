// Shared deterministic terrain — same heightmap used by StepTerrain rendering
// AND player movement, so visual matches physical.
//
//   getHeight(x, z)  → terrain Y at world position (steps quantized)
//   isWater(x, z)    → true if river/lake at position
//   waterLevelAt(x, z) → water surface Y (for swim)
//
// Center area (radius < INNER) is always flat at Y=0 (play zone).

const SEED = 1337;
const CELL = 2;
const STEP = 1.2;
const MAX_H = 12;
const INNER = 22;
const OUTER = 70;

// ── Deterministic value noise ────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const N = 64;
  const grid: number[] = [];
  for (let i = 0; i < N * N; i++) grid.push(rand());
  return (x: number, y: number) => {
    x = (x % N + N) % N;
    y = (y % N + N) % N;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = grid[(yi % N) * N + (xi % N)];
    const b = grid[(yi % N) * N + ((xi + 1) % N)];
    const c = grid[((yi + 1) % N) * N + (xi % N)];
    const d = grid[((yi + 1) % N) * N + ((xi + 1) % N)];
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

const _noise = makeNoise(SEED);
const _biomeNoise = makeNoise(SEED + 99);
const _riverNoise = makeNoise(SEED + 7777);

function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { v += a * n(x * f, y * f); f *= 2; a *= 0.5; }
  return v;
}

// ── River channel: a curving low-elevation valley through the field ─────────
// We carve a 2D path: y = sinPath(x) so the river snakes across the map.
function riverChannelOffset(x: number, z: number): number {
  // River runs roughly along z = sin(x*0.03)*8 + drift
  const drift = (fbm(_riverNoise, x * 0.04, 0, 2) - 0.5) * 14;
  const channelZ = Math.sin(x * 0.05) * 6 + drift;
  return Math.abs(z - channelZ);
}

const RIVER_WIDTH = 3.5;
const WATER_Y = -0.4;        // river surface elevation

export function isWater(x: number, z: number): boolean {
  const d = Math.hypot(x, z);
  if (d > OUTER + 2) return false;
  // Center plaza shouldn't be water
  if (d < 6) return false;
  return riverChannelOffset(x, z) < RIVER_WIDTH;
}

export function waterLevelAt(_x: number, _z: number): number {
  return WATER_Y;
}

// ── Terrain height ──────────────────────────────────────────────────────────
export function getHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);

  // Always flat in inner play radius
  if (d < INNER) {
    // unless on river
    if (isWater(x, z)) return WATER_Y;
    return 0;
  }

  if (d > OUTER) return 0;

  // River carves through terrain (lowest path)
  if (isWater(x, z)) return WATER_Y;

  // Falloff from inner ring outward
  const ramp = Math.min(1, (d - INNER) / 8);

  const nx = (x / CELL) * 0.08;
  const nz = (z / CELL) * 0.08;
  let h = fbm(_noise, nx, nz, 5);
  h = Math.pow(h, 1.4);
  h = h * MAX_H * ramp;
  h = Math.floor(h / STEP) * STEP;
  return Math.max(0, h);
}

// ── Biome value (for terrain color) ─────────────────────────────────────────
export function getBiomeValue(x: number, z: number): number {
  return fbm(_biomeNoise, x * 0.04, z * 0.04, 2);
}

// ── Step-walk check: can player walk from (fx,fz) to (tx,tz)? ───────────────
// Refuses if cliff drop/rise exceeds stepSize*2 (can't climb sheer cliff).
// Always allows movement in inner ring (flat play area).
export function canWalk(fx: number, fz: number, tx: number, tz: number): boolean {
  const fromD = Math.hypot(fx, fz);
  const toD = Math.hypot(tx, tz);
  if (fromD < INNER && toD < INNER) return true;
  const fromH = getHeight(fx, fz);
  const toH = getHeight(tx, tz);
  return Math.abs(toH - fromH) <= STEP * 2.5;
}

// ── Terrain config exported for renderer ────────────────────────────────────
export const TERRAIN_CONFIG = {
  SEED,
  CELL,
  STEP,
  MAX_H,
  INNER,
  OUTER,
  WATER_Y,
  RIVER_WIDTH,
};
