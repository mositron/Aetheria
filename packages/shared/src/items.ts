export type ItemSlot = "weapon" | "armor" | "consumable" | "material";

export type ItemQuality = "normal" | "superior" | "rare" | "masterwork" | "legendary";

export const QUALITY_COLORS: Record<ItemQuality, string> = {
  normal: "#9ca3af",      // gray
  superior: "#22c55e",    // green
  rare: "#3b82f6",        // blue
  masterwork: "#a855f7",  // purple
  legendary: "#f59e0b",  // amber/gold
};

export const QUALITY_NAMES: Record<ItemQuality, string> = {
  normal: "ธรรมดา",
  superior: "เหนือกว่า",
  rare: "หายาก",
  masterwork: "ช่างฝีมือ",
  legendary: "ตำนาน",
};

export interface PetSkillDef {
  id: string;
  name: string;
  icon: string;
  type: "passive";
  effect: Record<string, number>;
}

export const PET_SKILLS: Record<string, PetSkillDef> = {
  guard_dog:    { id: "guard_dog",    name: "Guard Dog",    icon: "🐕", type: "passive", effect: { atkBonus: 0.1 } },
  farmhand:     { id: "farmhand",     name: "Farmhand",     icon: "🐔", type: "passive", effect: { gatherBonus: 0.3 } },
  lucky_pet:    { id: "lucky_pet",    name: "Lucky",        icon: "🐈", type: "passive", effect: { dropBonus: 0.2 } },
  warrior_pet:  { id: "warrior_pet",  name: "Warrior Spirit",icon: "⚔️", type: "passive", effect: { atkBonus: 0.15, defBonus: 0.05 } },
  mage_pet:     { id: "mage_pet",     name: "Mage Spirit",   icon: "🧙", type: "passive", effect: { mpBonus: 0.25, mdefBonus: 0.1 } },
};

export const PET_EVOLUTIONS: Record<string, { chance: number; result: string; name: string }> = {
  chicken:  { chance: 0.05, result: "phoenix_chick",  name: "ลูกฟีนิกซ์" },
  pig:      { chance: 0.08, result: "truffle_pig",    name: "หมูทรัฟเฟิล" },
  cow:      { chance: 0.10, result: "golden_cow",      name: "วัวทอง" },
};

export type ItemDef = {
  id: string;
  name: string;
  slot: ItemSlot;
  /** Item type for validation — furniture/consumable/material/etc */
  itemType?: string;
  atk?: number;
  def?: number;
  hpRestore?: number;
  mpRestore?: number;
  hungerRestore?: number;
  thirstRestore?: number;
  staminaRestore?: number;
  /** When true, useItem teleports player to a random village coord. */
  recall?: boolean;
  stack?: number; // max stack (consumables/materials)
  icon?: string;  // emoji for now
  color?: string;
  quality?: ItemQuality;
  baseQuality?: ItemQuality; // for craftable items
};

