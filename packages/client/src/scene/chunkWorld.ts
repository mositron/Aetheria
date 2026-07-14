// Infinite procedural world. Deterministic from a seed: every client computes
// the same terrain for any (x, z). No global map size — chunks generated on
// demand around the player.
//
// Coordinate system:
//   • World units: world is unbounded in x/z (theoretically ±∞).
//   • CELL_SIZE = 2 units per height sample.
//   • CHUNK_CELLS = 16 → chunk = 32×32 units = 16×16 cells.
//
// Special region: SPAWN_RADIUS around origin is FLAT (Y = 0). The village
// sits inside it. Outside, terrain rises with noise-based heightmap and
// rivers carve valleys.

const SEED = 1337;
export const CELL_SIZE = 2;
export const CHUNK_CELLS = 16;
export const CHUNK_SIZE = CELL_SIZE * CHUNK_CELLS;     // 32 units
export const SPAWN_RADIUS = 18;                         // flat play area at origin
export const STEP = 1.2;                                // height quantization
export const MAX_HEIGHT = 18;                           // tallest peaks
export const WATER_Y = -0.4;
export const RIVER_WIDTH = 3.5;

// ── PRNG + value noise ──────────────────────────────────────────────────────
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
  const N = 256;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) grid[i] = rand();
  return (x: number, y: number) => {
    // Tile the noise so it's continuous over very large ranges.
    const wx = ((x % N) + N) % N;
    const wy = ((y % N) + N) % N;
    const xi = Math.floor(wx), yi = Math.floor(wy);
    const xf = wx - xi, yf = wy - yi;
    const a = grid[(yi % N) * N + (xi % N)];
    const b = grid[(yi % N) * N + ((xi + 1) % N)];
    const c = grid[((yi + 1) % N) * N + (xi % N)];
    const d = grid[((yi + 1) % N) * N + ((xi + 1) % N)];
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

const _heightNoise = makeNoise(SEED);
const _biomeNoise  = makeNoise(SEED + 99);
const _riverNoise  = makeNoise(SEED + 7777);
const _detailNoise = makeNoise(SEED + 31);

function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves = 5) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { v += a * n(x * f, y * f); f *= 2; a *= 0.5; }
  return v;
}

// ── Rivers: snaking valleys defined by sin + low-freq noise ─────────────────
// A river follows a path z = sin(x * k) * amp + drift(x). Width = RIVER_WIDTH.
function riverDistance(x: number, z: number): number {
  const drift = (fbm(_riverNoise, x * 0.012, 0, 2) - 0.5) * 22;
  const channelZ = Math.sin(x * 0.018) * 12 + drift;
  return Math.abs(z - channelZ);
}

export function isWater(x: number, z: number): boolean {
  // Spawn area never has water.
  if (Math.hypot(x, z) < SPAWN_RADIUS - 2) return false;
  return riverDistance(x, z) < RIVER_WIDTH;
}

const BANK_WIDTH = 1.6;
// 0 = normal ground, 1 = right at the water's edge. Smooth ramp used to blend
// a "wet ground" ring into terrain color instead of a hard grass/water cutoff.
export function bankFactor(x: number, z: number): number {
  if (Math.hypot(x, z) < SPAWN_RADIUS - 2) return 0;
  const edge = riverDistance(x, z) - RIVER_WIDTH;
  if (edge <= 0 || edge > BANK_WIDTH) return edge <= 0 ? 1 : 0;
  return 1 - edge / BANK_WIDTH;
}

// ── Terrain heightmap (works for any x, z) ──────────────────────────────────
export function getHeight(x: number, z: number): number {
  // Spawn area: perfectly flat
  const d = Math.hypot(x, z);
  if (d < SPAWN_RADIUS) {
    return isWater(x, z) ? WATER_Y : 0;
  }
  // River carves valleys everywhere outside spawn
  if (isWater(x, z)) return WATER_Y;

  // Soft falloff at spawn ring so terrain doesn't pop up suddenly
  const ramp = Math.min(1, (d - SPAWN_RADIUS) / 10);

  const nx = (x / CELL_SIZE) * 0.05;
  const nz = (z / CELL_SIZE) * 0.05;
  let h = fbm(_heightNoise, nx, nz, 5);
  h = Math.pow(h, 1.5);                  // emphasize peaks vs valleys
  h = h * MAX_HEIGHT * ramp;
  h = Math.floor(h / STEP) * STEP;
  return Math.max(0, h);
}

