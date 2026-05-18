// Production asset loader hooks.
//
// `useModel(key)` / `useTexture(key)` return either the real loaded asset or
// `null` so callers can render the procedural fallback. Loads are async +
// cached + de-duped — calling useModel("hero") in 30 components triggers 1 fetch.
//
// Errors (404, network) are caught and surfaced as null + console.warn — never
// throw, so a missing optional asset can't crash the scene.

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ASSETS } from "./manifest";

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// Two-level cache: in-flight Promise + resolved value
const modelCache = new Map<string, Promise<GLTF | null>>();
const textureCache = new Map<string, Promise<THREE.Texture | null>>();

function fetchModel(url: string): Promise<GLTF | null> {
  let p = modelCache.get(url);
  if (p) return p;
  p = new Promise<GLTF | null>((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => { console.warn(`[asset] model load failed: ${url}`, err); resolve(null); }
    );
  });
  modelCache.set(url, p);
  return p;
}

function fetchTexture(url: string): Promise<THREE.Texture | null> {
  let p = textureCache.get(url);
  if (p) return p;
  p = new Promise<THREE.Texture | null>((resolve) => {
    textureLoader.load(
      url,
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; resolve(tex); },
      undefined,
      (err) => { console.warn(`[asset] texture load failed: ${url}`, err); resolve(null); }
    );
  });
  textureCache.set(url, p);
  return p;
}

/** Returns the GLTF model, or null until loaded / on error. */
export function useModel(key: string): GLTF | null {
  const entry = ASSETS.models[key];
  const [model, setModel] = useState<GLTF | null>(null);
  useEffect(() => {
    if (!entry?.url) return;
    let alive = true;
    fetchModel(entry.url).then((m) => { if (alive) setModel(m); });
    return () => { alive = false; };
  }, [entry?.url]);
  return model;
}

/** Returns the texture, or null until loaded / on error. */
export function useTexture(key: string): THREE.Texture | null {
  const entry = ASSETS.textures[key];
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!entry?.url) return;
    let alive = true;
    fetchTexture(entry.url).then((t) => { if (alive) setTex(t); });
    return () => { alive = false; };
  }, [entry?.url]);
  return tex;
}

/** Preload everything flagged preload:true in the manifest. Call once at boot. */
export function preloadAssets(): Promise<void> {
  const ps: Promise<unknown>[] = [];
  for (const e of Object.values(ASSETS.models)) if (e.preload && e.url) ps.push(fetchModel(e.url));
  for (const e of Object.values(ASSETS.textures)) if (e.preload && e.url) ps.push(fetchTexture(e.url));
  return Promise.all(ps).then(() => undefined);
}

/** Test-only: clear caches between runs. */
export function _clearAssetCache(): void {
  modelCache.clear();
  textureCache.clear();
}
