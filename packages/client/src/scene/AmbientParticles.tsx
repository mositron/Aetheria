import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useSettings } from "../ui/SettingsPanel";

/**
 * Floating ambient particles around the player — fireflies at night, petals/sparkles in day.
 * Cute mood polish, very cheap (50 instanced points).
 */
export function AmbientParticles({ room }: { room: Room<WorldState> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const settings = useSettings();
  const enabled = settings.particles;
  const COUNT = 60;

  const { positions, phases } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // Random position within ~20m bubble around origin (will be re-anchored to player)
      positions[i * 3 + 0] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = 0.3 + Math.random() * 3.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      phases[i * 3 + 0] = Math.random() * Math.PI * 2;
      phases[i * 3 + 1] = Math.random() * Math.PI * 2;
      phases[i * 3 + 2] = 0.5 + Math.random() * 1.5; // speed
    }
    return { positions, phases };
  }, []);

  const matRef = useRef<THREE.PointsMaterial>(null);
  const lastAnchor = useRef({ x: 0, z: 0 });
  // Cache the last-applied day/night state so we only re-set the material
  // color on transition. Size/opacity still update for the breathing
  // animation (cheap), but setHex was being called 60×/sec for no reason.
  const lastNight = useRef<boolean | null>(null);

  useFrame(({ clock }) => {
    if (!pointsRef.current || !matRef.current) return;
    pointsRef.current.visible = enabled;
    if (!enabled) return;
    const me = room.state.players.get(room.sessionId);
    if (!me) return;

    // Anchor to player: shift positions if player moved a lot
    const dx = me.pos.x - lastAnchor.current.x;
    const dz = me.pos.z - lastAnchor.current.z;
    const shift = Math.hypot(dx, dz);

    const isNight = room.state.isNight;
    const t = clock.getElapsedTime();

    const attr = (pointsRef.current.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < COUNT; i++) {
      // Wobble — fireflies meander
      arr[i * 3 + 0] += Math.sin(t * phases[i * 3 + 2] + phases[i * 3 + 0]) * 0.02;
      arr[i * 3 + 1] += Math.cos(t * phases[i * 3 + 2] + phases[i * 3 + 1]) * 0.015;
      arr[i * 3 + 2] += Math.cos(t * phases[i * 3 + 2] * 0.8 + phases[i * 3 + 0]) * 0.02;

      // If player moved, shift particle bubble with them
      if (shift > 0.05) {
        arr[i * 3 + 0] += dx;
        arr[i * 3 + 2] += dz;
      }

      // Wrap particles that drift too far (relative to player)
      const px = arr[i * 3 + 0] - me.pos.x;
      const pz = arr[i * 3 + 2] - me.pos.z;
      if (Math.hypot(px, pz) > 18) {
        const a = Math.random() * Math.PI * 2;
        arr[i * 3 + 0] = me.pos.x + Math.cos(a) * 10;
        arr[i * 3 + 2] = me.pos.z + Math.sin(a) * 10;
        arr[i * 3 + 1] = 0.4 + Math.random() * 3;
      }
    }
    attr.needsUpdate = true;
    lastAnchor.current = { x: me.pos.x, z: me.pos.z };

    // Color + size based on day/night. Only repaint color + opacity on the
    // transition; size animates every frame because it's the visual breath.
    if (lastNight.current !== isNight) {
      matRef.current.color.setHex(isNight ? 0xfde047 : 0xfbcfe8);
      matRef.current.opacity = isNight ? 0.9 : 0.7;
      lastNight.current = isNight;
    }
    matRef.current.size = isNight
      ? 0.22 + Math.sin(t * 4) * 0.05
      : 0.18 + Math.sin(t * 2) * 0.03;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.2}
        color="#fde047"
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
