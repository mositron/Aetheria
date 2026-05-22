import type { MonsterKind } from "./constants.js";

export type MapId = "field" | "dungeon" | "dungeon_shadow" | "dungeon_frost";

export type SpawnPoint = { kind: MonsterKind; x: number; z: number };
export type Portal = { x: number; z: number; to: MapId; tx: number; tz: number };

export type WaterSource = { x: number; z: number; radius: number };

/** Dungeon definition for the Endless Tower system. */
export type DungeonSpawn = { kind: MonsterKind; count: number };
export type DungeonDef = {
  id: string;
  name: string;
  floor: number;
  biome: "dungeon";
  spawns: DungeonSpawn[];
  reward: { exp: number; zeny: number };
  nextFloor?: string;
};

/** Fixed house plots around the village. Player buys one slot from the carpenter. */
export const HOUSE_SLOTS: Array<{ x: number; z: number }> = [
  { x: 14, z: 0 }, { x: -14, z: 0 }, { x: 0, z: 14 }, { x: 0, z: -14 },
  { x: 10, z: 10 }, { x: -10, z: 10 }, { x: 10, z: -10 }, { x: -10, z: -10 },
];

export const HOUSE_COST = { wood_log: 20, stone_chunk: 10, zeny: 500 };

export type MapDef = {
  id: MapId;
  name: string;
  size: number;
  groundColor: string;
  spawns: SpawnPoint[];
  portals: Portal[];
  waters?: WaterSource[];
};

// PRNG so spawn placement is deterministic between server runs.
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Procedurally generate spawn points across biome regions.
 * Same seed = same layout every server start.
 */
function generateFieldSpawns(halfSize: number): SpawnPoint[] {
  const rand = rng(12345);
  const out: SpawnPoint[] = [];

  // Helper: place N spawns within a circular region
  function place(kind: MonsterKind, cx: number, cz: number, radius: number, count: number) {
    for (let i = 0; i < count; i++) {
      let x: number, z: number, tries = 0;
      do {
        const a = rand() * Math.PI * 2;
        const r = rand() * radius;
        x = cx + Math.cos(a) * r;
        z = cz + Math.sin(a) * r;
        tries++;
      } while (Math.hypot(x, z) < 14 && tries < 8); // keep village clear
      out.push({ kind, x: +x.toFixed(1), z: +z.toFixed(1) });
    }
  }

  // PLAINS (SW quadrant): easy slimes + cows/chickens
  place("slime", -halfSize * 0.4, halfSize * 0.4, 28, 6);
  place("slime", -halfSize * 0.55, halfSize * 0.25, 18, 3);
  place("berry_bush", -halfSize * 0.45, halfSize * 0.35, 22, 5);
  place("chicken", -halfSize * 0.3, halfSize * 0.3, 18, 5);
  place("cow", -halfSize * 0.5, halfSize * 0.4, 22, 4);

  // FOREST (NE quadrant): wolves + pigs + lots of trees
  place("wolf", halfSize * 0.4, -halfSize * 0.4, 26, 4);
  place("slime", halfSize * 0.5, -halfSize * 0.25, 20, 3);
  place("tree_node", halfSize * 0.4, -halfSize * 0.4, 30, 10);
  place("berry_bush", halfSize * 0.3, -halfSize * 0.3, 20, 4);
  place("pig", halfSize * 0.35, -halfSize * 0.35, 20, 4);

  // MOUNTAINS (NW): orcs + rocks
  place("orc", -halfSize * 0.45, -halfSize * 0.45, 22, 3);
  place("wolf", -halfSize * 0.5, -halfSize * 0.35, 18, 2);
  place("rock_node", -halfSize * 0.45, -halfSize * 0.45, 28, 10);

  // SE: lake + plains mix
  place("slime", halfSize * 0.5, halfSize * 0.55, 22, 4);
  place("tree_node", halfSize * 0.3, halfSize * 0.55, 18, 4);
  place("berry_bush", halfSize * 0.5, halfSize * 0.5, 22, 3);

  // WILDERNESS rim: tough mobs
  place("orc", -halfSize * 0.85, halfSize * 0.0, 12, 2);
  place("orc", halfSize * 0.85, halfSize * 0.0, 12, 2);
  place("wolf", 0, -halfSize * 0.85, 14, 3);
  place("wolf", 0, halfSize * 0.85, 14, 3);

// DESERT (SW area near -halfSize*0.5, -halfSize*0.65)
  place("scorpion", -halfSize * 0.5, -halfSize * 0.65, 16, 4);
  place("scorpion_lord", -halfSize * 0.5, -halfSize * 0.65, 16, 1);
  place("sand_worm", -halfSize * 0.5, -halfSize * 0.65, 18, 3);
  place("rock_node", -halfSize * 0.5, -halfSize * 0.65, 18, 4);

  // SNOW (NW corner near -halfSize*0.75, -halfSize*0.3)
  place("yeti", -halfSize * 0.75, -halfSize * 0.3, 14, 3);
  place("ice_wraith", -halfSize * 0.75, -halfSize * 0.3, 16, 4);
  place("snowman_giant", -halfSize * 0.75, -halfSize * 0.3, 16, 1);
  place("ore_node", -halfSize * 0.75, -halfSize * 0.3, 16, 3);

  // SWAMP (south-rim band z > halfSize * 0.6, x in [-30..30])
  place("bog_witch", 0, halfSize * 0.7, 14, 2);
  place("swamp_serpent", 0, halfSize * 0.7, 16, 3);

// ── Boss area ── deep wilderness
  out.push({ kind: "darklord", x: 0, z: -halfSize * 0.92 });

  // Near-spawn easy targets so new players have something to hit
  out.push({ kind: "slime", x: 14, z: 6 });
  out.push({ kind: "slime", x: -14, z: -6 });
  out.push({ kind: "tree_node", x: 16, z: -2 });
  out.push({ kind: "tree_node", x: -2, z: 16 });
  out.push({ kind: "rock_node", x: -16, z: -2 });
  out.push({ kind: "berry_bush", x: 0, z: -16 });
  out.push({ kind: "berry_bush", x: 8, z: 14 });

  return out;
}

