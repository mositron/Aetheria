export type StatusKind = "poison" | "burn" | "stun" | "freeze" | "slow" | "regen";

export type StatusDef = {
  id: StatusKind;
  name: string;
  icon: string;
  color: string;
  preventAction: boolean;   // stun/freeze
  speedMult?: number;        // 0..1 movement multiplier
  tickMs?: number;           // damage/heal tick interval
  tickDmg?: number;          // positive = damage, negative = heal
};

export const STATUS_DEFS: Record<StatusKind, StatusDef> = {
  poison: { id: "poison", name: "Poison", icon: "☠", color: "#86efac", preventAction: false, tickMs: 1000, tickDmg: 3 },
  burn:   { id: "burn",   name: "Burn",   icon: "🔥", color: "#fb923c", preventAction: false, tickMs: 800, tickDmg: 5 },
  stun:   { id: "stun",   name: "Stun",   icon: "💫", color: "#fde047", preventAction: true },
  freeze: { id: "freeze", name: "Freeze", icon: "❄", color: "#7dd3fc", preventAction: true, speedMult: 0 },
  slow:   { id: "slow",   name: "Slow",   icon: "🐌", color: "#a78bfa", preventAction: false, speedMult: 0.5 },
  regen:  { id: "regen",  name: "Regen",  icon: "✨", color: "#34d399", preventAction: false, tickMs: 1000, tickDmg: -5 },
};
