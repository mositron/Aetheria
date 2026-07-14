// Spawns short-lived dust particles when the local player lands a jump.
// Listens to the "player-land" event from Scene.

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getSmoothHeight as terrainHeight } from "./chunkWorld";

type Puff = { id: number; x: number; z: number; y: number; bornAt: number; intensity: number };

let nextId = 1;

export function LandDust() {
  const [puffs, setPuffs] = useState<Puff[]>([]);
  useEffect(() => {
    const onLand = (e: any) => {
      const { x, z, intensity } = e.detail;
      const y = terrainHeight(x, z);
      setPuffs((p) => [...p, { id: nextId++, x, z, y, bornAt: performance.now(), intensity }]);
      // Cull after 1 second
      setTimeout(() => setPuffs((p) => p.filter((q) => q.bornAt + 1000 > performance.now())), 1100);
    };
    window.addEventListener("player-land", onLand);
    return () => window.removeEventListener("player-land", onLand);
  }, []);
  return (
    <>
      {puffs.map((p) => <DustPuff key={p.id} puff={p} />)}
    </>
  );
}

function DustPuff({ puff }: { puff: Puff }) {
  const ref = useRef<THREE.Group>(null);
  const particles = useRef<Array<{ vx: number; vz: number; vy: number; }>>(
    Array.from({ length: 8 }, () => {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 0.8;
      return { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 0.4 + Math.random() * 0.4 };
    })
  );
  useFrame((_, dt) => {
    if (!ref.current) return;
    const age = (performance.now() - puff.bornAt) / 1000;
    if (age > 1) { ref.current.visible = false; return; }
    const t = age;
    const scale = 1 + t * 1.5;
    ref.current.scale.setScalar(scale);
    ref.current.position.y = puff.y + 0.1 + t * 0.5;
    const m = ref.current.children[0] as THREE.Mesh | undefined;
    if (m && m.material instanceof THREE.MeshBasicMaterial) {
      m.material.opacity = Math.max(0, 0.55 - t * 0.6);
    }
  });
  return (
    <group ref={ref} position={[puff.x, puff.y + 0.1, puff.z]}>
      <mesh>
        <sphereGeometry args={[0.4 * puff.intensity, 8, 6]} />
        <meshBasicMaterial color="#d1c5b0" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}
