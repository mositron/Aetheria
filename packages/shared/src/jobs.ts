export type JobId =
  | "novice"
  | "swordsman" | "mage" | "archer" | "acolyte" | "thief"
  | "knight" | "wizard" | "sniper" | "priest" | "assassin"
  | "lord_knight" | "high_wizard" | "sniper_t2" | "high_priest" | "assassin_t2";

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
  /** Optional base job id for tier-2/3 jobs (e.g. "swordsman" for "lord_knight") */
  baseJob?: string;
  /** Optional base stats for 2nd/3rd-tier jobs (overrides default stat derivation). */
  baseStr?: number;
  baseAgi?: number;
  baseVit?: number;
  baseInt?: number;
  baseDex?: number;
  baseLuk?: number;
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
  // ── THIRD-TIER (2nd-job) ──
  lord_knight: {
    id: "lord_knight", name: "Lord Knight",
    hpPerLevel: 45, atkPerLevel: 10, baseMaxMp: 35, mpPerLevel: 3,
    skills: [],
  },
  high_wizard: {
    id: "high_wizard", name: "High Wizard",
    hpPerLevel: 18, atkPerLevel: 5, baseMaxMp: 120, mpPerLevel: 12,
    skills: [],
  },
  sniper_t2: {
    id: "sniper_t2", name: "Sniper",
    hpPerLevel: 28, atkPerLevel: 8, baseMaxMp: 60, mpPerLevel: 5,
    skills: [],
  },
  high_priest: {
    id: "high_priest", name: "High Priest",
    hpPerLevel: 22, atkPerLevel: 4, baseMaxMp: 130, mpPerLevel: 10,
    skills: [],
  },
  assassin_t2: {
    id: "assassin_t2", name: "Assassin",
    hpPerLevel: 25, atkPerLevel: 9, baseMaxMp: 50, mpPerLevel: 4,
    skills: [],
  },
};

// ── THIRD-TIER (2nd-job) ADVANCEMENTS ──

