// Deterministic NPC appearance — derives skin/hair/eye/body/hat/scarf
// from a string id so each NPC looks distinct but stable across renders.
//
// Why: NPCs used to share DEFAULT_APPEARANCE and only varied by shirt color,
// so every villager looked like the same person in a different shirt.

import { DEFAULT_APPEARANCE, type Appearance } from "@game/shared";

const SKINS    = ["#f5d6b0", "#e0b58a", "#c08866", "#8b5e3c", "#fce8d4", "#d4a373"];
const HAIRS    = ["#3a2618", "#1f1812", "#6b4423", "#a16207", "#52525b", "#dc2626", "#fbbf24", "#ec4899"];
const EYES     = ["#1f2937", "#2563eb", "#16a34a", "#7c2d12", "#a855f7", "#0891b2"];
const SHIRTS   = ["#dc2626", "#2563eb", "#16a34a", "#a16207", "#7c3aed", "#0891b2", "#c026d3", "#ea580c"];
const PANTS    = ["#1f2937", "#3f3f46", "#451a03", "#1e3a8a", "#365314"];
const HAIR_STYLES: Array<"short"|"long"|"ponytail"|"spiky"|"bun"|"bald"> =
  ["short", "long", "ponytail", "spiky", "bun"];
const BODIES: Array<"slim"|"normal"|"wide"> = ["slim", "normal", "wide"];
const HATS: Array<"none"|"cap"|"wizard"|"crown"|"headband"> =
  ["none", "none", "cap", "headband"];
const SCARVES: Array<"none"|"regular"|"long"> = ["none", "none", "regular"];
const SCARF_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
const HAT_COLORS   = ["#7f1d1d", "#1e3a8a", "#365314", "#78350f", "#581c87"];

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

const pick = <T,>(arr: T[], h: number, offset: number): T =>
  arr[(h + offset * 17) % arr.length];

export function npcAppearance(id: string, shirtOverride?: string): Appearance {
  const h = hash(id);
  return {
    ...DEFAULT_APPEARANCE,
    skin:       pick(SKINS,  h, 0),
    hair:       pick(HAIRS,  h, 1),
    eye:        pick(EYES,   h, 2),
    shirt:      shirtOverride ?? pick(SHIRTS, h, 3),
    pants:      pick(PANTS,  h, 4),
    hairStyle:  pick(HAIR_STYLES, h, 5),
    body:       pick(BODIES, h, 6),
    hat:        pick(HATS,   h, 7),
    hatColor:   pick(HAT_COLORS, h, 8),
    scarf:      pick(SCARVES, h, 9),
    scarfColor: pick(SCARF_COLORS, h, 10),
  };
}
