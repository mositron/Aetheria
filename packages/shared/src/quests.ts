import type { MonsterKind } from "./constants.js";

export type QuestObjective =
  | { kind: "kill"; monster: MonsterKind; count: number }
  | { kind: "collect"; itemId: string; count: number };

export type QuestReward = { exp: number; zeny: number; itemId?: string; qty?: number };

export type QuestDef = {
  id: string;
  name: string;
  desc: string;
  giver: string;       // NPC id
  turnIn: string;      // NPC id (often same as giver)
  minLevel: number;
  objective: QuestObjective;
  reward: QuestReward;
  next?: string;       // unlock chain
};

export const QUESTS: Record<string, QuestDef> = {
  q_slime_starter: {
    id: "q_slime_starter",
    name: "Slime Slayer",
    desc: "Mira asks you to thin out the slimes nearby.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 1,
    objective: { kind: "kill", monster: "slime", count: 5 },
    reward: { exp: 50, zeny: 150, itemId: "hp_potion", qty: 2 },
    next: "q_wolf_hunter",
  },
  q_wolf_hunter: {
    id: "q_wolf_hunter",
    name: "Wolf Hunter",
    desc: "Take down 3 wolves to prove your strength.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 3,
    objective: { kind: "kill", monster: "wolf", count: 3 },
    reward: { exp: 200, zeny: 500, itemId: "leather_armor", qty: 1 },
    next: "q_orc_challenge",
  },
  q_jelly_collect: {
    id: "q_jelly_collect",
    name: "Sticky Business",
    desc: "Bring 5 Slime Jellies to the scholar.",
    giver: "scholar_field",
    turnIn: "scholar_field",
    minLevel: 1,
    objective: { kind: "collect", itemId: "slime_jelly", count: 5 },
    reward: { exp: 80, zeny: 200 },
  },
  // ── Lv10+ chain: orc → dungeon preview → darklord finale ────────────────
  q_orc_challenge: {
    id: "q_orc_challenge",
    name: "Orc Threat",
    desc: "Hunt 5 Orc Warriors threatening the village outskirts.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 10,
    objective: { kind: "kill", monster: "orc", count: 5 },
    reward: { exp: 800, zeny: 1500, itemId: "mithril_sword", qty: 1 },
    next: "q_golem_trial",
  },
  q_golem_trial: {
    id: "q_golem_trial",
    name: "Stone Trial",
    desc: "Defeat 3 Stone Golems to earn the scholar's trust.",
    giver: "scholar_field",
    turnIn: "scholar_field",
    minLevel: 15,
    objective: { kind: "kill", monster: "golem", count: 3 },
    reward: { exp: 1500, zeny: 2500, itemId: "great_sword", qty: 1 },
    next: "q_crystal_gather",
  },
  q_crystal_gather: {
    id: "q_crystal_gather",
    name: "Crystal Researcher",
    desc: "Bring 5 Dark Crystals — the scholar studies their resonance.",
    giver: "scholar_field",
    turnIn: "scholar_field",
    minLevel: 20,
    objective: { kind: "collect", itemId: "dark_crystal", count: 5 },
    reward: { exp: 2500, zeny: 3500, itemId: "knight_armor", qty: 1 },
    next: "q_yeti_hunt",
  },
  q_yeti_hunt: {
    id: "q_yeti_hunt",
    name: "Snowfield Predator",
    desc: "Track down and slay 2 Yetis in the snow biome.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 25,
    objective: { kind: "kill", monster: "yeti", count: 2 },
    reward: { exp: 4000, zeny: 5000, itemId: "hp_potion", qty: 20 },
    next: "q_darklord_final",
  },
  q_darklord_final: {
    id: "q_darklord_final",
    name: "Dawn vs. Darkness",
    desc: "Slay the Dark Lord and bring peace. The blade awaits the worthy.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 30,
    objective: { kind: "kill", monster: "darklord", count: 1 },
    reward: { exp: 12000, zeny: 15000, itemId: "blade_of_dawn", qty: 1 },
  },
  // ── Lv25+ endgame dungeons ─────────────────────────────────────────────
  q_daily_dungeon: {
    id: "q_daily_dungeon",
    name: "Dungeon Descent",
    desc: "Slay 5 monsters in any dungeon.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 20,
    objective: { kind: "kill", monster: "shadow_wolf", count: 5 },
    reward: { exp: 1500, zeny: 800, itemId: "hp_potion", qty: 3 },
  },
  q_weekly_shadow: {
    id: "q_weekly_shadow",
    name: "Shadow Realm",
    desc: "Defeat the Shadow Lord in the Shadow Dungeon.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 25,
    objective: { kind: "kill", monster: "shadow_lord", count: 1 },
    reward: { exp: 5000, zeny: 3000, itemId: "shadow_cape", qty: 1 },
    next: "q_weekly_frost",
  },
  q_weekly_frost: {
    id: "q_weekly_frost",
    name: "Frost Peak",
    desc: "Defeat the Ice Giant in the Frost Dungeon.",
    giver: "merchant_field",
    turnIn: "merchant_field",
    minLevel: 28,
    objective: { kind: "kill", monster: "ice_giant", count: 1 },
    reward: { exp: 8000, zeny: 5000, itemId: "frost_blade", qty: 1 },
  },
};

export const QUESTS_BY_GIVER: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const q of Object.values(QUESTS)) {
    (out[q.giver] ||= []).push(q.id);
  }
  return out;
})();

// quest state stored on player
export type PlayerQuestState = {
  active: Record<string, number>;   // questId -> progress
  completed: string[];              // turned-in quest ids
};

export function emptyQuestState(): PlayerQuestState {
  return { active: {}, completed: [] };
}