export const ITEMS: Record<string, ItemDef> = {
  wood_sword:   { id: "wood_sword",   name: "Wooden Sword",   slot: "weapon", atk: 3,  icon: "🗡", color: "#a3a3a3" },
  iron_sword:   { id: "iron_sword",   name: "Iron Sword",     slot: "weapon", atk: 8,  icon: "⚔", color: "#cbd5e1" },
  apprentice_staff: { id: "apprentice_staff", name: "Apprentice Staff", slot: "weapon", atk: 5, icon: "🪄", color: "#c4b5fd" },
  leather_armor:{ id: "leather_armor",name: "Leather Armor",  slot: "armor",  def: 3,  icon: "🥋", color: "#a16207" },
  iron_armor:   { id: "iron_armor",   name: "Iron Armor",     slot: "armor",  def: 8,  icon: "🛡", color: "#94a3b8" },
  hp_potion:    { id: "hp_potion",    name: "HP Potion",      slot: "consumable", hpRestore: 40, stack: 99, icon: "🧪", color: "#ef4444" },
  mp_potion:    { id: "mp_potion",    name: "MP Potion",      slot: "consumable", mpRestore: 30, stack: 99, icon: "💙", color: "#3b82f6" },
  slime_jelly:  { id: "slime_jelly",  name: "Slime Jelly",    slot: "material", stack: 99, icon: "🟢", color: "#84cc16" },
  wolf_fang:    { id: "wolf_fang",    name: "Wolf Fang",      slot: "material", stack: 99, icon: "🦷", color: "#e5e7eb" },
  orc_tusk:     { id: "orc_tusk",     name: "Orc Tusk",       slot: "material", stack: 99, icon: "🦴", color: "#fef3c7" },
  dark_crystal: { id: "dark_crystal", name: "Dark Crystal",   slot: "material", stack: 99, icon: "🔮", color: "#a855f7" },
  // Mid-tier weapons (Lv15-25) — fill the gap between iron_sword (8 ATK) and blade_of_dawn (25 ATK)
  mithril_sword:{ id: "mithril_sword", name: "Mithril Sword",  slot: "weapon", atk: 14, icon: "🗡", color: "#7dd3fc" },
  great_sword:  { id: "great_sword",   name: "Great Sword",    slot: "weapon", atk: 18, icon: "⚔", color: "#94a3b8" },
  arcane_staff: { id: "arcane_staff",  name: "Arcane Staff",   slot: "weapon", atk: 12, icon: "🪄", color: "#a78bfa" },
  hunters_bow:  { id: "hunters_bow",   name: "Hunter's Bow",   slot: "weapon", atk: 13, icon: "🏹", color: "#92400e" },
  // Mid-tier armor (Lv15-25)
  chainmail:    { id: "chainmail",     name: "Chainmail",      slot: "armor",  def: 12, icon: "🥋", color: "#cbd5e1" },
  knight_armor: { id: "knight_armor",  name: "Knight Armor",   slot: "armor",  def: 15, icon: "🛡", color: "#64748b" },
  blade_of_dawn:{ id: "blade_of_dawn",name: "Blade of Dawn",  slot: "weapon", atk: 25, icon: "⚜", color: "#fbbf24" },
  dragon_plate: { id: "dragon_plate", name: "Dragon Plate",   slot: "armor",  def: 20, icon: "🐲", color: "#dc2626" },
  // food / drink — survival
  apple:        { id: "apple",        name: "Apple",          slot: "consumable", hungerRestore: 20, stack: 99, icon: "🍎", color: "#dc2626" },
  bread:        { id: "bread",        name: "Bread",          slot: "consumable", hungerRestore: 40, stack: 99, icon: "🍞", color: "#fbbf24" },
  cooked_meat:  { id: "cooked_meat",  name: "Cooked Meat",    slot: "consumable", hungerRestore: 60, hpRestore: 15, stack: 99, icon: "🍖", color: "#a16207" },
  water_flask:  { id: "water_flask",  name: "Water Flask",    slot: "consumable", thirstRestore: 50, stack: 99, icon: "💧", color: "#0ea5e9" },
  berry:        { id: "berry",        name: "Wild Berry",     slot: "consumable", hungerRestore: 8, thirstRestore: 6, stack: 99, icon: "🫐", color: "#7c3aed" },
  energy_tonic: { id: "energy_tonic", name: "Energy Tonic",   slot: "consumable", staminaRestore: 100, stack: 99, icon: "⚡", color: "#fde047" },
  // raw materials from gathering
  wood_log:     { id: "wood_log",     name: "Wood Log",       slot: "material", stack: 99, icon: "🪵", color: "#6b4226" },
  stone_chunk:  { id: "stone_chunk",  name: "Stone Chunk",    slot: "material", stack: 99, icon: "🪨", color: "#71717a" },
  raw_meat:     { id: "raw_meat",     name: "Raw Meat",       slot: "material", stack: 99, icon: "🥩", color: "#dc2626" },
  // fishing
  raw_fish:     { id: "raw_fish",     name: "Raw Fish",       slot: "material", stack: 99, icon: "🐟", color: "#60a5fa" },
  cooked_fish:  { id: "cooked_fish",  name: "Cooked Fish",    slot: "consumable", hungerRestore: 50, hpRestore: 10, stack: 99, icon: "🍣", color: "#f472b6" },
  seaweed:      { id: "seaweed",      name: "Seaweed",        slot: "material", stack: 99, icon: "🌿", color: "#16a34a" },
  rare_fish:    { id: "rare_fish",    name: "Rare Fish",      slot: "consumable", hungerRestore: 70, hpRestore: 30, stack: 99, icon: "🐠", color: "#a855f7" },
  // farming
  berry_seed:   { id: "berry_seed",   name: "Berry Seed",     slot: "material", stack: 99, icon: "🌱", color: "#84cc16" },
  // gathering tools — equip as weapon to gather faster
  wood_axe:     { id: "wood_axe",     name: "Wooden Axe",     slot: "weapon", atk: 2, icon: "🪓", color: "#a16207" },
  iron_pickaxe: { id: "iron_pickaxe", name: "Iron Pickaxe",   slot: "weapon", atk: 3, icon: "⛏", color: "#94a3b8" },
  // furniture (placed in/around your house)
  furniture_bed:    { id: "furniture_bed",    name: "เตียงน่ารัก",   slot: "material", stack: 9, icon: "🛏", color: "#fbcfe8" },
  furniture_lamp:   { id: "furniture_lamp",   name: "โคมไฟ",       slot: "material", stack: 9, icon: "💡", color: "#fde047" },
  furniture_chair:  { id: "furniture_chair",  name: "เก้าอี้",      slot: "material", stack: 9, icon: "🪑", color: "#a16207" },
  furniture_plant:  { id: "furniture_plant",  name: "ต้นไม้กระถาง",  slot: "material", stack: 9, icon: "🪴", color: "#4ade80" },
  furniture_rug:    { id: "furniture_rug",    name: "พรม",         slot: "material", stack: 9, icon: "🧶", color: "#f472b6" },
  // special toys
glider:           { id: "glider",           name: "Glider Cape", slot: "consumable", stack: 1, icon: "🪂", color: "#bae6fd" },
  gacha_box:        { id: "gacha_box",        name: "กล่องสุ่ม",     slot: "consumable", stack: 99, icon: "🎁", color: "#f472b6" },
  // mining materials
  iron_ore:     { id: "iron_ore",     name: "Iron Ore",       slot: "material", stack: 99, icon: "🪙", color: "#94a3b8" },
  crystal:      { id: "crystal",      name: "Magic Crystal",  slot: "material", stack: 99, icon: "💎", color: "#a855f7" },
// ── desert biome drops ────────────────────────────────────────────────────
  desert_pearl:   { id: "desert_pearl",   name: "ไข่มุกทะเลทราย",   slot: "material", stack: 99, icon: "🌕", color: "#fcd34d" },
  // ── snow biome drops ──────────────────────────────────────────────────────
  ice_crystal:    { id: "ice_crystal",    name: "ผลึกน้ำแข็ง",         slot: "material", stack: 99, icon: "💎", color: "#7dd3fc" },
  frozen_heart:   { id: "frozen_heart",   name: "หัวใจที่แข็งเย็น",   slot: "material", stack: 99, icon: "🧊", color: "#bae6fd" },
  snowman_nose:   { id: "snowman_nose",   name: "จมูกสโนว์แมน",       slot: "material", stack: 99, icon: "🥕", color: "#f97316" },
  winter_essence: { id: "winter_essence", name: "แก่นแห่งฤดูหนาว",   slot: "material", stack: 99, icon: "❄️", color: "#bfdbfe" },
  // ── swamp biome drops ────────────────────────────────────────────────────
  swamp_herb:     { id: "swamp_herb",     name: "สมุนไพรชุ่มชื้น",     slot: "material", stack: 99, icon: "🌿", color: "#84cc16" },
  serpent_scale:  { id: "serpent_scale",  name: "เกล็ดงู",              slot: "material", stack: 99, icon: "🐍", color: "#4a7c42" },
  serpent_venom:  { id: "serpent_venom",  name: "พิษงูบึ้ง",            slot: "material", stack: 99, icon: "💀", color: "#84cc16" },
  witch_hat:      { id: "witch_hat",      name: "หมวกแม่มด",            slot: "material", stack: 99, icon: "🎩", color: "#1a1a2e" },
  // ── dungeon rewards ─────────────────────────────────────────────────────
  shadow_cape:  { id: "shadow_cape",  name: "Shadow Cape",    slot: "armor",   def: 8,  icon: "🦇", color: "#7c3aed" },
  frost_blade:  { id: "frost_blade",  name: "Frost Blade",    slot: "weapon", atk: 18, icon: "🗡️", color: "#38bdf8" },
  dungeon_key:  { id: "dungeon_key",  name: "Dungeon Key",    slot: "material", stack: 99, icon: "🗝️", color: "#fbbf24" },
  // Wedding rings
  wedding_ring_m: { id: "wedding_ring_m", name: "แหวนแต่งงาน (ชาย)", slot: "armor", def: 1, icon: "💍", color: "#f59e0b" },
  wedding_ring_f: { id: "wedding_ring_f", name: "แหวนแต่งงาน (หญิง)", slot: "armor", def: 1, icon: "💍", color: "#f472b6" },
  // ── Seasonal items ──────────────────────────────────────────────────────────
  songkran_water:  { id: "songkran_water",  name: "น้ำสงกรานต์",    slot: "consumable", hpRestore: 20, mpRestore: 30, stack: 99, icon: "💦", color: "#7dd3fc" },
  xmas_ornament:   { id: "xmas_ornament",   name: "ออร์นาเมนต์",      slot: "material",   stack: 99, icon: "🎄", color: "#22c55e" },
  candy_cane:      { id: "candy_cane",       name: "ลูกชู้์",          slot: "consumable", hungerRestore: 30, stack: 99, icon: "🍬", color: "#ef4444" },
  pumpkin_lantern: { id: "pumpkin_lantern",  name: "โคมฟักทอง",      slot: "material",   stack: 99, icon: "🎃", color: "#f97316" },
  halloween_candy: { id: "halloween_candy", name: "ลูกอมฮาโลวีน",   slot: "consumable", staminaRestore: 50, stack: 99, icon: "🍭", color: "#a855f7" },
  krathong:        { id: "krathong",         name: "กระทง",           slot: "material",   stack: 99, icon: "🪘", color: "#fde68a" },
  // Recall stone — consumable warp to village. 60s cooldown enforced server-side.
  recall_stone:    { id: "recall_stone",     name: "หินอัญเชิญหมู่บ้าน", slot: "consumable", stack: 5,  icon: "🪨", color: "#a78bfa", recall: true },
  warp_stone:      { id: "warp_stone",       name: "หินวาร์ปอนันต์",    slot: "material",   stack: 1,  icon: "🌀", color: "#fbbf24" },
};

