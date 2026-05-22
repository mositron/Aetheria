export type StatusKind = "poison" | "burn" | "stun" | "freeze" | "slow" | "regen"
  | "shielded" | "ice_elemental" | "eagle_eye" | "stealth" | "holy_shield" | "divine_blessing";

export type StatusDef = {
  id: StatusKind;
  name: string;
  icon: string;
  color: string;
  preventAction: boolean;   // stun/freeze
  speedMult?: number;        // 0..1 movement multiplier
  tickMs?: number;           // damage/heal tick interval
  tickDmg?: number;          // positive = damage, negative = heal
  defMultiplier?: number;    // e.g. 2.0 for Iron Wall's double DEF
  atkBonus?: number;         // flat attack bonus multiplier
  defBonus?: number;         // flat defense bonus multiplier
  damageReduction?: number;  // 0..1 fraction reduction
  invisible?: boolean;       // vanishes from enemy view
  firstStrikeCrit?: boolean; // first attack from stealth always crits
  autoAttack?: boolean;      // companion/monster auto-attacks
};

export const STATUS_DEFS: Record<StatusKind, StatusDef> = {
  poison:    { id: "poison",    name: "Poison",       icon: "☠",   color: "#86efac", preventAction: false, tickMs: 1000, tickDmg: 3 },
  burn:      { id: "burn",      name: "Burn",         icon: "🔥",  color: "#fb923c", preventAction: false, tickMs: 800,  tickDmg: 5 },
  stun:      { id: "stun",      name: "Stun",         icon: "💫",  color: "#fde047", preventAction: true },
  freeze:    { id: "freeze",    name: "Freeze",       icon: "❄",   color: "#7dd3fc", preventAction: true, speedMult: 0 },
  slow:      { id: "slow",      name: "Slow",         icon: "🐌",  color: "#a78bfa", preventAction: false, speedMult: 0.5 },
  regen:     { id: "regen",     name: "Regen",        icon: "✨",  color: "#34d399", preventAction: false, tickMs: 1000, tickDmg: -5 },
  // ── 2nd-job status effects ──
  shielded:      { id: "shielded",      name: "Iron Wall",        icon: "🛡", color: "#94a3b8", preventAction: false, defMultiplier: 2.0 },
  ice_elemental: { id: "ice_elemental", name: "Ice Elemental",    icon: "❄️", color: "#7dd3fc", preventAction: false, autoAttack: true },
  eagle_eye:     { id: "eagle_eye",     name: "Eagle Eye",        icon: "🦅", color: "#fbbf24", preventAction: false },
  stealth:       { id: "stealth",       name: "Vanish",           icon: "👻", color: "#a855f7", preventAction: false, invisible: true, firstStrikeCrit: true },
  holy_shield:   { id: "holy_shield",   name: "Holy Shield",     icon: "✨", color: "#fde68a", preventAction: false, damageReduction: 0.5 },
  divine_blessing:{ id: "divine_blessing", name: "Divine Blessing", icon: "🙏", color: "#fde68a", preventAction: false, atkBonus: 0.3, defBonus: 0.3 },
};
