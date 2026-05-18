import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useSettings } from "../ui/SettingsPanel";

/** Rain particles around the player when weather is "rainy". */
export function Weather({ room }: { room: Room<WorldState> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const settings = useSettings();
  const enabled = settings.particles;
  const COUNT = 300;

  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 0] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 1] = Math.random() * 20;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    return arr;
  }, []);

  useFrame((_, dt) => {
    if (!pointsRef.current) return;
    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    const isRaining = room.state.weather === "rainy" && enabled;
    pointsRef.current.visible = isRaining;
    if (!isRaining) return;

    const attr = (pointsRef.current.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] -= dt * 18; // falling
      arr[i * 3 + 0] += dt * 2;  // slight diagonal
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 18 + Math.random() * 4;
        arr[i * 3 + 0] = me.pos.x + (Math.random() - 0.5) * 40;
        arr[i * 3 + 2] = me.pos.z + (Math.random() - 0.5) * 40;
      }
      // wrap around player
      const dx = arr[i * 3 + 0] - me.pos.x;
      const dz = arr[i * 3 + 2] - me.pos.z;
      if (Math.abs(dx) > 25) arr[i * 3 + 0] = me.pos.x + (Math.random() - 0.5) * 40;
      if (Math.abs(dz) > 25) arr[i * 3 + 2] = me.pos.z + (Math.random() - 0.5) * 40;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#bae6fd" size={0.18} transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}
