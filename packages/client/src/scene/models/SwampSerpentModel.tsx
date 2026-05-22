import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isMoving?: () => boolean; isDead?: () => boolean; isAttacking?: () => boolean };

export function SwampSerpentModel({ isMoving, isDead, isAttacking }: Props) {
  const group = useRef<THREE.Group>(null);
  const snakeRef = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);

  useFrame((_, dt) => {
    if (!group.current) return;
    const dead = isDead?.() ?? false;
    if (dead) {
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, Math.PI / 2, 0.1);
      return;
    }
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, 0.2);

    const moving = isMoving?.() ?? false;
    if (moving) walkPhase.current += dt * 6;
    else walkPhase.current *= 0.85;

    // Snake wave motion
    if (snakeRef.current) {
      snakeRef.current.rotation.y = Math.sin(walkPhase.current) * 0.2;
    }

    // Attack lunge
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 3;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      group.current.position.x = lunge * 0.5;
    } else {
      group.current.position.x = 0;
    }
  });

  return (
    <group ref={group}>
      {/* Body - multiple segments */}
      <group ref={snakeRef}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[-i * 0.25, 0.2, Math.sin(i * 0.5) * 0.15]}>
            <sphereGeometry args={[0.12 - i * 0.01, 8, 8]} />
            <meshStandardMaterial color={i % 2 === 0 ? "#2d5a27" : "#4a7c42"} />
          </mesh>
        ))}
        {/* Head */}
        <mesh position={[0.15, 0.25, 0]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshStandardMaterial color="#3d6b35" />
        </mesh>
        {/* Fangs */}
        <mesh position={[0.28, 0.18, 0.05]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.03, 0.12, 6]} />
          <meshStandardMaterial color="#f0f0f0" />
        </mesh>
        <mesh position={[0.28, 0.18, -0.05]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.03, 0.12, 6]} />
          <meshStandardMaterial color="#f0f0f0" />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.22, 0.32, 0.08]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color="#ff4444" emissive="#ff4444" emissiveIntensity={1} />
        </mesh>
        <mesh position={[0.22, 0.32, -0.08]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color="#ff4444" emissive="#ff4444" emissiveIntensity={1} />
        </mesh>
        {/* Venom drip */}
        <mesh position={[0.35, 0.1, 0]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color="#84cc16" transparent opacity={0.7} />
        </mesh>
      </group>
      {/* Subtle ambient glow */}
      <pointLight color="#84cc16" intensity={0.5} distance={2} position={[0, 0.3, 0]} />
    </group>
  );
}