// World-unit spacing between terrain MESH vertices — coarser than CELL_SIZE
// on purpose (perf: sampling every cell was ~4x more getHeight/getBiome/color
// evaluations per chunk than a still-smooth stylized look needs). Exported so
// ChunkedTerrain.tsx's mesh builder and getSmoothHeight() below always sample
// the exact same lattice — if they drifted apart, grass/decor would float
// above or sink into the ground again on slopes.
export const TERRAIN_MESH_STEP = CELL_SIZE * 2; // 4 units

// Bilinear-interpolated height matching the actual surface the terrain mesh
// renders. getHeight() itself is a discrete step function (quantized by
// STEP) — sampling it directly at an arbitrary (x,z), like decor placement
// does, can land on a different terrace step than the mesh surface
// interpolates to at that same point on a slope, making grass/trees/rocks
// appear to float above or sink into the ground (worse the steeper the
// slope — this is what made grass look like it was "constantly shifting" as
// the camera moved). Use this for any visual Y-placement that needs to hug
// the rendered ground; getHeight() stays as-is for collision/movement-step
// gating, where the discrete steps are the intended "can I step up this
// ledge" behavior.
export function getSmoothHeight(x: number, z: number): number {
  const step = TERRAIN_MESH_STEP;
  const gx = Math.floor(x / step) * step;
  const gz = Math.floor(z / step) * step;
  const tx = (x - gx) / step;
  const tz = (z - gz) / step;
  const h00 = getHeight(gx, gz);
  const h10 = getHeight(gx + step, gz);
  const h01 = getHeight(gx, gz + step);
  const h11 = getHeight(gx + step, gz + step);
  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * tz;
}

export function getBiomeValue(x: number, z: number): number {
  return fbm(_biomeNoise, x * 0.03, z * 0.03, 2);
}

// Coarse biome classification — slow-changing zones, deterministic per (x, z).
export type Biome = "plains" | "forest" | "desert" | "snow" | "swamp";
export function getBiome(x: number, z: number): Biome {
  // Use a second very-low-freq noise layer for biome cells; combine with
  // distance from origin so far chunks tend toward more extreme biomes.
  const n = fbm(_biomeNoise, x * 0.006, z * 0.006, 3);
  const d = Math.hypot(x, z);
  const farFactor = Math.min(1, d / 250);     // 0 near spawn → 1 far
  if (n < 0.30) return farFactor > 0.5 ? "snow" : "plains";
  if (n < 0.50) return "forest";
  if (n < 0.70) return "plains";
  if (n < 0.85) return farFactor > 0.4 ? "desert" : "plains";
  return "swamp";
}

export function canWalk(fx: number, fz: number, tx: number, tz: number): boolean {
  return Math.abs(getHeight(tx, tz) - getHeight(fx, fz)) <= STEP;
}

// ── Per-chunk deterministic decor (trees/rocks/bushes) ──────────────────────
// Stable per (chunkX, chunkZ): same chunk always has same content on every client.
export type ChunkDecor = {
  trees: Array<{ x: number; z: number; scale: number; rot: number }>;
  rocks: Array<{ x: number; z: number; scale: number; rot: number }>;
  bushes: Array<{ x: number; z: number; scale: number; rot: number }>;
};

