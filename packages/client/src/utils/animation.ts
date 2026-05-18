// Godot-style declarative animation: keyframe tracks + state machine + tween.
// Replaces scattered sin/cos noise across useFrame bodies.
//
// USAGE — keyframe animation on a ref:
//
//   const anim = useAnimation(meshRef, {
//     attack: { duration: 0.4, loop: false, tracks: { "rotation.y": [0, 0.8, 0] } },
//     idle:   { duration: 2.0, loop: true,  tracks: { "position.y": [0, 0.06, 0] } },
//   });
//   anim.play("attack");
//
// USAGE — imperative tween:
//
//   tween(mesh.position, { y: 2 }, { duration: 0.6, ease: "outBack" });

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Easing functions (Godot-equivalents) ─────────────────────────────────────
export const Ease = {
  linear:    (t: number) => t,
  inQuad:    (t: number) => t * t,
  outQuad:   (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic:   (t: number) => t * t * t,
  outCubic:  (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic:(t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack:   (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic:(t: number) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
  outBounce: (t: number) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1/d1) return n1 * t * t;
    if (t < 2/d1) return n1 * (t -= 1.5/d1) * t + 0.75;
    if (t < 2.5/d1) return n1 * (t -= 2.25/d1) * t + 0.9375;
    return n1 * (t -= 2.625/d1) * t + 0.984375;
  },
  sineWave:  (t: number) => Math.sin(t * Math.PI),  // 0→1→0
};
export type EaseFn = keyof typeof Ease | ((t: number) => number);

function resolveEase(e?: EaseFn): (t: number) => number {
  if (!e) return Ease.linear;
  if (typeof e === "function") return e;
  return Ease[e] ?? Ease.linear;
}

// ── Imperative tween (one-shot) ─────────────────────────────────────────────
type TweenTarget = { [k: string]: number };
type TweenOpts = { duration: number; ease?: EaseFn; delay?: number; onComplete?: () => void };

const activeTweens: Array<{ tick: (dt: number) => boolean }> = [];

export function tween<T extends TweenTarget>(obj: T, to: Partial<T>, opts: TweenOpts): { cancel: () => void } {
  const ease = resolveEase(opts.ease);
  const from: Record<string, number> = {};
  const keys = Object.keys(to);
  for (const k of keys) from[k] = obj[k] as number;
  let elapsed = -(opts.delay ?? 0);
  const t = {
    tick(dt: number) {
      elapsed += dt;
      if (elapsed < 0) return false;
      const u = Math.min(1, elapsed / opts.duration);
      const e = ease(u);
      for (const k of keys) (obj as any)[k] = from[k] + ((to[k] as number) - from[k]) * e;
      if (u >= 1) { opts.onComplete?.(); return true; }
      return false;
    }
  };
  activeTweens.push(t);
  return { cancel: () => { const i = activeTweens.indexOf(t); if (i >= 0) activeTweens.splice(i, 1); } };
}

// Internal pump (one global frame loop driver via useTweenPump in App root).
let lastTime = 0;
export function pumpTweens(now: number) {
  if (!lastTime) { lastTime = now; return; }
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  for (let i = activeTweens.length - 1; i >= 0; i--) {
    if (activeTweens[i].tick(dt)) activeTweens.splice(i, 1);
  }
}

// React hook — call once at app root.
export function useTweenPump() {
  useFrame(() => pumpTweens(performance.now()));
}

// ── Keyframe animation player ────────────────────────────────────────────────
export type AnimClip = {
  duration: number;
  loop?: boolean;
  ease?: EaseFn;
  // dotted path → keyframe values. Numbers = same-spaced (linear over time)
  // e.g. "rotation.y": [0, 0.8, 0] = 3 keys evenly distributed over duration.
  tracks: Record<string, number[]>;
};
export type AnimSet = Record<string, AnimClip>;

type AnimController = {
  play: (name: string, opts?: { reset?: boolean }) => void;
  stop: () => void;
  current: () => string | null;
  isPlaying: () => boolean;
};

function setPath(obj: any, path: string, value: number) {
  const parts = path.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (!obj) return;
  }
  obj[parts[parts.length - 1]] = value;
}

function getPath(obj: any, path: string): number | undefined {
  const parts = path.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (!obj) return undefined;
  }
  return obj?.[parts[parts.length - 1]];
}

function sampleTrack(keys: number[], u: number, ease: (t: number) => number): number {
  if (keys.length === 1) return keys[0];
  const segCount = keys.length - 1;
  const scaled = u * segCount;
  const idx = Math.min(segCount - 1, Math.floor(scaled));
  const localU = scaled - idx;
  const e = ease(localU);
  return keys[idx] + (keys[idx + 1] - keys[idx]) * e;
}

export function useAnimation<T extends THREE.Object3D>(
  ref: React.MutableRefObject<T | null>,
  clips: AnimSet,
): AnimController {
  const current = useRef<string | null>(null);
  const elapsed = useRef(0);
  const baseline = useRef<Record<string, number>>({});

  useFrame((_, dt) => {
    if (!ref.current || !current.current) return;
    const clip = clips[current.current];
    if (!clip) return;
    elapsed.current += dt;
    let u = elapsed.current / clip.duration;
    if (u >= 1) {
      if (clip.loop) {
        u = u - Math.floor(u);
      } else {
        u = 1;
        current.current = null;  // stop after first play-through
      }
    }
    const ease = resolveEase(clip.ease);
    for (const [path, keys] of Object.entries(clip.tracks)) {
      const base = baseline.current[path] ?? 0;
      const offset = sampleTrack(keys, u, ease);
      setPath(ref.current, path, base + offset);
    }
  });

  return {
    play(name, opts) {
      if (current.current === name && !opts?.reset) return;
      const clip = clips[name];
      if (!clip) { console.warn(`[anim] unknown clip "${name}"`); return; }
      // Capture baseline so additive offsets don't accumulate.
      for (const path of Object.keys(clip.tracks)) {
        if (!(path in baseline.current) && ref.current) {
          baseline.current[path] = getPath(ref.current, path) ?? 0;
        }
      }
      current.current = name;
      elapsed.current = 0;
    },
    stop() { current.current = null; elapsed.current = 0; },
    current: () => current.current,
    isPlaying: () => current.current !== null,
  };
}

// ── Spring (Godot-equivalent of Tween's elastic) ─────────────────────────────
export function useSpring(initial = 0, stiffness = 180, damping = 14) {
  const value = useRef(initial);
  const velocity = useRef(0);
  const target = useRef(initial);
  useFrame((_, dt) => {
    const force = (target.current - value.current) * stiffness;
    velocity.current += force * dt;
    velocity.current *= Math.max(0, 1 - damping * dt);
    value.current += velocity.current * dt;
  });
  return {
    set: (v: number) => { target.current = v; },
    get: () => value.current,
  };
}
