import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isMoving: () => boolean; isDead?: () => boolean; isAttacking?: () => boolean };

export function ScorpionLordModel({ isMoving, isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const leftPincer = useRef<THREE.Group>(null);
  const rightPincer = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);

  useFrame((_, dt) => {
    if (!root.current) return;
    const dead = isDead?.() ?? false;
    if (dead) {
      root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, Math.PI / 2, 0.1);
      return;
    }
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, 0, 0.2);

    const moving = isMoving();
    if (moving) walkPhase.current += dt * 6;
    else walkPhase.current *= 0.8;

    // Pincer open/close animation
    const pincerAngle = Math.sin(walkPhase.current * 2) * 0.4;
    if (leftPincer.current) leftPincer.current.rotation.z = pincerAngle;
    if (rightPincer.current) rightPincer.current.rotation.z = -pincerAngle;

    // Tail sway
    if (tail.current) tail.current.rotation.x = Math.sin(performance.now() * 0.003) * 0.3;
    if (tail.current) tail.current.rotation.z = Math.sin(performance.now() * 0.002) * 0.15;

    // Attack lunge
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 3;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      root.current.position.z = lunge * 0.5;
    } else {
      root.current.position.z = 0;
    }
  });

  const bodyColor = "#7c1d6f";
  const darkRed = "#991b1b";

  return (
    <group ref={root}>
      {/* Body — oval cephalothorax */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.9, 0.6, 1.2]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      {/* Abdomen */}
      <mesh position={[0, 0.4, -0.9]} castShadow>
        <boxGeometry args={[0.75, 0.55, 0.9]} />
        <meshStandardMaterial color={darkRed} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.55, 0.75]}>
        <boxGeometry args={[0.6, 0.5, 0.5]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      {/* Pedipalps (pincers) — left */}
      <group ref={leftPincer} position={[-0.45, 0.5, 0.75]}>
        <mesh position={[-0.2, 0, 0]} rotation={[0, 0, 0.3]} castShadow>
          <boxGeometry args={[0.15, 0.15, 0.7]} />
          <meshStandardMaterial color={darkRed} />
        </mesh>
        <mesh position={[-0.55, -0.15, 0.1]} rotation={[0.2, 0, 0.6]}>
          <boxGeometry args={[0.2, 0.15, 0.45]} />
          <meshStandardMaterial color={darkRed} />
        </mesh>
      </group>
      {/* Right pincer */}
      <group ref={rightPincer} position={[0.45, 0.5, 0.75]}>
        <mesh position={[0.2, 0, 0]} rotation={[0, 0, -0.3]} castShadow>
          <boxGeometry args={[0.15, 0.15, 0.7]} />
          <meshStandardMaterial color={darkRed} />
        </mesh>
        <mesh position={[0.55, -0.15, 0.1]} rotation={[0.2, 0, -0.6]}>
          <boxGeometry args={[0.2, 0.15, 0.45]} />
          <meshStandardMaterial color={darkRed} />
        </mesh>
      </group>
      {/* Eyes */}
      <mesh position={[-0.12, 0.75, 1.0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0.12, 0.75, 1.0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* Legs — 6 pairs */}
      {[0.3, 0, -0.3].map((z, row) =>
        [-1, 1].map((side) => (
          <mesh key={`${row}-${side}`} position={[side * 0.55, 0.25, 0.2 + z]} castShadow>
            <boxGeometry args={[0.1, 0.5, 0.12]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
        ))
      )}
      {/* Tail + stinger */}
      <group ref={tail} position={[0, 0.4, -1.3]}>
        <mesh position={[0, 0.2, -0.4]} rotation={[0.5, 0, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 0.7, 8]} />
          <meshStandardMaterial color={darkRed} />
        </mesh>
        <mesh position={[0, 0.55, -0.8]} rotation={[0.8, 0, 0]}>
          <coneGeometry args={[0.1, 0.35, 8]} />
          <meshStandardMaterial color="#450a0a" />
        </mesh>
      </group>
      {/* Boss aura */}
      <pointLight position={[0, 1, 0]} color="#a855f7" intensity={2} distance={8} />
    </group>
  );
}