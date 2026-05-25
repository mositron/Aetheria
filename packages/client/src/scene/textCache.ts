// Module-scope LRU cache for billboard text textures.
// Same text + color + style → same THREE.CanvasTexture, shared across all
// component instances + across damage-number/NPC-label/cave-label call sites.
//
// Capped at MAX entries (LRU eviction). Disposed textures are removed.
// Callers must NOT call .dispose() on textures they get from here — the
// cache owns them.

import * as THREE from "three";

const MAX = 64;
const cache = new Map<string, THREE.CanvasTexture>();

export type TextStyle = {
  font?: string;      // default "bold 30px sans-serif"
  fill: string;       // hex/rgba
  stroke?: string;    // default "black"
  strokeWidth?: number; // default 5
  width?: number;     // canvas width — default 256
  height?: number;    // canvas height — default 64
};

export function getTextTexture(text: string, style: TextStyle): THREE.CanvasTexture {
  const font = style.font ?? "bold 30px sans-serif";
  const stroke = style.stroke ?? "black";
  const strokeWidth = style.strokeWidth ?? 5;
  const width = style.width ?? 256;
  const height = style.height ?? 64;
  const key = `${text}|${style.fill}|${font}|${stroke}|${strokeWidth}|${width}|${height}`;

  const existing = cache.get(key);
  if (existing) {
    // LRU touch — re-insert to move to end
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillText(text, width / 2, height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  // Evict oldest if over budget
  if (cache.size >= MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      const old = cache.get(oldestKey);
      old?.dispose();
      cache.delete(oldestKey);
    }
  }
  cache.set(key, tex);
  return tex;
}

/** Test-only: clear the cache (dispose everything). */
export function _clearTextCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
