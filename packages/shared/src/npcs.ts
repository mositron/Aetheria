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
];
