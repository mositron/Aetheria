import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isMoving?: () => boolean; isDead?: () => boolean; isAttacking?: () => boolean };

export function BogWitchModel({ isMoving, isDead, isAttacking }: Props) {
  const group = useRef<THREE.Group>(null);
  const robeRef = useRef<THREE.Mesh>(null);
  const staffOrbRef = useRef<THREE.Mesh>(null);
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
    if (moving) walkPhase.current += dt * 4;
    else walkPhase.current *= 0.85;

    // Gentle robe sway
    if (robeRef.current) {
      robeRef.current.rotation.y = Math.sin(walkPhase.current) * 0.15;
    }

    // Staff orb pulse
    if (staffOrbRef.current) {
      const s = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
      (staffOrbRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + s;
    }

    // Attack lunge
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 3;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      group.current.position.x = lunge * 0.3;
    } else {
      group.current.position.x = 0;
    }
  });

  return (
    <group ref={group}>
      {/* Robe / body */}
      <mesh ref={robeRef} position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.2, 0.4, 1.2, 8]} />
        <meshStandardMaterial color="#2d4a3e" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#c4a882" />
      </mesh>
      {/* Witch hat */}
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[0.25, 0.5, 8]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Staff */}
      <mesh position={[0.3, 0.8, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.03, 0.03, 1.5, 6]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>
      {/* Staff orb */}
      <mesh ref={staffOrbRef} position={[0.4, 1.6, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#86efac" emissive="#86efac" emissiveIntensity={2} />
      </mesh>
      {/* Swamp aura */}
      <pointLight color="#4ade80" intensity={1} distance={3} position={[0, 1.2, 0]} />
    </group>
  );
}