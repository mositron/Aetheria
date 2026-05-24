// Orc — green muscular brute with tusks, a loincloth, and a primitive
// wooden club. Sways when walking, swings club on attack.

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

type Props = {
  isMoving: () => boolean;
  isDead: () => boolean;
  isAttacking: () => boolean;
};

export function OrcModel({ isMoving, isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const club = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const phase = useRef(0);

  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) {
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2, dt * 4);
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, -0.2, dt * 4);
      return;
    }
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, dt * 4);

    phase.current += dt * (isMoving() ? 6 : 1.5);
    const sway = Math.sin(phase.current);
    if (torso.current) torso.current.rotation.z = sway * 0.06;
    if (leftLeg.current)  leftLeg.current.rotation.x  = isMoving() ? sway * 0.55 : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = isMoving() ? -sway * 0.55 : 0;
    if (root.current)     root.current.position.y     = Math.abs(sway) * 0.04;

    // Club swing
    if (club.current) {
      const target = isAttacking() ? -Math.PI * 0.7 : -0.3;
      club.current.rotation.x = THREE.MathUtils.lerp(club.current.rotation.x, target, dt * 14);
    }
  });

  return (
    <group ref={root}>
      {/* Legs — thick green */}
      <mesh ref={leftLeg} position={[-0.18, 0.45, 0]}>
        <boxGeometry args={[0.3, 0.85, 0.3]} />
        <meshStandardMaterial color="#3f5223" flatShading />
      </mesh>
      <mesh ref={rightLeg} position={[0.18, 0.45, 0]}>
        <boxGeometry args={[0.3, 0.85, 0.3]} />
        <meshStandardMaterial color="#3f5223" flatShading />
      </mesh>
      {/* Loincloth */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.72, 0.45, 0.42]} />
        <meshStandardMaterial color="#451a03" flatShading />
      </mesh>

      <group ref={torso}>
        {/* Torso — muscular green */}
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.85, 0.78, 0.5]} />
          <meshStandardMaterial color="#4a7c2a" flatShading />
        </mesh>
        {/* Belt buckle */}
        <mesh position={[0, 0.85, 0.26]}>
          <boxGeometry args={[0.16, 0.1, 0.04]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.6} flatShading />
        </mesh>
        {/* Battle scars on chest (two diagonal lines) */}
        <mesh position={[-0.12, 1.25, 0.26]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.04, 0.32, 0.02]} />
          <meshStandardMaterial color="#3a1f10" />
        </mesh>

        {/* Head — large green block */}
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#5a8c3e" flatShading />
        </mesh>
        {/* Yellow glowing eyes */}
        <mesh position={[-0.11, 1.92, 0.26]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#fbbf24" emissive="#facc15" emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[0.11, 1.92, 0.26]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#fbbf24" emissive="#facc15" emissiveIntensity={1.5} />
        </mesh>
        {/* Tusks pointing up */}
        <mesh position={[-0.1, 1.78, 0.25]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[0.04, 0.22, 4]} />
          <meshStandardMaterial color="#fef3c7" flatShading />
        </mesh>
        <mesh position={[0.1, 1.78, 0.25]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.04, 0.22, 4]} />
          <meshStandardMaterial color="#fef3c7" flatShading />
        </mesh>
        {/* Spiky hair — dark */}
        <mesh position={[-0.15, 2.13, -0.05]} rotation={[0.3, 0, 0]}>
          <coneGeometry args={[0.07, 0.2, 4]} />
          <meshStandardMaterial color="#0f0a05" flatShading />
        </mesh>
        <mesh position={[0, 2.18, 0]}>
          <coneGeometry args={[0.07, 0.22, 4]} />
          <meshStandardMaterial color="#0f0a05" flatShading />
        </mesh>
        <mesh position={[0.15, 2.13, -0.05]} rotation={[0.3, 0, 0]}>
          <coneGeometry args={[0.07, 0.2, 4]} />
          <meshStandardMaterial color="#0f0a05" flatShading />
        </mesh>

        {/* Red headband */}
        <mesh position={[0, 2.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.04, 6, 12]} />
          <meshStandardMaterial color="#7f1d1d" flatShading />
        </mesh>

        {/* Left arm — bare green */}
        <mesh position={[-0.5, 1.1, 0]} rotation={[0, 0, 0.1]}>
          <boxGeometry args={[0.2, 0.75, 0.25]} />
          <meshStandardMaterial color="#4a7c2a" flatShading />
        </mesh>

        {/* Right arm holding club */}
        <group ref={club} position={[0.5, 1.5, 0]}>
          {/* Arm */}
          <mesh position={[0, -0.38, 0]}>
            <boxGeometry args={[0.2, 0.75, 0.25]} />
            <meshStandardMaterial color="#4a7c2a" flatShading />
          </mesh>
          {/* Club handle */}
          <mesh position={[0, -0.85, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
            <meshStandardMaterial color="#451a03" flatShading />
          </mesh>
          {/* Club head — bulbous wood with iron studs */}
          <mesh position={[0, -1.25, 0]}>
            <cylinderGeometry args={[0.18, 0.14, 0.45, 12]} />
            <meshStandardMaterial color="#78350f" flatShading />
          </mesh>
          {/* Iron studs */}
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[Math.cos(i * Math.PI / 2) * 0.18, -1.25, Math.sin(i * Math.PI / 2) * 0.18]}>
              <sphereGeometry args={[0.04, 6, 6]} />
              <meshStandardMaterial color="#64748b" metalness={0.8} flatShading />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