// Base-building structures — consumed when placed, appear as state.structures in the world
export const STRUCTURES: Record<string, ItemDef> = {
  struct_tent:   { id: "struct_tent",   name: "เต็นท์",       slot: "material", stack: 99, icon: "⛺", color: "#f97316" },
  struct_fence:  { id: "struct_fence",  name: "รั้วไม้",      slot: "material", stack: 99, icon: "🪵", color: "#92400e" },
  struct_torch:  { id: "struct_torch",  name: "คบเพลิง",      slot: "material", stack: 99, icon: "🔥", color: "#fb923c" },
  struct_sign:   { id: "struct_sign",   name: "ป้ายบอกทาง",   slot: "material", stack: 99, icon: "🪧", color: "#a16207" },
  struct_tower:  { id: "struct_tower",  name: "หอคอย",        slot: "material", stack: 99, icon: "🏰", color: "#64748b" },
  struct_barrel: { id: "struct_barrel", name: "ถังน้ำ",        slot: "material", stack: 99, icon: "🛢", color: "#a3a3a3" },
};

/** Item IDs that come from resource gathering (trees/rocks/bushes).
 *  Bots intentionally do NOT pick these up — only humans gather. */
export const GATHERED_RESOURCE_ITEMS = new Set<string>([
  "wood_log", "stone_chunk", "berry", "raw_meat", "raw_fish", "seaweed", "rare_fish", "berry_seed",
  "iron_ore", "crystal",
]);

