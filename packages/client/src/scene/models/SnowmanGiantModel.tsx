import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isDead?: () => boolean; isAttacking?: () => boolean };

export function SnowmanGiantModel({ isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const attackPhase = useRef(0);

  useFrame((_, dt) => {
    if (!root.current) return;
    const dead = isDead?.() ?? false;
    if (dead) {
      root.current.scale.set(1.3, 0.4, 1.3);
      return;
    }

    // Slight idle sway (friendly)
    const t = performance.now() * 0.001;
    root.current.rotation.z = Math.sin(t * 0.7) * 0.03;

    // Attack — sway forward aggressively
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 3;
      const lunge = Math.sin((1 - attackPhase.current) * Math.PI) * 0.15;
      root.current.rotation.x = -lunge;
    } else {
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, 0.1);
    }
  });

  return (
    <group ref={root}>
      {/* Lower body — large snow sphere */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <sphereGeometry args={[0.9, 16, 12]} />
        <meshStandardMaterial color="#f0f9ff" />
      </mesh>
      {/* Middle body */}
      <mesh position={[0, 1.9, 0]} castShadow>
        <sphereGeometry args={[0.65, 16, 12]} />
        <meshStandardMaterial color="#e0f2fe" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 2.7, 0]} castShadow>
        <sphereGeometry args={[0.5, 16, 12]} />
        <meshStandardMaterial color="#f8fbff" />
      </mesh>
      {/* Carrot nose — orange cone */}
      <mesh position={[0, 2.68, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.07, 0.45, 8]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      {/* Eyes — coal black */}
      <mesh position={[-0.15, 2.82, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0.15, 2.82, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#1f2937" />
      </mesh>
      {/* Smile — small coal dots */}
      {[-0.2, -0.1, 0, 0.1, 0.2].map((dx, i) => (
        <mesh key={i} position={[dx, 2.55 + Math.abs(dx) * 0.1, 0.45]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color="#1f2937" />
        </mesh>
      ))}
      {/* Top hat */}
      <mesh position={[0, 3.25, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 3.55, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.35, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Stick arms */}
      <mesh position={[-0.85, 1.9, 0]} rotation={[0, 0, 0.4]}>
        <cylinderGeometry args={[0.04, 0.04, 0.8, 6]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      <mesh position={[0.85, 1.9, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.04, 0.04, 0.8, 6]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      {/* Scarf */}
      <mesh position={[0, 2.25, 0.35]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.8, 0.12, 0.15]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* Buttons */}
      {[-0.15, 0.15].map((dz, row) => (
        <mesh key={row} position={[0, 1.9 - row * 0.3, 0.6]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color="#1f2937" />
        </mesh>
      ))}
      {/* Boss glow */}
      <pointLight position={[0, 2, 0]} color="#bfdbfe" intensity={2} distance={10} />
    </group>
  );
}