export function getChunkDecor(chunkX: number, chunkZ: number): ChunkDecor {
  // Deterministic per-chunk seed
  const seed = (chunkX * 73856093) ^ (chunkZ * 19349663) ^ SEED;
  const rand = mulberry32(seed);

  const trees: ChunkDecor["trees"] = [];
  const rocks: ChunkDecor["rocks"] = [];
  const bushes: ChunkDecor["bushes"] = [];

  const baseX = chunkX * CHUNK_SIZE;
  const baseZ = chunkZ * CHUNK_SIZE;
  // ~12-25 decor per chunk depending on biome
  const tries = 18 + Math.floor(rand() * 12);

  for (let i = 0; i < tries; i++) {
    const x = baseX + rand() * CHUNK_SIZE;
    const z = baseZ + rand() * CHUNK_SIZE;

    // Never place decor in spawn ring (keep it clean), on water, or on steep cliffs.
    if (Math.hypot(x, z) < SPAWN_RADIUS) continue;
    if (isWater(x, z)) continue;
    const h = getHeight(x, z);

    const biome = getBiomeValue(x, z);
    const r = rand();
    const rot = Math.floor(rand() * 4) * (Math.PI / 2);

    if (h > MAX_HEIGHT * 0.6) {
      // Peaks: mostly rocks, few stunted trees
      if (r < 0.7) rocks.push({ x, z, scale: 0.8 + rand() * 0.8, rot });
      else if (r < 0.9) trees.push({ x, z, scale: 0.6 + rand() * 0.3, rot });
    } else if (biome < 0.4) {
      // Forest biome: lots of trees
      if (r < 0.65) trees.push({ x, z, scale: 0.9 + rand() * 0.5, rot });
      else if (r < 0.85) bushes.push({ x, z, scale: 0.7 + rand() * 0.4, rot });
      else rocks.push({ x, z, scale: 0.5 + rand() * 0.4, rot });
    } else {
      // Plains: mix of everything
      if (r < 0.35) trees.push({ x, z, scale: 0.8 + rand() * 0.5, rot });
      else if (r < 0.6) bushes.push({ x, z, scale: 0.7 + rand() * 0.3, rot });
      else if (r < 0.85) rocks.push({ x, z, scale: 0.5 + rand() * 0.4, rot });
    }
  }
  return { trees, rocks, bushes };
}

// ── Per-chunk deterministic grass blades ─────────────────────────────────────
// Cheap crossed-billboard grass, seeded identically to decor so it's stable
// per (chunkX, chunkZ) across clients. Only placed on flat plains/forest —
// mountains/desert/snow/swamp stay bare per the existing decor mix.
export type GrassBlade = { x: number; z: number; scale: number; rot: number };

export function getChunkGrass(chunkX: number, chunkZ: number): GrassBlade[] {
  const seed = (chunkX * 928371) ^ (chunkZ * 123457) ^ (SEED + 555);
  const rand = mulberry32(seed);
  const baseX = chunkX * CHUNK_SIZE;
  const baseZ = chunkZ * CHUNK_SIZE;
  const blades: GrassBlade[] = [];
  const tries = 70 + Math.floor(rand() * 40);

  for (let i = 0; i < tries; i++) {
    const x = baseX + rand() * CHUNK_SIZE;
    const z = baseZ + rand() * CHUNK_SIZE;
    if (Math.hypot(x, z) < SPAWN_RADIUS) continue;
    if (isWater(x, z)) continue;
    if (bankFactor(x, z) > 0) continue; // keep the wet bank clear of grass
    const h = getHeight(x, z);
    if (h > MAX_HEIGHT * 0.4) continue; // no grass on rocky highlands
    const biome = getBiome(x, z);
    if (biome !== "plains" && biome !== "forest") continue;
    blades.push({ x, z, scale: 0.6 + rand() * 0.6, rot: rand() * Math.PI * 2 });
  }
  return blades;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number } {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cz: Math.floor(z / CHUNK_SIZE),
  };
}

// Backward-compat exports for terrain.ts users
export const TERRAIN_CONFIG = {
  SEED, CELL: CELL_SIZE, STEP, MAX_H: MAX_HEIGHT,
  INNER: SPAWN_RADIUS, OUTER: Infinity,
  WATER_Y, RIVER_WIDTH,
};
