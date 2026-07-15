import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundLimb, RoundTorso, RoundHead } from "./organicPrimitives";

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
      {/* Body — oval cephalothorax. RoundTorso's "height" param is its long
          (capsule) axis, so we build it long-and-flat in the wrapper's local
          Y then rotate 90° about X to lay that long axis flat along world Z —
          keeps the body low & wide instead of collapsing into a tall pill. */}
      <group position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <RoundTorso width={0.9} height={1.2} depth={0.6} color={bodyColor} castShadow />
      </group>
      {/* Abdomen */}
      <group position={[0, 0.4, -0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <RoundTorso width={0.75} height={0.9} depth={0.55} color={darkRed} castShadow />
      </group>
      {/* Head */}
      <RoundHead radius={0.28} color={bodyColor} position={[0, 0.55, 0.75]} />
      {/* Pedipalps (pincers) — left. Upper-arm + claw segments as capsules,
          tipped from their default vertical orientation to reach forward. */}
      <group ref={leftPincer} position={[-0.45, 0.5, 0.75]}>
        <RoundLimb length={0.55} radius={0.08} color={darkRed} position={[-0.22, 0, 0.15]} rotation={[1.15, 0, 0.5]} />
        <RoundLimb length={0.4} radius={0.11} color={darkRed} position={[-0.5, -0.05, 0.4]} rotation={[0.9, 0, 0.9]} />
      </group>
      {/* Right pincer (mirrored) */}
      <group ref={rightPincer} position={[0.45, 0.5, 0.75]}>
        <RoundLimb length={0.55} radius={0.08} color={darkRed} position={[0.22, 0, 0.15]} rotation={[1.15, 0, -0.5]} />
        <RoundLimb length={0.4} radius={0.11} color={darkRed} position={[0.5, -0.05, 0.4]} rotation={[0.9, 0, -0.9]} />
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
      {/* Legs — 6 pairs, thin capsules with a slight outward splay at the foot */}
      {[0.3, 0, -0.3].map((z, row) =>
        [-1, 1].map((side) => (
          <RoundLimb
            key={`${row}-${side}`}
            length={0.5}
            radius={0.06}
            color={bodyColor}
            position={[side * 0.55, 0.25, 0.2 + z]}
            rotation={[0, 0, side * 0.3]}
          />
        ))
      )}
      {/* Tail + stinger */}
      <group ref={tail} position={[0, 0.4, -1.3]}>
        <mesh position={[0, 0.2, -0.4]} rotation={[0.5, 0, 0]}>
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