// Shared type definitions for the Companion/Pal system in WorldRooms.

export type CompanionKind =
  | "pal_flame"   // attacker - deals extra damage
  | "pal_grass"   // defender - higher HP/def
  | "pal_aqua"    // support - heals owner
  | "pal_shock"   // attacker - fast attacks
  | "pal_earth";  // defender - taunts enemies

export type CompanionRole = "attacker" | "defender" | "support";

export type CompanionState = "idle" | "follow" | "combat";

export interface CompanionDef {
  kind: CompanionKind;
  name: string;        // display name
  emoji: string;
  role: CompanionRole;
  maxHp: number;
  atk: number;
  def: number;
  speed: number;       // movement speed multiplier
  range: number;       // attack range
  skillDesc: string;   // passive/active description
  tintHex: string;     // body color
}

// ── Companion definitions ──────────────────────────────────────────────────

export const COMPANIONS: Record<CompanionKind, CompanionDef> = {
  pal_flame: {
    kind: "pal_flame",
    name: "แดงวูบ",
    emoji: "🔥",
    role: "attacker",
    maxHp: 80,
    atk: 22,
    def: 5,
    speed: 1.3,
    range: 4.0,
    skillDesc: "โจมตีเร็ว +50% ความเสียหายไฟ",
    tintHex: "#ff6b35",
  },
  pal_grass: {
    kind: "pal_grass",
    name: "เขียวหนา",
    emoji: "🌿",
    role: "defender",
    maxHp: 140,
    atk: 12,
    def: 18,
    speed: 0.8,
    range: 2.0,
    skillDesc: "ดูดความเสียหาย +30% พลังป้องกัน",
    tintHex: "#52b788",
  },
  pal_aqua: {
    kind: "pal_aqua",
    name: "ฟ้าใส",
    emoji: "💧",
    role: "support",
    maxHp: 100,
    atk: 10,
    def: 10,
    speed: 1.1,
    range: 6.0,
    skillDesc: "ฟื้นฟู HP ให้เจ้านาย 5%/วิ",
    tintHex: "#4cc9f0",
  },
  pal_shock: {
    kind: "pal_shock",
    name: "สายฟ้า",
    emoji: "⚡",
    role: "attacker",
    maxHp: 70,
    atk: 28,
    def: 3,
    speed: 1.6,
    range: 5.0,
    skillDesc: "โจมตีเร็วมาก ทำให้ศัตรูติดเร็ว",
    tintHex: "#f9c74f",
  },
  pal_earth: {
    kind: "pal_earth",
    name: "หินแกร่ง",
    emoji: "🪨",
    role: "defender",
    maxHp: 180,
    atk: 8,
    def: 25,
    speed: 0.6,
    range: 1.5,
    skillDesc: "ลดความเสียหายที่เจ้านายได้รับ 20%",
    tintHex: "#bc6c25",
  },
};

// ── Player's companion inventory (stored in Character.companionsJson) ────

export interface OwnedCompanion {
  id: string;              // unique instance id
  kind: CompanionKind;
  nickname?: string;
  level: number;
  xp: number;              // current XP within level
  obtainedAt: number;     // timestamp
}

export const COMPANION_XP_PER_LEVEL = 200;
export const MAX_COMPANION_LEVEL = 30;

export function companionXpToNextLevel(level: number): number {
  return Math.floor(COMPANION_XP_PER_LEVEL * Math.pow(1.2, level - 1));
}

export function isCompanionMaxLevel(level: number): boolean {
  return level >= MAX_COMPANION_LEVEL;
}