const FIELD_SIZE = 200;

export const MAPS: Record<MapId, MapDef> = {
  field: {
    id: "field",
    name: "Aetheria — โลกเปิด",
    size: FIELD_SIZE,
    groundColor: "#1f6f3d",
    spawns: generateFieldSpawns(FIELD_SIZE / 2),
    portals: [
      // Pit portal to dungeon at NE edge (in forest biome)
      { x: FIELD_SIZE * 0.42, z: -FIELD_SIZE * 0.42, to: "dungeon", tx: -18, tz: 0 },
    ],
    // Water sources — must travel here to drink. Matches lake position in Environment.tsx
    waters: [
      { x: FIELD_SIZE * 0.4 / 2, z: FIELD_SIZE * 0.35 / 2, radius: FIELD_SIZE * 0.18 / 2 + 2 },
    ],
  },
  dungeon: {
    id: "dungeon",
    name: "Cavern of Shadows",
    size: 80,
    groundColor: "#2a1f3a",
    spawns: [
      { kind: "wolf", x: 0, z: 5 },
      { kind: "wolf", x: 10, z: -5 },
      { kind: "wolf", x: -8, z: 8 },
      { kind: "orc", x: 12, z: 15 },
      { kind: "orc", x: -14, z: -8 },
      { kind: "orc", x: 6, z: -14 },
      { kind: "orc", x: 20, z: 4 },
      { kind: "rock_node", x: -6, z: 10 },
      { kind: "rock_node", x: 14, z: -10 },
      { kind: "rock_node", x: -16, z: -4 },
      { kind: "ore_node", x: 8, z: 10 },
      { kind: "ore_node", x: -10, z: -10 },
      { kind: "ore_node", x: 18, z: 14 },
      { kind: "ore_node", x: -18, z: 12 },
      { kind: "crystal_node", x: 0, z: 14 },
      { kind: "crystal_node", x: -14, z: 18 },
      { kind: "crystal_node", x: 16, z: -16 },
      { kind: "darklord", x: 0, z: 25 },
    ],
    portals: [
      { x: -20, z: 0, to: "field", tx: FIELD_SIZE * 0.4, tz: -FIELD_SIZE * 0.4 },
    ],
  },
  dungeon_shadow: {
    id: "dungeon_shadow",
    name: "Shadow Dungeon",
    size: 90,
    groundColor: "#1a1028",
    spawns: [
      { kind: "shadow_wolf", x: -10, z: 8 },
      { kind: "shadow_wolf", x: 14, z: -4 },
      { kind: "shadow_wolf", x: -6, z: 14 },
      { kind: "shadow_wolf", x: 18, z: 6 },
      { kind: "shadow_wolf", x: -18, z: -8 },
      { kind: "shadow_wolf", x: 8, z: -14 },
      { kind: "shadow_wolf", x: -14, z: 12 },
      { kind: "shadow_wolf", x: 12, z: 10 },
      { kind: "shadow_lord", x: 0, z: 22 },
    ],
    portals: [
      { x: 0, z: 0, to: "field", tx: 0, tz: 0 },
],
  },
  dungeon_frost: {
    id: "dungeon_frost",
    name: "Frost Dungeon",
    size: 90,
    groundColor: "#1e3a5f",
    spawns: [
      { kind: "frost_spider", x: -12, z: 6 },
      { kind: "frost_spider", x: 16, z: -6 },
      { kind: "frost_spider", x: -8, z: 16 },
      { kind: "frost_spider", x: 14, z: 8 },
      { kind: "frost_spider", x: -18, z: -10 },
      { kind: "frost_spider", x: 6, z: -16 },
      { kind: "frost_spider", x: -16, z: 14 },
      { kind: "frost_spider", x: 10, z: 12 },
      { kind: "ice_giant", x: 0, z: 24 },
    ],
    portals: [
      { x: 0, z: 0, to: "field", tx: 0, tz: 0 },
    ],
  },
};