export const SECOND_TIER_JOBS: JobDef[] = [
  // Knight → Lord Knight
  {
    id: "lord_knight", name: "Lord Knight", baseJob: "swordsman",
    hpPerLevel: 45, atkPerLevel: 10, baseMaxMp: 35, mpPerLevel: 3,
    baseStr: 120, baseAgi: 90, baseVit: 105, baseInt: 10, baseDex: 80, baseLuk: 45,
    skills: [
      { id: "charge_attack", name: "Charge Attack", manaCost: 25, cooldownMs: 8000, range: 6, damageMult: 3.0, hotkey: 1, icon: "⚔", desc: "พุ่งเข้าโจมตี สร้างความเสียหายสูง" },
      { id: "iron_wall",     name: "Iron Wall",     manaCost: 30, cooldownMs: 30000, range: 0, damageMult: 0, hotkey: 2, icon: "🛡", desc: "เพิ่ม DEF อย่างมาก 10 วินาที",
        selfStatus: { kind: "regen", durationMs: 10000 } },
      { id: "brandish",      name: "Brandish",      manaCost: 20, cooldownMs: 5000, range: 0, damageMult: 1.5, aoeRadius: 2.5, hotkey: 3, icon: "💥", desc: "โจมตีรอบตัว ความเสียหาย 1.5x" },
    ],
  },
  // Mage → High Wizard
  {
    id: "high_wizard", name: "High Wizard", baseJob: "mage",
    hpPerLevel: 18, atkPerLevel: 5, baseMaxMp: 120, mpPerLevel: 12,
    baseStr: 15, baseAgi: 75, baseVit: 55, baseInt: 130, baseDex: 65, baseLuk: 30,
    skills: [
      { id: "meteor_strike",  name: "Meteor Strike",  manaCost: 80, cooldownMs: 15000, range: 10, damageMult: 4.0, aoeRadius: 4, hotkey: 1, icon: "☄", desc: "อุกกาบาตตกใส่พื้นที่ ความเสียหาย 4.0x + Burn",
        status: { kind: "burn", durationMs: 5000 } },
      { id: "ice_elemental",   name: "Ice Elemental",   manaCost: 60, cooldownMs: 45000, range: 8, damageMult: 1.5, hotkey: 2, icon: "❄️", desc: "เรียกธาตุน้ำแข็ง 10 วินาที โจมตีอัตโนมัติ",
        selfStatus: { kind: "regen", durationMs: 10000 } },
      { id: "magic_shatter",   name: "Magic Shatter",   manaCost: 50, cooldownMs: 10000, range: 0, damageMult: 2.5, aoeRadius: 5, hotkey: 3, icon: "✨", desc: "ระเบิดพลังงาน 2.5x + Freeze ทุกตัวในรัศมี",
        status: { kind: "freeze", durationMs: 2000 } },
    ],
  },
  // Archer → Sniper (t2)
  {
    id: "sniper_t2", name: "Sniper", baseJob: "archer",
    hpPerLevel: 28, atkPerLevel: 8, baseMaxMp: 60, mpPerLevel: 5,
    baseStr: 60, baseAgi: 115, baseVit: 70, baseInt: 20, baseDex: 130, baseLuk: 55,
    skills: [
      { id: "arrowstorm",  name: "Arrow Storm",  manaCost: 40, cooldownMs: 12000, range: 15, damageMult: 2.0, aoeRadius: 2, hotkey: 1, icon: "🏹", desc: "ฝนลูกธนู 5x โจมตีทุกศัตรูในแนว" },
      { id: "trap_master", name: "Trap Master", manaCost: 35, cooldownMs: 20000, range: 5, damageMult: 0, hotkey: 2, icon: "🪤", desc: "วางกับดัก 3 ชนิด (fire/frost/spike)" },
      { id: "eagle_eye",   name: "Eagle Eye",   manaCost: 25, cooldownMs: 60000, range: 0, damageMult: 0, hotkey: 3, icon: "🦅", desc: "100% crit rate 8 วินาที",
        selfStatus: { kind: "regen", durationMs: 8000 } },
    ],
  },
  // Acolyte → Priest (high_priest)
  {
    id: "high_priest", name: "High Priest", baseJob: "acolyte",
    hpPerLevel: 22, atkPerLevel: 4, baseMaxMp: 130, mpPerLevel: 10,
    baseStr: 20, baseAgi: 70, baseVit: 80, baseInt: 125, baseDex: 60, baseLuk: 50,
    skills: [
      { id: "resurrection",   name: "Resurrection",   manaCost: 100, cooldownMs: 120000, range: 5, damageMult: 0, hotkey: 1, icon: "✝", desc: "ชุบชีวิตผู้เล่นที่ตาย nearby" },
      { id: "holy_shield",     name: "Holy Shield",     manaCost: 45, cooldownMs: 60000, range: 0, damageMult: 0, hotkey: 2, icon: "✨", desc: "ภูติสิ่งกล่าว ลดความเสียหาย 50% 15 วินาที",
        selfStatus: { kind: "regen", durationMs: 15000 } },
      { id: "divine_blessing", name: "Divine Blessing", manaCost: 60, cooldownMs: 45000, range: 0, damageMult: 0, aoeRadius: 6, hotkey: 3, icon: "🙏", desc: "เพิ่ม ATK/DEF ทุกคนในพื้นที่ 30%",
        selfStatus: { kind: "regen", durationMs: 30000 } },
    ],
  },
  // Thief → Assassin (t2)
  {
    id: "assassin_t2", name: "Assassin", baseJob: "thief",
    hpPerLevel: 25, atkPerLevel: 9, baseMaxMp: 50, mpPerLevel: 4,
    baseStr: 80, baseAgi: 130, baseVit: 65, baseInt: 15, baseDex: 90, baseLuk: 70,
    skills: [
      { id: "backstab",     name: "Backstab",     manaCost: 20, cooldownMs: 6000, range: 2, damageMult: 5.0, hotkey: 1, icon: "🗡", desc: "โจมตีจากหลัง 5.0x damage" },
      { id: "vanish",       name: "Vanish",       manaCost: 40, cooldownMs: 90000, range: 0, damageMult: 0, hotkey: 2, icon: "👻", desc: "ล่องหน 10 วินาที — บุกโจมตีศัตรูครั้งแรก crit",
        selfStatus: { kind: "regen", durationMs: 10000 } },
      { id: "poison_trap",  name: "Poison Trap",  manaCost: 30, cooldownMs: 25000, range: 5, damageMult: 0, hotkey: 3, icon: "☠", desc: "วางกับดักพิษ ระเบิดเมื่อเหยียบ",
        status: { kind: "poison", durationMs: 8000 } },
    ],
  },
];

