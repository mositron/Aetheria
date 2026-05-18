export type ItemSlot = "weapon" | "armor" | "consumable" | "material";

export type ItemDef = {
  id: string;
  name: string;
  slot: ItemSlot;
  atk?: number;
  def?: number;
  hpRestore?: number;
  mpRestore?: number;
  hungerRestore?: number;
  thirstRestore?: number;
  staminaRestore?: number;
  stack?: number; // max stack (consumables/materials)
  icon?: string;  // emoji for now
  color?: string;
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
    { itemId: "iron_sword", chance: 0.05 },
  ],
  darklord: [
    { itemId: "dark_crystal", chance: 1.0 },
    { itemId: "blade_of_dawn", chance: 0.5 },
    { itemId: "dragon_plate", chance: 0.5 },
    { itemId: "hp_potion", chance: 1.0, min: 5, max: 10 },
    { itemId: "gacha_box", chance: 1.0, min: 1, max: 2 },
    { itemId: "glider", chance: 0.2 },
  ],
};