// ── ENDLESS TOWER DUNGEON SYSTEM ──

/** Procedural dungeon floor generator. */
export function generateDungeonFloor(floor: number): DungeonDef {
  const monsterPool: MonsterKind[] = ["ghost", "fox", "banshee", "orc", "skeleton_captain"];
  const bossChance = floor % 5 === 0;
  return {
    id: `endless_${floor}`,
    name: `Endless Tower - Floor ${floor}`,
    floor,
    biome: "dungeon",
    spawns: [
      { kind: monsterPool[floor % monsterPool.length], count: 3 + floor },
      ...(bossChance ? [{ kind: "shadow_lord" as MonsterKind, count: 1 }] : []),
    ],
    reward: { exp: 300 + floor * 200, zeny: 500 + floor * 300 },
    nextFloor: `endless_${floor + 1}`,
  };
}

/** Predefined first two floors + generate the rest up to floor 10. */
export const DUNGEONS: Record<string, DungeonDef> = {
  endless_1: {
    id: "endless_1",
    name: "Endless Tower - Floor 1",
    floor: 1,
    biome: "dungeon",
    spawns: [
      { kind: "slime", count: 5 },
      { kind: "boar", count: 3 },
    ],
    reward: { exp: 500, zeny: 1000 },
    nextFloor: "endless_2",
  },
  endless_2: {
    id: "endless_2",
    name: "Endless Tower - Floor 2",
    floor: 2,
    biome: "dungeon",
    spawns: [
      { kind: "bat", count: 6 },
      { kind: "spider", count: 4 },
      { kind: "golem", count: 1 },
    ],
    reward: { exp: 800, zeny: 2000 },
    nextFloor: "endless_3",
  },
  // Generate floors 3-10
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => {
      const floor = i + 3;
      return [generateDungeonFloor(floor).id, generateDungeonFloor(floor)];
    })
  ),
};
