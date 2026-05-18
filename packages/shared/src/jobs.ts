export type JobId =
  | "novice"
  | "swordsman" | "mage" | "archer" | "acolyte" | "thief"
  | "knight" | "wizard" | "sniper" | "priest" | "assassin";

export type SkillStatusEffect = {
  kind: "poison" | "burn" | "stun" | "freeze" | "slow" | "regen";
  durationMs: number;
  chance?: number; // 0..1, default 1
};

export type SkillDef = {
  id: string;
  name: string;
  manaCost: number;
  cooldownMs: number;
  range: number;
  damageMult: number;
  aoeRadius?: number;
  hotkey: number;
  icon: string;
  desc: string;
  status?: SkillStatusEffect;     // apply status to target
  selfStatus?: SkillStatusEffect; // apply status to self (e.g. heal regen)
  healMult?: number;              // if set, treats as heal on self/ally instead of damage
};

export type JobDef = {
  id: JobId;
  name: string;
  hpPerLevel: number;
  atkPerLevel: number;
  baseMaxMp: number;
  mpPerLevel: number;
  skills: SkillDef[];
};

export const JOBS: Record<JobId, JobDef> = {
  novice: {
    id: "novice",
    name: "Novice",
    hpPerLevel: 20,
    atkPerLevel: 3,
    baseMaxMp: 20,
    mpPerLevel: 2,
    skills: [],
  },
  swordsman: {
    id: "swordsman",
    name: "Swordsman",
    hpPerLevel: 30,
    atkPerLevel: 5,
    baseMaxMp: 30,
    mpPerLevel: 2,
    skills: [
      { id: "bash",        name: "Bash",        manaCost: 5,  cooldownMs: 1500, range: 2.5, damageMult: 1.8, hotkey: 1, icon: "💥", desc: "Heavy single hit (×1.8)" },
      { id: "whirlwind",   name: "Whirlwind",   manaCost: 12, cooldownMs: 4000, range: 3,   damageMult: 1.2, aoeRadius: 3, hotkey: 2, icon: "🌀", desc: "AoE around target (×1.2)" },
      { id: "provoke",     name: "Provoke",     manaCost: 8,  cooldownMs: 6000, range: 4,   damageMult: 1.5, hotkey: 3, icon: "😡", desc: "Heavy taunt hit (×1.5)" },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    hpPerLevel: 12,
    atkPerLevel: 2,
    baseMaxMp: 60,
    mpPerLevel: 8,
    skills: [
      { id: "firebolt",    name: "Firebolt",    manaCost: 8,  cooldownMs: 1200, range: 8, damageMult: 2.2, hotkey: 1, icon: "🔥", desc: "Fire dmg + Burn 3s",
        status: { kind: "burn", durationMs: 3000 } },
      { id: "frost_nova",  name: "Frost Nova",  manaCost: 18, cooldownMs: 5000, range: 6, damageMult: 1.6, aoeRadius: 3.5, hotkey: 2, icon: "❄️", desc: "AoE + Freeze 1.5s",
        status: { kind: "freeze", durationMs: 1500 } },
      { id: "thunder_bolt", name: "Thunder Bolt", manaCost: 14, cooldownMs: 2200, range: 7, damageMult: 2.6, hotkey: 3, icon: "⚡", desc: "Stun chance 25%",
        status: { kind: "stun", durationMs: 1200, chance: 0.25 } },
    ],
  },
  archer: {
    id: "archer",
    name: "Archer",
    hpPerLevel: 18,
    atkPerLevel: 4,
    baseMaxMp: 40,
    mpPerLevel: 3,
    skills: [
      { id: "arrow_shot",  name: "Arrow Shot",  manaCost: 4,  cooldownMs: 800,  range: 12, damageMult: 1.5, hotkey: 1, icon: "🏹", desc: "Ranged shot (×1.5)" },
      { id: "double_strafe", name: "Double Strafe", manaCost: 10, cooldownMs: 2500, range: 10, damageMult: 2.4, hotkey: 2, icon: "💢", desc: "Heavy shot (×2.4)" },
      { id: "ankle_snare",  name: "Ankle Snare",  manaCost: 8, cooldownMs: 4000, range: 9, damageMult: 1.2, hotkey: 3, icon: "🪢", desc: "Slow target (3s)",
        status: { kind: "freeze", durationMs: 3000 } },
    ],
  },
  acolyte: {
    id: "acolyte",
    name: "Acolyte",
    hpPerLevel: 22,
    atkPerLevel: 3,
    baseMaxMp: 55,
    mpPerLevel: 6,
    skills: [
      { id: "heal",        name: "Heal",        manaCost: 12, cooldownMs: 1500, range: 0,  damageMult: 0,   hotkey: 1, icon: "💚", desc: "Heal self + Regen 5s",
        healMult: 2.0, selfStatus: { kind: "regen", durationMs: 5000 } },
      { id: "holy_smite",  name: "Holy Smite",  manaCost: 10, cooldownMs: 2000, range: 6, damageMult: 1.8, hotkey: 2, icon: "🌟", desc: "Holy dmg + Stun 1s",
        status: { kind: "stun", durationMs: 1000, chance: 0.5 } },
      { id: "blessing",    name: "Blessing",    manaCost: 16, cooldownMs: 15000, range: 0, damageMult: 0, healMult: 0, hotkey: 3, icon: "🕊", desc: "Regen 15s",
        selfStatus: { kind: "regen", durationMs: 15000 } },
    ],
  },
  thief: {
    id: "thief",
    name: "Thief",
    hpPerLevel: 16,
    atkPerLevel: 4,
    baseMaxMp: 30,
    mpPerLevel: 2,
    skills: [
      { id: "envenom",     name: "Envenom",     manaCost: 5,  cooldownMs: 1200, range: 2.5, damageMult: 1.4, hotkey: 1, icon: "🐍", desc: "Hit + Poison 5s",
        status: { kind: "poison", durationMs: 5000 } },
      { id: "back_slide",  name: "Back Slide",  manaCost: 0,  cooldownMs: 800,  range: 2.5, damageMult: 2.5, hotkey: 2, icon: "🗡", desc: "Burst attack (×2.5)" },
      { id: "smoke_blast", name: "Smoke Blast", manaCost: 10, cooldownMs: 6000, range: 3, damageMult: 1.8, aoeRadius: 2.5, hotkey: 3, icon: "💨", desc: "AoE strike + brief blind",
        status: { kind: "stun", durationMs: 800 } },
    ],
  },
  // ── 2ND-CLASS JOBS (Lv30+) ──
  knight: {
    id: "knight",
    name: "Knight",
    hpPerLevel: 38,
    atkPerLevel: 8,
    baseMaxMp: 35,
    mpPerLevel: 2,
    skills: [
      { id: "bash",        name: "Bash",        manaCost: 8,  cooldownMs: 700,  range: 2.5, damageMult: 2.2, hotkey: 1, icon: "💥", desc: "Hard strike (×2.2)" },
      { id: "shield_bash", name: "Shield Bash", manaCost: 12, cooldownMs: 2400, range: 2.5, damageMult: 1.6, hotkey: 2, icon: "🛡", desc: "Stun 2s",
        status: { kind: "stun", durationMs: 2000 } },
      { id: "spiral",      name: "Spiral",      manaCost: 22, cooldownMs: 5000, range: 3.5, damageMult: 3.5, aoeRadius: 2.5, hotkey: 3, icon: "🌪", desc: "AoE ×3.5" },
      { id: "auto_guard",  name: "Auto Guard",  manaCost: 30, cooldownMs: 60000, range: 0, damageMult: 0, healMult: 0, hotkey: 4, icon: "✨", desc: "Regen self for 30s",
        selfStatus: { kind: "regen", durationMs: 30000 } },
    ],
  },
  wizard: {
    id: "wizard",
    name: "Wizard",
    hpPerLevel: 18,
    atkPerLevel: 4,
    baseMaxMp: 90,
    mpPerLevel: 8,
    skills: [
      { id: "frost_nova",  name: "Frost Nova",  manaCost: 18, cooldownMs: 4000, range: 6, damageMult: 2.5, aoeRadius: 3, hotkey: 1, icon: "❄", desc: "AoE freeze",
        status: { kind: "freeze", durationMs: 3500 } },
      { id: "meteor",      name: "Meteor",      manaCost: 35, cooldownMs: 8000, range: 8, damageMult: 5.0, aoeRadius: 3, hotkey: 2, icon: "☄", desc: "AoE bigboom" },
      { id: "lightning",   name: "Lightning",   manaCost: 12, cooldownMs: 1500, range: 7, damageMult: 2.8, hotkey: 3, icon: "⚡", desc: "Stun chance",
        status: { kind: "stun", durationMs: 1500, chance: 0.3 } },
      { id: "fire_wall",   name: "Fire Wall",   manaCost: 20, cooldownMs: 6000, range: 5, damageMult: 1.8, aoeRadius: 2.5, hotkey: 4, icon: "🔥", desc: "Burn area",
        status: { kind: "burn", durationMs: 5000 } },
    ],
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    hpPerLevel: 20,
    atkPerLevel: 7,
    baseMaxMp: 60,
    mpPerLevel: 4,
    skills: [
      { id: "snipe",       name: "Snipe",       manaCost: 12, cooldownMs: 1800, range: 11, damageMult: 3.5, hotkey: 1, icon: "🎯", desc: "Long range" },
      { id: "arrow_rain",  name: "Arrow Rain",  manaCost: 22, cooldownMs: 5000, range: 9, damageMult: 2.2, aoeRadius: 3, hotkey: 2, icon: "🏹", desc: "AoE arrows" },
      { id: "freeze_arrow", name: "Freeze Arrow", manaCost: 14, cooldownMs: 3500, range: 9, damageMult: 2.0, hotkey: 3, icon: "🧊", desc: "Freeze 3s",
        status: { kind: "freeze", durationMs: 3000 } },
      { id: "true_sight",  name: "True Sight",  manaCost: 25, cooldownMs: 30000, range: 0, damageMult: 0, healMult: 0, hotkey: 4, icon: "👁", desc: "Crit ×2 for 20s",
        selfStatus: { kind: "regen", durationMs: 20000 } },
    ],
  },
  priest: {
    id: "priest",
    name: "Priest",
    hpPerLevel: 22,
    atkPerLevel: 3,
    baseMaxMp: 100,
    mpPerLevel: 7,
    skills: [
      { id: "heal_v2",     name: "Greater Heal",manaCost: 18, cooldownMs: 2000, range: 0, damageMult: 0, healMult: 4.5, hotkey: 1, icon: "💖", desc: "Restore HP +120" },
      { id: "holy_light",  name: "Holy Light",  manaCost: 14, cooldownMs: 1500, range: 7, damageMult: 3.2, hotkey: 2, icon: "✨", desc: "Big holy damage" },
      { id: "sanctuary",   name: "Sanctuary",   manaCost: 28, cooldownMs: 12000, range: 0, damageMult: 0, healMult: 0, hotkey: 3, icon: "⛪", desc: "Regen 30s self",
        selfStatus: { kind: "regen", durationMs: 30000 } },
      { id: "purify",      name: "Purify",      manaCost: 20, cooldownMs: 8000, range: 5, damageMult: 4.5, hotkey: 4, icon: "🕊", desc: "Pure attack — undead" },
    ],
  },
  assassin: {
    id: "assassin",
    name: "Assassin",
    hpPerLevel: 22,
    atkPerLevel: 7,
    baseMaxMp: 50,
    mpPerLevel: 3,
    skills: [
      { id: "double_attack", name: "Double Attack", manaCost: 8, cooldownMs: 800, range: 2.5, damageMult: 3.2, hotkey: 1, icon: "⚡", desc: "Quick double hit" },
      { id: "sonic_blow",  name: "Sonic Blow",  manaCost: 25, cooldownMs: 4500, range: 2.5, damageMult: 5.5, hotkey: 2, icon: "💢", desc: "Combo finisher" },
      { id: "deadly_poison", name: "Deadly Poison", manaCost: 10, cooldownMs: 2200, range: 2.5, damageMult: 1.8, hotkey: 3, icon: "☠", desc: "Strong poison 8s",
        status: { kind: "poison", durationMs: 8000 } },
      { id: "cloaking",    name: "Cloaking",    manaCost: 30, cooldownMs: 25000, range: 0, damageMult: 0, healMult: 0, hotkey: 4, icon: "🌑", desc: "Self regen 25s",
        selfStatus: { kind: "regen", durationMs: 25000 } },
    ],
  },
};

/** First-class → 2nd class advancement pairings (at Lv30). */
export const JOB_ADVANCEMENT: Record<string, JobId[]> = {
  swordsman: ["knight"],
  mage:      ["wizard"],
  archer:    ["sniper"],
  acolyte:   ["priest"],
  thief:     ["assassin"],
};

export function maxMpFor(job: JobId, level: number) {
  const j = JOBS[job];
  return j.baseMaxMp + j.mpPerLevel * (level - 1);
}
