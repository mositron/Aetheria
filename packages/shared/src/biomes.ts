// Biome regions for the open-world field map.
// Determines visual palette + which mobs/resources spawn where.

export type BiomeId = "plains" | "forest" | "mountains" | "lake" | "swamp" | "village" | "wilderness" | "desert" | "snow";

export type BiomeDef = {
  id: BiomeId;
  name: string;
  // 3-color palette: ground (base), accent (patches), trim (rim)
  ground: string;
  accent: string;
  trim: string;
};

export const BIOMES: Record<BiomeId, BiomeDef> = {
  plains:     { id: "plains",     name: "ทุ่งดอกไม้",   ground: "#86d96d", accent: "#a3e635", trim: "#65a30d" },
  forest:     { id: "forest",     name: "ป่ามหัศจรรย์", ground: "#4ade80", accent: "#86efac", trim: "#22c55e" },
  mountains:  { id: "mountains",  name: "ภูเขาหิน",     ground: "#a8a29e", accent: "#d6d3d1", trim: "#78716c" },
  lake:       { id: "lake",       name: "ทะเลสาบใส",   ground: "#7dd3fc", accent: "#bae6fd", trim: "#38bdf8" },
  swamp:      { id: "swamp",      name: "บึงเลน",       ground: "#a3a833", accent: "#bef264", trim: "#65803a" },
  village:    { id: "village",    name: "หมู่บ้าน",     ground: "#fbbf24", accent: "#fcd34d", trim: "#b45309" },
  wilderness: { id: "wilderness", name: "แดนลึกลับ",    ground: "#7c3aed", accent: "#a855f7", trim: "#581c87" },
  desert:     { id: "desert",     name: "ทะเลทราย",     ground: "#fde68a", accent: "#fcd34d", trim: "#d97706" },
  snow:       { id: "snow",       name: "ดินแดนหิมะ",   ground: "#f0f9ff", accent: "#dbeafe", trim: "#bfdbfe" },
};

/**
 * Pure-function biome lookup. Same (x,z) always returns the same biome.
 * Layout for the field map (half-size H, world spans [-H, H] on both axes):
 *
 *   wilderness (rim, r > 0.85 * H)
 *   ┌──────────────────────────────────────┐
 *   │  mountains (NW)        forest (NE)   │
 *   │       ─────────────────────          │
 *   │                                      │
 *   │       lake (small SE quadrant)       │
 *   │  plains (SW)           swamp (S-rim) │
 *   └──────────────────────────────────────┘
 *   village at center: r < 10 from (0,0)
 */
export function biomeAt(x: number, z: number, halfSize: number): BiomeId {
  const r = Math.hypot(x, z);
  if (r < 10) return "village";
  if (r > halfSize * 0.92) return "wilderness";

  // Lake: a roughly circular patch around (40, 35), radius 18
  if (Math.hypot(x - halfSize * 0.4, z - halfSize * 0.35) < halfSize * 0.18) return "lake";
  // Desert: a roughly circular patch around (-halfSize*0.5, -halfSize*0.65), radius 20
  if (Math.hypot(x - -halfSize * 0.5, z - -halfSize * 0.65) < halfSize * 0.22) return "desert";
  // Snow: top-left far corner
  if (Math.hypot(x - -halfSize * 0.75, z - -halfSize * 0.3) < halfSize * 0.18) return "snow";
  // Swamp: south-rim band (z > halfSize * 0.6, x in [-30..30])
  if (z > halfSize * 0.6 && Math.abs(x) < halfSize * 0.35) return "swamp";

  // Quadrants by sign
  if (x < 0 && z < 0) return "mountains";
  if (x > 0 && z < 0) return "forest";
  if (x < 0 && z > 0) return "plains";
  return "plains"; // SE plains-ish
}