export type DropEntry = { itemId: string; chance: number; min?: number; max?: number };

export const MONSTER_DROPS: Record<string, DropEntry[]> = {
  slime: [
    { itemId: "slime_jelly", chance: 0.8 },
    { itemId: "hp_potion", chance: 0.15 },
    { itemId: "wood_sword", chance: 0.05 },
  ],
  wolf: [
    { itemId: "wolf_fang", chance: 0.7 },
    { itemId: "hp_potion", chance: 0.25 },
    { itemId: "leather_armor", chance: 0.08 },
    { itemId: "iron_sword", chance: 0.03 },
  ],
  orc: [
    { itemId: "orc_tusk", chance: 0.6 },
    { itemId: "hp_potion", chance: 0.3 },
    { itemId: "iron_sword", chance: 0.1 },
    { itemId: "iron_armor", chance: 0.05 },
  ],
  tree_node: [
    { itemId: "wood_log", chance: 1.0, min: 2, max: 4 },
    { itemId: "apple", chance: 0.25 },
    { itemId: "berry", chance: 0.15 },
  ],
  rock_node: [
    { itemId: "stone_chunk", chance: 1.0, min: 2, max: 5 },
  ],
  berry_bush: [
    { itemId: "berry", chance: 1.0, min: 2, max: 4 },
    { itemId: "berry_seed", chance: 0.5 },
  ],
  ore_node: [
    { itemId: "iron_ore", chance: 1.0, min: 2, max: 4 },
    { itemId: "stone_chunk", chance: 0.5, min: 1, max: 2 },
  ],
  crystal_node: [
    { itemId: "crystal", chance: 1.0, min: 1, max: 2 },
    { itemId: "stone_chunk", chance: 0.7, min: 1, max: 3 },
    { itemId: "dark_crystal", chance: 0.1 },
  ],
  chicken: [
    { itemId: "raw_meat", chance: 0.9 },
    { itemId: "berry", chance: 0.3 },
  ],
  pig: [
    { itemId: "raw_meat", chance: 1.0, min: 1, max: 2 },
  ],
  cow: [
    { itemId: "raw_meat", chance: 1.0, min: 2, max: 4 },
    { itemId: "cooked_meat", chance: 0.1 },
  ],
  scorpion: [
    { itemId: "orc_tusk", chance: 0.3 },
    { itemId: "hp_potion", chance: 0.3 },
    { itemId: "stone_chunk", chance: 0.4 },
  ],
  yeti: [
    { itemId: "dark_crystal", chance: 0.4 },
    { itemId: "hp_potion", chance: 0.5 },
    { itemId: "mithril_sword", chance: 0.08 },
    { itemId: "chainmail", chance: 0.08 },
    { itemId: "arcane_staff", chance: 0.05 },
    { itemId: "hunters_bow", chance: 0.05 },
  ],
  darklord: [
    { itemId: "dark_crystal", chance: 1.0 },
    { itemId: "blade_of_dawn", chance: 0.5 },
    { itemId: "dragon_plate", chance: 0.5 },
    { itemId: "hp_potion", chance: 1.0, min: 5, max: 10 },
    { itemId: "gacha_box", chance: 1.0, min: 1, max: 2 },
    { itemId: "glider", chance: 0.2 },
  ],
  // ── new biome mobs ─────────────────────────────────────────────────────
  boar: [
    { itemId: "raw_meat", chance: 0.9, min: 1, max: 3 },
    { itemId: "leather_armor", chance: 0.05 },
    { itemId: "hp_potion", chance: 0.2 },
  ],
  spider: [
    { itemId: "wolf_fang", chance: 0.5 },     // reused for spider fangs
    { itemId: "berry", chance: 0.3 },
    { itemId: "mp_potion", chance: 0.25 },
  ],
  ghost: [
    { itemId: "dark_crystal", chance: 0.15 },
    { itemId: "mp_potion", chance: 0.4 },
    { itemId: "hp_potion", chance: 0.2 },
  ],
  bat: [
    { itemId: "wolf_fang", chance: 0.4 },
    { itemId: "berry", chance: 0.3 },
    { itemId: "mp_potion", chance: 0.2 },
  ],
golem: [
    { itemId: "stone_chunk", chance: 1.0, min: 3, max: 6 },
    { itemId: "crystal", chance: 0.6 },
    { itemId: "iron_ore", chance: 0.5, min: 1, max: 3 },
    { itemId: "great_sword", chance: 0.08 },
    { itemId: "knight_armor", chance: 0.05 },
  ],
  fox: [
    { itemId: "raw_meat", chance: 0.8 },
    { itemId: "wolf_fang", chance: 0.3 },
    { itemId: "berry", chance: 0.3 },
  ],
  // ── desert biome ─────────────────────────────────────────────────────────
  sand_worm: [
    { itemId: "iron_ore", chance: 0.25, min: 1, max: 2 },
    { itemId: "desert_pearl", chance: 0.08 },
    { itemId: "hp_potion", chance: 0.2 },
  ],
  scorpion_lord: [
    { itemId: "rare_fish", chance: 0.5 },
    { itemId: "dark_crystal", chance: 0.7 },
    { itemId: "zeny", chance: 0.8, min: 200, max: 500 },
    { itemId: "blade_of_dawn", chance: 0.05 },
    { itemId: "dragon_plate", chance: 0.05 },
    { itemId: "hp_potion", chance: 1.0, min: 5, max: 10 },
  ],
  // ── snow biome ───────────────────────────────────────────────────────────
  ice_wraith: [
    { itemId: "ice_crystal", chance: 0.3, min: 1, max: 2 },
    { itemId: "frozen_heart", chance: 0.1 },
    { itemId: "mp_potion", chance: 0.4 },
    { itemId: "crystal", chance: 0.25 },
  ],
  snowman_giant: [
    { itemId: "snowman_nose", chance: 0.6, min: 2, max: 4 },
    { itemId: "winter_essence", chance: 0.2 },
    { itemId: "hp_potion", chance: 0.8, min: 3, max: 6 },
    { itemId: "frost_blade", chance: 0.08 },
    { itemId: "chainmail", chance: 0.05 },
  ],
  // ── swamp biome ───────────────────────────────────────────────────────────
  bog_witch: [
    { itemId: "swamp_herb", chance: 0.35 },
    { itemId: "witch_hat", chance: 0.08 },
    { itemId: "magic_scroll", chance: 0.12 },
    { itemId: "mp_potion", chance: 0.25 },
  ],
  swamp_serpent: [
    { itemId: "serpent_scale", chance: 0.4 },
    { itemId: "serpent_venom", chance: 0.2 },
    { itemId: "rare_ring", chance: 0.03 },
    { itemId: "hp_potion", chance: 0.3 },
  ],
};
