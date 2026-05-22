import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isDead?: () => boolean; isAttacking?: () => boolean };

export function IceWraithModel({ isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const pulsePhase = useRef(0);
  const attackPhase = useRef(0);

  useFrame((_, dt) => {
    if (!root.current) return;
    const dead = isDead?.() ?? false;
    if (dead) {
      root.current.scale.set(0.2, 0.2, 0.2);
      return;
    }

    // Ghostly float + pulse
    pulsePhase.current += dt * 1.5;
    const t = performance.now() * 0.002;
    root.current.position.y = 0.5 + Math.sin(t * 0.8) * 0.2;
    const pulse = 1 + Math.sin(pulsePhase.current) * 0.08;
    if (root.current) root.current.scale.set(pulse, pulse, pulse);

    // Slow rotation
    root.current.rotation.y += dt * 0.5;

    // Attack — ghost flickers
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const flicker = Math.sin(attackPhase.current * 20) * 0.3;
      if (root.current) root.current.scale.set(1 + flicker, 1 + flicker, 1 + flicker);
    }
  });

  const ghostBlue = "#bae6fd";
  const coreGlow = "#7dd3fc";

  return (
    <group ref={root}>
      {/* Core octahedron body */}
      <mesh position={[0, 0, 0]} castShadow>
        <octahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial
          color={ghostBlue}
          emissive={coreGlow}
          emissiveIntensity={0.5}
          transparent
          opacity={0.75}
        />
      </mesh>
      {/* Inner core — brighter */}
      <mesh position={[0, 0, 0]}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial
          color="#e0f2fe"
          emissive={coreGlow}
          emissiveIntensity={1.0}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Wispy trails */}
      {[-0.3, 0, 0.3].map((dx, i) => (
        <mesh key={i} position={[dx, -0.5 - i * 0.1, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.08, 0.4, 6]} />
          <meshStandardMaterial
            color={ghostBlue}
            transparent
            opacity={0.4}
          />
        </mesh>
      ))}
      {/* Eyes */}
      <mesh position={[-0.15, 0.1, 0.45]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[0.15, 0.1, 0.45]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      {/* Icy aura */}
      <pointLight position={[0, 0, 0]} color="#7dd3fc" intensity={2} distance={6} />
    </group>
  );
}