// Shared "organic primitive" kit — rounded/capsule-based building blocks that
// replace flat box-stacked "voxel" geometry across player/NPC bodies
// (HeroModel.tsx) and, in a later pass, monster models — while staying
// low-poly/procedural (no downloaded assets) and toon-shaded to match the
// rest of the scene (terrain/trees already use meshToonMaterial).
//
// Perf budget (from the model survey): monsters can reach ~15-20
// fully-modeled concurrent instances in caves/dungeons/Endless-Tower rooms —
// the tightest constraint of the three systems (players cap at 32/room, NPCs
// at 9 total ever). Segment counts below are sized against that: 6 radial
// segments for limbs, 8 for torso/spikes, 8-10 for heads. Prioritize fewer
// meshes over per-mesh smoothness — draw-call count is the real cost lever,
// not triangle count, at these instance counts.

import { forwardRef } from "react";
import type { Mesh } from "three";
import { toonGradient } from "../materials";

type Vec3 = [number, number, number];

/** A rounded limb (leg/arm) — capsule instead of a rectangular box. */
export const RoundLimb = forwardRef<
  Mesh,
  { length: number; radius: number; color: string; position?: Vec3; rotation?: Vec3; castShadow?: boolean }
>(function RoundLimb({ length, radius, color, position, rotation, castShadow }, ref) {
  const cylLength = Math.max(0.01, length - radius * 2);
  return (
    <mesh ref={ref} position={position} rotation={rotation} castShadow={castShadow}>
      <capsuleGeometry args={[radius, cylLength, 3, 6]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </mesh>
  );
});

/**
 * A rounded torso — a capsule non-uniformly scaled to hit width/depth, so it
 * still reads as a "pill" torso rather than a perfect cylinder.
 *
 * When `height` is smaller than the capsule's own diameter (avgRadius*2) —
 * e.g. a wide/flat quadruped body where width or depth dominates — the
 * cylinder section clamps toward zero and the capsule becomes near-spherical
 * regardless of the requested height. Without compensating, that shape then
 * got Y-scaled by 1 (an assumption that only held when height >= diameter),
 * silently rendering ~1.5x taller than requested. yScale below corrects for
 * both regimes: it's a no-op (1) whenever height >= avgRadius*2 (the normal
 * upright-humanoid-torso case this was designed for), and shrinks the
 * clamped near-sphere down to the true requested height otherwise.
 */
export function RoundTorso({
  width, height, depth, color, position, castShadow,
}: { width: number; height: number; depth: number; color: string; position?: Vec3; castShadow?: boolean }) {
  const avgRadius = (width + depth) / 4;
  const cylLength = Math.max(0.001, height - avgRadius * 2);
  const nativeYExtent = cylLength + avgRadius * 2;
  const yScale = height / nativeYExtent;
  return (
    <mesh position={position} scale={[width / (avgRadius * 2), yScale, depth / (avgRadius * 2)]} castShadow={castShadow}>
      <capsuleGeometry args={[avgRadius, cylLength, 3, 8]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </mesh>
  );
}

/** A rounded head. */
export function RoundHead({ radius, color, position }: { radius: number; color: string; position?: Vec3 }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 10, 8]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </mesh>
  );
}

/** A smooth spike/horn/hat-tip — cone with more segments than the old radial=4 "low-poly spike" convention. */
export function RoundSpike({
  radius, height, color, position, rotation,
}: { radius: number; height: number; color: string; position?: Vec3; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation}>
      <coneGeometry args={[radius, height, 8]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </mesh>
  );
}