/** First-class → 2nd class (Lv30), then 2nd → 3rd class (Lv50). */
export const JOB_ADVANCEMENT: Record<string, JobId[]> = {
  swordsman: ["knight"],
  mage:      ["wizard"],
  archer:    ["sniper"],
  acolyte:   ["priest"],
  thief:     ["assassin"],
  knight:    ["lord_knight"],
  wizard:    ["high_wizard"],
  sniper:    ["sniper_t2"],
  priest:    ["high_priest"],
  assassin:  ["assassin_t2"],
};

// ── SKILL TREE ────────────────────────────────────────────────────────────────

export interface SkillNode {
  skillId: string;
  name: string;
  nameTh: string;
  tier: number; // 1, 2, 3
  row: number;  // visual row in tree
  col: number;  // visual column
  requires: string[]; // prerequisite skill IDs
}

export const SKILL_TREES: Record<string, SkillNode[]> = {
  swordsman: [
    { skillId: "bash",         name: "Bash",         nameTh: "ฟาด",         tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "shield_bash",  name: "Shield Bash",   nameTh: "โล่ฟาด",       tier: 2, row: 1, col: 0, requires: ["bash"] },
    { skillId: "whirlwind",    name: "Whirlwind",    nameTh: "ลมหมุน",        tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "iron_stance",  name: "Iron Stance",  nameTh: "ยืนหยัด",       tier: 2, row: 1, col: 1, requires: ["whirlwind"] },
    { skillId: "lance_charge", name: "Lance Charge",  nameTh: "พุ่งหอก",      tier: 3, row: 2, col: 0, requires: ["shield_bash", "iron_stance"] },
    { skillId: "provoke",      name: "Provoke",       nameTh: "ยั่วยุ",       tier: 1, row: 0, col: 2, requires: [] },
    { skillId: "shield_wall",  name: "Shield Wall",   nameTh: "กำแพงโล่",     tier: 2, row: 1, col: 2, requires: ["provoke"] },
  ],
  mage: [
    { skillId: "firebolt",     name: "Firebolt",      nameTh: "ลูกไฟ",         tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "frost_nova",  name: "Frost Nova",    nameTh: "น้ำแข็งระเบิด",  tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "fireball",     name: "Fireball",      nameTh: "ลูกไฟใหญ่",     tier: 2, row: 1, col: 0, requires: ["firebolt"] },
    { skillId: "ice_brand",   name: "Ice Brand",     nameTh: "ดาบน้ำแข็ง",    tier: 2, row: 1, col: 1, requires: ["frost_nova"] },
    { skillId: "meteor",       name: "Meteor",        nameTh: "อุกกาบาต",      tier: 3, row: 2, col: 0, requires: ["fireball"] },
    { skillId: "thunder_bolt", name: "Thunder Bolt",  nameTh: "สายฟ้า",        tier: 1, row: 0, col: 2, requires: [] },
    { skillId: "lightning",    name: "Lightning",     nameTh: "สายฟ้าแล่น",   tier: 2, row: 1, col: 2, requires: ["thunder_bolt"] },
  ],
  archer: [
    { skillId: "arrow_shot",    name: "Arrow Shot",    nameTh: "ยิงธนู",       tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "double_strafe", name: "Double Strafe", nameTh: "ยิงสองเท่า",   tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "aimed_shot",    name: "Aimed Shot",    nameTh: "ยิงแม่น",      tier: 2, row: 1, col: 0, requires: ["arrow_shot"] },
    { skillId: "ankle_snare",   name: "Ankle Snare",   nameTh: "กับดักเท้า",   tier: 2, row: 1, col: 1, requires: ["double_strafe"] },
    { skillId: "arrow_rain",   name: "Arrow Rain",    nameTh: "ฝนธนู",        tier: 3, row: 2, col: 0, requires: ["aimed_shot", "ankle_snare"] },
  ],
  acolyte: [
    { skillId: "heal",         name: "Heal",          nameTh: "รักษา",         tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "holy_smite",   name: "Holy Smite",    nameTh: "ประกาศิตศักดิ์สิทธ์", tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "greater_heal", name: "Greater Heal",   nameTh: "รักษาวิเศษ",    tier: 2, row: 1, col: 0, requires: ["heal"] },
    { skillId: "holy_light",   name: "Holy Light",    nameTh: "แสงศักดิ์สิทธ์", tier: 2, row: 1, col: 1, requires: ["holy_smite"] },
    { skillId: "resurrection", name: "Resurrection",  nameTh: "ชุบชีวิต",     tier: 3, row: 2, col: 0, requires: ["greater_heal"] },
  ],
  thief: [
    { skillId: "envenom",      name: "Envenom",       nameTh: "พิษ",           tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "back_slide",   name: "Back Slide",    nameTh: "ถอยหลังแทง",     tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "deadly_poison",name: "Deadly Poison", nameTh: "พิษร้าย",       tier: 2, row: 1, col: 0, requires: ["envenom"] },
    { skillId: "smoke_blast",  name: "Smoke Blast",   nameTh: "ควันระเบิด",   tier: 2, row: 1, col: 1, requires: ["back_slide"] },
    { skillId: "assassin_cross", name: "Assassinate",  nameTh: "สังหารเด็ดขาด", tier: 3, row: 2, col: 0, requires: ["deadly_poison", "smoke_blast"] },
  ],
  knight: [
    { skillId: "charge_attack", name: "Charge Attack", nameTh: "พุ่งฟาด",     tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "iron_wall",     name: "Iron Wall",     nameTh: "กำแพงเหล็ก",   tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "brandish",      name: "Brandish",      nameTh: "แกว่นดาบ",     tier: 2, row: 1, col: 0, requires: ["charge_attack"] },
    { skillId: "auto_guard",    name: "Auto Guard",    nameTh: "เลือดเป็นเกราะ", tier: 2, row: 1, col: 1, requires: ["iron_wall"] },
  ],
  wizard: [
    { skillId: "meteor",        name: "Meteor",        nameTh: "อุกกาบาต",      tier: 1, row: 0, col: 0, requires: [] },
    { skillId: "fire_wall",     name: "Fire Wall",     nameTh: "กำแพงไฟ",      tier: 1, row: 0, col: 1, requires: [] },
    { skillId: "meteor_strike", name: "Meteor Strike", nameTh: "อุกกาบาตตก",   tier: 2, row: 1, col: 0, requires: ["meteor"] },
    { skillId: "magic_shatter", name: "Magic Shatter", nameTh: "ระเบิดเวทย์",  tier: 2, row: 1, col: 1, requires: ["fire_wall"] },
  ],
};

export function maxMpFor(job: JobId, level: number) {
  const j = JOBS[job];
  return j.baseMaxMp + j.mpPerLevel * (level - 1);
}
