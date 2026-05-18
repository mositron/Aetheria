// Lightweight achievement / milestone tracker.
// Server keeps counters as a JSON blob per character; client renders progress.

export type AchievementDef = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** Counter key in player's progress object */
  counter: string;
  goal: number;
  /** Reward when first reaches goal */
  reward?: { zeny?: number; itemId?: string; qty?: number };
  /** Title unlocked along with the achievement */
  title?: string;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_kill",   icon: "🗡",  name: "ผู้กล้าฝึกหัด",  desc: "สังหารมอนสเตอร์ตัวแรก",          counter: "kills",       goal: 1,    reward: { zeny: 50 }, title: "ผู้กล้าฝึกหัด" },
  { id: "warrior",      icon: "⚔",   name: "นักรบ",         desc: "สังหารมอนสเตอร์ 50 ตัว",         counter: "kills",       goal: 50,   reward: { zeny: 500, itemId: "hp_potion", qty: 5 }, title: "นักรบ" },
  { id: "champion",     icon: "🏆",  name: "แชมป์",         desc: "สังหารมอนสเตอร์ 200 ตัว",        counter: "kills",       goal: 200,  reward: { zeny: 2000, itemId: "hp_potion", qty: 15 }, title: "🏆 แชมป์" },
  { id: "lumberjack",   icon: "🪵",  name: "ช่างไม้",       desc: "ตัดต้นไม้ 30 ครั้ง",              counter: "trees",       goal: 30,   reward: { zeny: 200 }, title: "🪵 คนตัดไม้" },
  { id: "miner",        icon: "⛏",   name: "นักขุดเหมือง",  desc: "ทุบหิน/แร่ 20 ครั้ง",             counter: "rocks",       goal: 20,   reward: { zeny: 300 }, title: "⛏ คนเหมือง" },
  { id: "angler",       icon: "🎣",  name: "นักตกปลา",      desc: "ตกปลา 20 ครั้ง",                  counter: "fishes",      goal: 20,   reward: { itemId: "rare_fish", qty: 2 }, title: "🎣 นักตกปลามือทอง" },
  { id: "chef",         icon: "🍞",  name: "กุ๊ก",          desc: "Craft อาหาร 10 ครั้ง",            counter: "cooks",       goal: 10,   reward: { itemId: "cooked_meat", qty: 5 }, title: "👨‍🍳 กุ๊ก" },
  { id: "smith",        icon: "🔨",  name: "ช่างตีเหล็ก",   desc: "Craft อาวุธ/ชุด 10 ครั้ง",        counter: "smiths",      goal: 10,   reward: { zeny: 500 }, title: "🔨 ช่างตีเหล็ก" },
  { id: "homeowner",    icon: "🏠",  name: "เจ้าของบ้าน",   desc: "สร้างบ้าน",                       counter: "house",       goal: 1,    reward: { zeny: 200 }, title: "🏠 เจ้าของบ้าน" },
  { id: "tamer",        icon: "🐎",  name: "นักเลี้ยงสัตว์", desc: "จับสัตว์เลี้ยง 3 ครั้ง",          counter: "tames",       goal: 3,    reward: { itemId: "berry", qty: 20 }, title: "🐾 ผู้เลี้ยงสัตว์" },
  { id: "farmer",       icon: "🌾",  name: "ชาวสวน",        desc: "เก็บเกี่ยวพืช 10 ครั้ง",           counter: "harvests",    goal: 10,   reward: { itemId: "berry_seed", qty: 10 }, title: "🌾 ชาวสวน" },
  { id: "explorer",     icon: "🗺",  name: "นักผจญภัย",     desc: "เยี่ยม 5 biomes",                  counter: "biomes",      goal: 5,    reward: { zeny: 300 }, title: "🗺 นักผจญภัย" },
  { id: "darklord",     icon: "⚜",   name: "ผู้พิชิตเงา",   desc: "ปราบ Dark Lord",                   counter: "darklord",    goal: 1,    reward: { zeny: 5000, itemId: "blade_of_dawn", qty: 1 }, title: "⚜ ผู้พิชิตเงา" },
];

export type AchievementProgress = {
  counters: Record<string, number>;
  unlocked: string[]; // achievement ids
};

export const emptyAchievementProgress = (): AchievementProgress => ({ counters: {}, unlocked: [] });
