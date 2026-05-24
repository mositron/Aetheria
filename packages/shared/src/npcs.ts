import type { MapId } from "./maps.js";

export type NpcKind = "shop" | "quest" | "warp" | "info";

export type ShopEntry = { itemId: string; price: number };

export type NpcDef = {
  id: string;
  name: string;
  kind: NpcKind;
  mapId: MapId;
  x: number;
  z: number;
  color: string;
  icon: string;
  dialog: string;
  shop?: ShopEntry[];
  /** Optional branching dialog choices, rendered above the default
   *  Buy/Sell/Quests tabs. Each choice can have requires to gate visibility. */
  choices?: NpcChoice[];
};

/** A single branching dialog button on an NPC. */
export type NpcChoice = {
  text: string;
  requires?: {
    minLevel?: number;
    questActive?: string;
    questCompleted?: string;
    minZeny?: number;
  };
  action:
    | { kind: "system"; text: string }
    | { kind: "acceptQuest"; questId: string }
    | { kind: "warp"; mapId: string }
    | { kind: "close" };
};

export const SELL_RATIO = 0.5; // shops buy items at 50% sell price

export const NPCS: NpcDef[] = [
  {
    id: "tutor_field",
    name: "ผู้นำทาง Sera",
    kind: "info",
    mapId: "field",
    x: 0, z: -4,
    color: "#22d3ee",
    icon: "🎓",
    dialog: "ยินดีต้อนรับสู่ Aetheria!",
    choices: [
      { text: "🗺 วิธีเดิน + โจมตี", action: { kind: "system", text: "ใช้ WASD/ลูกศรเพื่อเดิน · คลิกมอนสเตอร์แล้วกด Space เพื่อโจมตี · กด I เพื่อเปิดกระเป๋า" } },
      { text: "⚔ การเปลี่ยนอาชีพ", action: { kind: "system", text: "ถึง Lv10 จะเปิดให้เปลี่ยนเป็น Swordsman/Mage/Archer/Acolyte/Thief · Lv30 เปิด 2nd-class · Lv50 เปิด 3rd-class" }, requires: { minLevel: 5 } },
      { text: "💰 หาเงินยังไง?", action: { kind: "system", text: "ล่ามอนสเตอร์ขายของ → ไป Merchant Mira · ทำเควสต์ → คุยกับ NPC ❗ · เก็บ Berry/Wood ขาย" } },
    ],
  },
  {
    id: "carpenter_field",
    name: "ช่างไม้ Bren",
    kind: "info",
    mapId: "field",
    x: 4, z: 3,
    color: "#a16207",
    icon: "🔨",
    dialog: "อยากได้บ้านสักหลังไหม? ต้องใช้: 🪵 ไม้ 20 + 🪨 หิน 10 + 💰 500 zeny",
  },
  {
    id: "merchant_field",
    name: "Merchant Mira",
    kind: "shop",
    mapId: "field",
    x: -5, z: -2,
    color: "#f59e0b",
    icon: "🛒",
    dialog: "Welcome traveler! Need supplies?",
    choices: [
      { text: "💎 มีของอะไรพิเศษไหม?", action: { kind: "system", text: "ของ rare หาได้จาก Auction House — กดไอคอน 🏛 ในเมนู" } },
      { text: "🔥 อยากเป็น VIP ลด 10%", action: { kind: "system", text: "ต้องใช้ 5000z เพื่อสมัครสมาชิก... แต่ตอนนี้ยังไม่เปิดให้บริการ!" }, requires: { minZeny: 5000 } },
    ],
    shop: [
      { itemId: "hp_potion",     price: 50 },
      { itemId: "wood_sword",    price: 200 },
      { itemId: "leather_armor", price: 300 },
      { itemId: "iron_sword",    price: 1500 },
      { itemId: "iron_armor",    price: 2200 },
    ],
  },
  {
    id: "scholar_field",
    name: "Scholar Reni",
    kind: "info",
    mapId: "field",
    x: 4, z: -3,
    color: "#a78bfa",
    icon: "📚",
    dialog: "The dungeon to the east hides stronger foes. Bring a healer!",
    choices: [
      { text: "📖 เรื่องเล่าของ Aetheria", action: { kind: "system", text: "นานมาแล้ว Dark Lord ปกครองแผ่นดินนี้ ตอนนี้เขากลับมาทุก ~10 นาที — เตรียมตัวให้พร้อม!" } },
      { text: "🏰 ดันเจี้ยนเงา", action: { kind: "system", text: "ใช้ Shadow Portal ทางตะวันออก · ต้องการ Lv 25+ · มี boss ทุก 10 floor" }, requires: { minLevel: 10 } },
      { text: "💍 แต่งงานทำยังไง?", action: { kind: "system", text: "ซื้อ wedding_ring จากร้าน · ใช้กับผู้เล่นอื่นเพื่อขอแต่งงาน · ทั้งคู่ต้องอยู่ Lv 20+" }, requires: { minLevel: 15 } },
    ],
  },
  {
    id: "guard_dungeon",
    name: "Dungeon Guard",
    kind: "info",
    mapId: "dungeon",
    x: -16, z: 2,
    color: "#94a3b8",
    icon: "🛡",
    dialog: "Careful in there. The boss only appears every so often.",
  },
  {
    id: "blacksmith_field",
    name: "Blacksmith Forge",
    kind: "info",
    mapId: "field",
    x: 6, z: 1,
    color: "#f97316",
    icon: "⚒️",
    dialog: "เวอร์ไม้ตีไม่ได้ — แต่ปั้มได้! วางอาวุธ/เกราะที่กระเป๋า แล้วกด Pay จ่ายเงิน 500z ต่อ +1 stat",
  },
{
    id: "waypoint_npc_field",
    name: "Waypoint Keeper",
    kind: "info",
    mapId: "field",
    x: -2, z: 3,
    color: "#22d3ee",
    icon: "🏛️",
    dialog: "เดินทางไกลไม่สะดวก? จ่าย 50z วาร์ปไปหมุดของคุณได้เลย! (กด M เปิดแผนที่)",
  },
  {
    id: "warp_shadow",
    name: "Shadow Portal",
    kind: "warp",
    mapId: "field",
    x: -2, z: -8,
    color: "#7c3aed",
    icon: "🌀",
    dialog: "Enter the Shadow Dungeon? Requires Lv 25.",
  },
  {
    id: "warp_frost",
    name: "Frost Portal",
    kind: "warp",
    mapId: "field",
    x: 2, z: -8,
    color: "#38bdf8",
    icon: "❄️",
    dialog: "Enter the Frost Dungeon? Requires Lv 28.",
  },
];
