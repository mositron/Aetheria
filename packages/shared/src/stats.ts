export type StatKey = "str" | "agi" | "vit" | "int" | "dex" | "luk";
export const STAT_KEYS: StatKey[] = ["str", "agi", "vit", "int", "dex", "luk"];

export const STAT_NAMES: Record<StatKey, string> = {
  str: "STR (melee atk)",
  agi: "AGI (aspd, flee)",
  vit: "VIT (max hp, def)",
  int: "INT (max mp, m.atk)",
  dex: "DEX (hit, cast)",
  luk: "LUK (crit, perfect)",
};

export const STAT_POINTS_PER_LEVEL = 3;

export type Stats = Record<StatKey, number>;

export const BASE_STATS: Stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 };

// derived
export function derived(stats: Stats, level: number) {
  const hpFromVit = stats.vit * 5;
  const mpFromInt = stats.int * 3;
  const defFromVit = Math.floor(stats.vit / 2);
  const mdefFromInt = Math.floor(stats.int / 2);
  // hit/flee
  const hit = level + stats.dex;
  const flee = level + stats.agi;
  // aspd: lower = faster cooldown. 1.0 at base, down to 0.4 at agi 100
  const aspdMult = Math.max(0.4, 1 - stats.agi * 0.006);
  // crit chance % = luk * 0.3 + 1
  const crit = Math.min(60, stats.luk * 0.3 + 1);
  // atk multipliers
  const atkBonus = stats.str;       // flat bonus added to weapon atk
  const matkBonus = stats.int * 1.5;
  return { hpFromVit, mpFromInt, defFromVit, mdefFromInt, hit, flee, aspdMult, crit, atkBonus, matkBonus };
}
