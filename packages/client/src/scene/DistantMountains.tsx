// Static ring of large low-poly peaks around the player, positioned near the
// fog-far distance so the horizon always reads as mountains instead of the
// terrain just stopping / empty haze. Unlit flat material (cheap, no
// lighting calc) with `fog` enabled so it fades naturally at the ring's
// outer edge. Repositioned to follow the player only when they've drifted
// far enough — no per-frame work, matches the chunk-streaming poll pattern.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

// Kept just outside the chunk-streaming unload boundary (~64m, see
// ChunkedTerrain.tsx LOAD_RADIUS/UNLOAD_RADIUS) and just past fog-far
// (~62m field, Environment.tsx) — close enough to still read as a hazy
// backdrop now that render distance is much tighter, far enough that the
// ring never overlaps actually-loaded/walkable terrain.
const RING_RADIUS = 75;
const PEAK_COUNT = 26;
const REPOSITION_INTERVAL_MS = 1000;
const REPOSITION_THRESHOLD = 20;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Low, wide mounds rather than tall peaks — short relative to their width so
// they read as gentle distant hills on the horizon, not mountains looming
// over the scenery (was 9-18 tall/9-15 wide "peak" proportions; before that,
// 26-48 tall — both visibly dominated the frame).
const PEAKS = (() => {
  const rand = mulberry32(4242);
  return Array.from({ length: PEAK_COUNT }, (_, i) => {
    const a = (i / PEAK_COUNT) * Math.PI * 2 + rand() * 0.15;
    const h = 3 + rand() * 4;
    const w = 12 + rand() * 8;
    return { a, h, w, snowy: rand() < 0.4, jitter: (rand() - 0.5) * 18 };
  });
})();

export function DistantMountains({ room }: { room: Room<WorldState> }) {
  const group = useRef<THREE.Group>(null);
  const lastCheck = useRef(0);
  const anchor = useRef({ x: 0, z: 0 });

  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    if (now - lastCheck.current < REPOSITION_INTERVAL_MS) return;
    lastCheck.current = now;
    const me = room.state.players.get(room.sessionId);
    if (!me || !group.current) return;
    const dx = me.pos.x - anchor.current.x;
    const dz = me.pos.z - anchor.current.z;
    if (dx * dx + dz * dz < REPOSITION_THRESHOLD * REPOSITION_THRESHOLD) return;
    anchor.current = { x: me.pos.x, z: me.pos.z };
    group.current.position.set(me.pos.x, 0, me.pos.z);
  });

  return (
    <group ref={group}>
      {PEAKS.map((p, i) => {
        const cx = Math.cos(p.a) * (RING_RADIUS + p.jitter);
        const cz = Math.sin(p.a) * (RING_RADIUS + p.jitter);
        return (
          <mesh key={i} position={[cx, p.h / 2, cz]} rotation={[0, p.a, 0]}>
            <coneGeometry args={[p.w, p.h, 8, 1]} />
            <meshBasicMaterial color={p.snowy ? "#eef3f8" : "#948c7f"} fog />
          </mesh>
        );
      })}
    </group>
  );
}
