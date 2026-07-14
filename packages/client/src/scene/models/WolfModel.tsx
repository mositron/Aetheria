import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundLimb, RoundTorso, RoundHead, RoundSpike } from "./organicPrimitives";

type Props = { isMoving: () => boolean; isDead?: () => boolean; isAttacking?: () => boolean };

export function WolfModel({ isMoving, isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const fl = useRef<THREE.Mesh>(null);
  const fr = useRef<THREE.Mesh>(null);
  const bl = useRef<THREE.Mesh>(null);
  const br = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Mesh>(null);
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
    if (moving) walkPhase.current += dt * 10;
    else walkPhase.current *= 0.85;
    const s = Math.sin(walkPhase.current) * (moving ? 0.6 : 0.05);
    if (fl.current) fl.current.rotation.x = s;
    if (br.current) br.current.rotation.x = s;
    if (fr.current) fr.current.rotation.x = -s;
    if (bl.current) bl.current.rotation.x = -s;
    if (tail.current) tail.current.rotation.z = Math.sin(performance.now() * 0.006) * 0.4;
    root.current.position.y = moving ? Math.abs(Math.sin(walkPhase.current * 2)) * 0.05 : 0;

    // attack lunge: pounce forward + bite
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      root.current.position.z = lunge * 0.5;
      root.current.rotation.x = -lunge * 0.3;
    } else {
      root.current.rotation.x = 0;
    }
  });

  const fur = "#6b7280";
  return (
    <group ref={root}>
      {/* body — rounded pill instead of a box; capsule's native axis (Y) is
          rotated 90° onto Z so it reads as a lean, nose-to-tail torso */}
      <group position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <RoundTorso width={0.5} height={1.0} depth={0.45} color={fur} castShadow />
      </group>
      {/* head */}
      <RoundHead radius={0.26} color={fur} position={[0, 0.7, 0.55]} />
      {/* snout — small forward-pointing capsule */}
      <RoundLimb length={0.32} radius={0.11} color="#4b5563" position={[0, 0.62, 0.8]} rotation={[Math.PI / 2, 0, 0]} />
      {/* ears */}
      <RoundSpike radius={0.08} height={0.18} color={fur} position={[-0.15, 0.95, 0.5]} rotation={[0, 0, 0.3]} />
      <RoundSpike radius={0.08} height={0.18} color={fur} position={[0.15, 0.95, 0.5]} rotation={[0, 0, -0.3]} />
      {/* eye whites */}
      <mesh position={[-0.1, 0.76, 0.72]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.1, 0.76, 0.72]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* pupils — bigger amber, with sparkle */}
      <mesh position={[-0.1, 0.76, 0.77]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#92400e" />
      </mesh>
      <mesh position={[0.1, 0.76, 0.77]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#92400e" />
      </mesh>
      <mesh position={[-0.115, 0.79, 0.79]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.085, 0.79, 0.79]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* nose (cute pink) */}
      <mesh position={[0, 0.66, 0.92]}>
        <boxGeometry args={[0.08, 0.06, 0.04]} />
        <meshBasicMaterial color="#f472b6" />
      </mesh>
      {/* legs (4) — rounded capsules */}
      <RoundLimb ref={fl} length={0.5} radius={0.07} color={fur} position={[-0.18, 0.25, 0.35]} />
      <RoundLimb ref={fr} length={0.5} radius={0.07} color={fur} position={[0.18, 0.25, 0.35]} />
      <RoundLimb ref={bl} length={0.5} radius={0.07} color={fur} position={[-0.18, 0.25, -0.35]} />
      <RoundLimb ref={br} length={0.5} radius={0.07} color={fur} position={[0.18, 0.25, -0.35]} />
      {/* tail — capsule tilted up-and-back, same pose as the old box */}
      <RoundLimb ref={tail} length={0.4} radius={0.06} color={fur} position={[0, 0.6, -0.55]} rotation={[Math.PI / 2 + 0.4, 0, 0]} />
    </group>
  );
}
