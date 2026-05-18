// Character appearance: small palette of choices, stored as JSON string.
export type HairStyle = "short" | "long" | "ponytail" | "spiky" | "bun" | "bald";
export type BodyShape = "slim" | "normal" | "wide";
export type HatStyle = "none" | "cap" | "wizard" | "crown" | "headband";
export type GlassesStyle = "none" | "round" | "sun";
export type ScarfStyle = "none" | "regular" | "long";

export type Appearance = {
  skin: string;       // hex
  hair: string;       // hex
  eye: string;        // hex
  shirt: string;      // hex (torso color)
  pants: string;      // hex (legs color)
  hairStyle: HairStyle;
  body: BodyShape;
  // accessories
  hat?: HatStyle;
  hatColor?: string;
  glasses?: GlassesStyle;
  scarf?: ScarfStyle;
  scarfColor?: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  skin: "#f5d6b0",
  hair: "#3a2618",
  eye: "#1f2937",
  shirt: "#dc2626",
  pants: "#1e293b",
  hairStyle: "short",
  body: "normal",
  hat: "none",
  hatColor: "#fbbf24",
  glasses: "none",
  scarf: "none",
  scarfColor: "#f472b6",
};

export const HAT_STYLES: HatStyle[] = ["none", "cap", "wizard", "crown", "headband"];
export const GLASSES_STYLES: GlassesStyle[] = ["none", "round", "sun"];
export const SCARF_STYLES: ScarfStyle[] = ["none", "regular", "long"];
export const ACC_COLOR_PRESETS = ["#fbbf24", "#f472b6", "#22d3ee", "#a855f7", "#34d399", "#fb923c", "#ffffff", "#000000"];

export const SKIN_PRESETS = ["#f5d6b0", "#e8b48b", "#c98765", "#9e6a45", "#6e472b", "#3f2613"];
export const HAIR_PRESETS = ["#0f0f0f", "#3a2618", "#7c4a1f", "#c98a2e", "#e9c46a", "#d1d5db", "#ffffff", "#dc2626", "#7c3aed", "#0ea5e9", "#22d3ee", "#f472b6"];
export const EYE_PRESETS = ["#1f2937", "#0c4a6e", "#14532d", "#7c2d12", "#a855f7", "#dc2626"];
export const SHIRT_PRESETS = ["#dc2626", "#0ea5e9", "#16a34a", "#a855f7", "#f59e0b", "#1e293b", "#f9fafb", "#7c3aed"];
export const PANTS_PRESETS = ["#1e293b", "#7c4a1f", "#0f172a", "#374151", "#a16207", "#581c87"];
export const HAIR_STYLES: HairStyle[] = ["short", "long", "ponytail", "spiky", "bun", "bald"];
export const BODY_SHAPES: BodyShape[] = ["slim", "normal", "wide"];

export function parseAppearance(json: string | undefined | null): Appearance {
  if (!json) return { ...DEFAULT_APPEARANCE };
  try {
    const o = JSON.parse(json);
    return {
      skin: typeof o.skin === "string" ? o.skin : DEFAULT_APPEARANCE.skin,
      hair: typeof o.hair === "string" ? o.hair : DEFAULT_APPEARANCE.hair,
      eye: typeof o.eye === "string" ? o.eye : DEFAULT_APPEARANCE.eye,
      shirt: typeof o.shirt === "string" ? o.shirt : DEFAULT_APPEARANCE.shirt,
      pants: typeof o.pants === "string" ? o.pants : DEFAULT_APPEARANCE.pants,
      hairStyle: HAIR_STYLES.includes(o.hairStyle) ? o.hairStyle : DEFAULT_APPEARANCE.hairStyle,
      body: BODY_SHAPES.includes(o.body) ? o.body : DEFAULT_APPEARANCE.body,
      hat: HAT_STYLES.includes(o.hat) ? o.hat : DEFAULT_APPEARANCE.hat,
      hatColor: typeof o.hatColor === "string" ? o.hatColor : DEFAULT_APPEARANCE.hatColor,
      glasses: GLASSES_STYLES.includes(o.glasses) ? o.glasses : DEFAULT_APPEARANCE.glasses,
      scarf: SCARF_STYLES.includes(o.scarf) ? o.scarf : DEFAULT_APPEARANCE.scarf,
      scarfColor: typeof o.scarfColor === "string" ? o.scarfColor : DEFAULT_APPEARANCE.scarfColor,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function stringifyAppearance(a: Appearance): string {
  return JSON.stringify(a);
}
