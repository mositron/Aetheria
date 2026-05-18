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
