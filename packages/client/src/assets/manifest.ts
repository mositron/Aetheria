// Asset manifest.
//
// The game is fully procedural by default — no downloads, no external CDN.
// To swap in real models/textures, drop files under packages/client/public/assets/
// and register them here. Missing assets fall back to procedural automatically.
//
// All paths are relative to the public/ directory.

export type AssetEntry = {
  /** Public URL (served by Vite). Undefined = use procedural fallback. */
  url?: string;
  /** Optional preload — pulls the asset on app boot. */
  preload?: boolean;
};

export type AssetManifest = {
  models: Record<string, AssetEntry>;   // GLTF/GLB
  textures: Record<string, AssetEntry>;
  audio: Record<string, AssetEntry>;
};

export const ASSETS: AssetManifest = {
  models: {
    // Examples (commented out — all procedural for now).
    // hero:   { url: "/assets/models/hero.glb", preload: true },
    // slime:  { url: "/assets/models/slime.glb" },
    // wolf:   { url: "/assets/models/wolf.glb" },
  },
  textures: {
    // Examples:
    // grass:  { url: "/assets/textures/grass.webp", preload: true },
    // stone:  { url: "/assets/textures/stone.webp" },
  },
  audio: {
    // Examples:
    // ambient_forest: { url: "/assets/audio/forest.ogg" },
  },
};
