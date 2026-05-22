// Crafting recipes — combine resources/materials into useful items.
// Recipes are validated server-side; client UI shows the list and lets you craft.

export type Recipe = {
  id: string;
  name: string;
  icon: string;
  category: "cooking" | "weapon" | "armor" | "potion";
  inputs: Array<{ itemId: string; qty: number }>;
  output: { itemId: string; qty: number };
  /** Minimum character level required */
  minLevel?: number;
  desc?: string;
  /** Minimum crafting bench tier required */
  minBenchTier?: number;
  /** Quality tier chances (bench bonus applied on top) */
  qualityChance?: {
    superior?: number;
    rare?: number;
    masterwork?: number;
    legendary?: number;
  };
  /** How this recipe is discovered */
  discoveryMethod?: "research" | "monster_drop" | "vendor" | "quest";
  /** Whether this recipe has been discovered by the player */
  discovered?: boolean;
};

export interface CraftingBench {
  id: string;
  name: string;
  nameTh: string;
  minTier: number; // 0=basic, 1=standard, 2=advanced, 3=master
  qualityBonus: number; // bonus to quality roll (0-0.4)
  speedBonus: number;   // craft time reduction (0-0.5)
}

export const CRAFTING_BENCHES: CraftingBench[] = [
  { id: "workbench",    name: "Workbench",    nameTh: "ม้าโต๊ะทำงาน",    minTier: 0, qualityBonus: 0,    speedBonus: 0 },
  { id: "forge",        name: "Forge",        nameTh: "เตาหลอม",           minTier: 1, qualityBonus: 0.1,  speedBonus: 0.1 },
  { id: "enchanter",    name: "Enchanter",    nameTh: "โต๊ะผูกเวทย์",       minTier: 2, qualityBonus: 0.2,  speedBonus: 0.2 },
  { id: "master_forge", name: "Master Forge", nameTh: "เตาหลอมปรมาจารย์",  minTier: 3, qualityBonus: 0.4,  speedBonus: 0.4 },
];

export const RECIPES: Recipe[] = [
  // ── COOKING ──
  {
    id: "recipe_cooked_meat",
    name: "เนื้อย่าง",
    icon: "🍖",
    category: "cooking",
    inputs: [
      { itemId: "raw_meat", qty: 1 },
      { itemId: "wood_log", qty: 1 },
    ],
    output: { itemId: "cooked_meat", qty: 1 },
    desc: "ย่างเนื้อดิบบนกองไฟ — หิว+60, HP+15",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_cooked_fish",
    name: "ปลาย่าง",
    icon: "🍣",
    category: "cooking",
    inputs: [
      { itemId: "raw_fish", qty: 1 },
      { itemId: "wood_log", qty: 1 },
    ],
    output: { itemId: "cooked_fish", qty: 1 },
    desc: "ย่างปลาบนเตา — หิว+50, HP+10",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_bread",
    name: "ขนมปัง",
    icon: "🍞",
    category: "cooking",
    inputs: [
      { itemId: "berry", qty: 6 },
      { itemId: "wood_log", qty: 1 },
    ],
    output: { itemId: "bread", qty: 1 },
    desc: "บดเบอร์รี่+อบ — หิว+40",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },

  // ── POTIONS ──
  {
    id: "recipe_hp_potion",
    name: "ยาฟื้น HP",
    icon: "🧪",
    category: "potion",
    inputs: [
      { itemId: "berry", qty: 4 },
      { itemId: "raw_meat", qty: 1 },
    ],
    output: { itemId: "hp_potion", qty: 1 },
    desc: "ตำเบอร์รี่+โปรตีน — HP+40",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_energy_tonic",
    name: "ยาชูกำลัง",
    icon: "⚡",
    category: "potion",
    inputs: [
      { itemId: "berry", qty: 5 },
      { itemId: "stone_chunk", qty: 1 },
    ],
    output: { itemId: "energy_tonic", qty: 1 },
    minLevel: 3,
    desc: "เพิ่ม Stamina +100",
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.03 },
    discoveryMethod: "vendor",
    discovered: true,
  },

  // ── WEAPONS ──
  {
    id: "recipe_wood_axe",
    name: "ขวานไม้",
    icon: "🪓",
    category: "weapon",
    inputs: [{ itemId: "wood_log", qty: 3 }],
    output: { itemId: "wood_axe", qty: 1 },
    desc: "ตัดต้นไม้เร็วขึ้น ×3",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_iron_pickaxe",
    name: "อีเหล็ก",
    icon: "⛏",
    category: "weapon",
    inputs: [{ itemId: "wood_log", qty: 2 }, { itemId: "stone_chunk", qty: 4 }],
    output: { itemId: "iron_pickaxe", qty: 1 },
    minLevel: 2,
    desc: "ทุบหิน/แร่เร็วขึ้น ×3",
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_wood_sword",
    name: "ดาบไม้",
    icon: "🗡",
    category: "weapon",
    inputs: [{ itemId: "wood_log", qty: 4 }],
    output: { itemId: "wood_sword", qty: 1 },
    desc: "เหลาไม้ให้แหลม — +3 ATK",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_iron_sword",
    name: "ดาบเหล็ก",
    icon: "⚔",
    category: "weapon",
    inputs: [
      { itemId: "wood_log", qty: 2 },
      { itemId: "stone_chunk", qty: 6 },
    ],
    output: { itemId: "iron_sword", qty: 1 },
    minLevel: 5,
    desc: "ตีเหล็กกับด้ามไม้ — +8 ATK",
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },

  // ── ARMOR ──
  {
    id: "recipe_leather_armor",
    name: "ชุดหนัง",
    icon: "🥋",
    category: "armor",
    inputs: [{ itemId: "raw_meat", qty: 6 }],
    output: { itemId: "leather_armor", qty: 1 },
    desc: "ฟอกหนังสัตว์ — +3 DEF",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  // ── FURNITURE ──
  {
    id: "recipe_furniture_bed",
    name: "เตียงน่ารัก",
    icon: "🛏",
    category: "armor",
    inputs: [{ itemId: "wood_log", qty: 6 }, { itemId: "berry", qty: 4 }],
    output: { itemId: "furniture_bed", qty: 1 },
    desc: "วางในบ้านของคุณ",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_furniture_lamp",
    name: "โคมไฟ",
    icon: "💡",
    category: "armor",
    inputs: [{ itemId: "wood_log", qty: 2 }, { itemId: "stone_chunk", qty: 1 }],
    output: { itemId: "furniture_lamp", qty: 1 },
    desc: "ส่องสว่างยามค่ำ",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_furniture_chair",
    name: "เก้าอี้",
    icon: "🪑",
    category: "armor",
    inputs: [{ itemId: "wood_log", qty: 4 }],
    output: { itemId: "furniture_chair", qty: 1 },
    desc: "นั่งพักได้",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_furniture_plant",
    name: "ต้นไม้กระถาง",
    icon: "🪴",
    category: "armor",
    inputs: [{ itemId: "berry_seed", qty: 2 }, { itemId: "stone_chunk", qty: 1 }],
    output: { itemId: "furniture_plant", qty: 1 },
    desc: "บ้านสีเขียวชื่นใจ",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  {
    id: "recipe_furniture_rug",
    name: "พรม",
    icon: "🧶",
    category: "armor",
    inputs: [{ itemId: "berry", qty: 8 }, { itemId: "wood_log", qty: 1 }],
    output: { itemId: "furniture_rug", qty: 1 },
    desc: "ตกแต่งพื้น",
    minBenchTier: 0,
    qualityChance: { superior: 0.3, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },

  {
    id: "recipe_iron_armor",
    name: "ชุดเหล็ก",
    icon: "🛡",
    category: "armor",
    inputs: [
      { itemId: "stone_chunk", qty: 10 },
      { itemId: "wood_log", qty: 2 },
    ],
    output: { itemId: "iron_armor", qty: 1 },
    minLevel: 7,
    desc: "ตีโลหะเป็นชุดเกราะ — +8 DEF",
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  // ── MP POTION (brewed from berry + crystal) ──
  {
    id: "recipe_mp_potion",
    name: "ยา MP",
    icon: "💙",
    category: "potion",
    inputs: [
      { itemId: "berry", qty: 3 },
      { itemId: "crystal", qty: 1 },
    ],
    output: { itemId: "mp_potion", qty: 2 },
    desc: "เบอร์รี่ + คริสตัล → ยาเติม MP",
    minLevel: 5,
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  // ── ENERGY TONIC v2 (from cooked meat + berry — alternate ingredients) ──
  {
    id: "recipe_energy_tonic_meat",
    name: "Energy Tonic (เนื้อ)",
    icon: "⚡",
    category: "potion",
    inputs: [
      { itemId: "cooked_meat", qty: 1 },
      { itemId: "berry", qty: 2 },
    ],
    output: { itemId: "energy_tonic", qty: 1 },
    desc: "เนื้อย่าง + เบอร์รี่ → ฟื้น stamina ทั้งหมด",
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.03 },
    discoveryMethod: "vendor",
    discovered: true,
  },
  // ── HP POTION v2 (cooked fish + crystal — alternate, Lv5 unlock) ──
  {
    id: "recipe_hp_potion_fish",
    name: "ยา HP (ปลา)",
    icon: "🧪",
    category: "potion",
    inputs: [
      { itemId: "cooked_fish", qty: 1 },
      { itemId: "crystal", qty: 1 },
    ],
    output: { itemId: "hp_potion", qty: 2 },
    desc: "ปลาย่าง + คริสตัล → ยาเติม HP",
    minLevel: 5,
    minBenchTier: 1,
    qualityChance: { superior: 0.25, rare: 0.05 },
    discoveryMethod: "vendor",
    discovered: true,
  },
];

export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
