// Dark Lord — the field boss. Imposing dark-armored demon king with
// twin curved horns, a flowing animated cape, a massive black sword,
// and a persistent purple aura.

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

type Props = {
  isMoving: () => boolean;
  isDead: () => boolean;
  isAttacking: () => boolean;
};

export function DarklordModel({ isMoving, isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const cape = useRef<THREE.Group>(null);
  const swordArm = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const aura = useRef<THREE.Mesh>(null);
  const phase = useRef(0);

  useFrame((_, dt) => {
    if (!root.current) return;
    const dead = isDead();
    const moving = isMoving();
    const attacking = isAttacking();

    if (dead) {
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2, dt * 4);
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, -0.3, dt * 4);
      return;
    }
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, dt * 4);
    root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, 0, dt * 4);

    phase.current += dt * (moving ? 4 : 1.5);
    // Idle bob
    if (root.current) root.current.position.y = Math.sin(phase.current) * 0.05;

    // Cape sway
    if (cape.current) {
      cape.current.rotation.x = Math.sin(phase.current * 0.7) * 0.18 + 0.15;
      cape.current.rotation.z = Math.cos(phase.current * 0.5) * 0.1;
    }
    // Eye pulse
    const eyePulse = 0.6 + Math.sin(phase.current * 3) * 0.4;
    if (leftEye.current)  (leftEye.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyePulse * 2;
    if (rightEye.current) (rightEye.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyePulse * 2;
    // Aura rotate
    if (aura.current) aura.current.rotation.y += dt * 0.5;
    // Sword swing on attack
    if (swordArm.current) {
      const target = attacking ? -Math.PI / 2 : -0.4;
      swordArm.current.rotation.x = THREE.MathUtils.lerp(swordArm.current.rotation.x, target, dt * 12);
    }
  });

  return (
    <group ref={root}>
      {/* Aura ring at feet */}
      <mesh ref={aura} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.3, 32]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.7, 24]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.18, 0.45, 0]}>
        <boxGeometry args={[0.28, 0.9, 0.28]} />
        <meshStandardMaterial color="#1a0510" flatShading metalness={0.4} />
      </mesh>
      <mesh position={[0.18, 0.45, 0]}>
        <boxGeometry args={[0.28, 0.9, 0.28]} />
        <meshStandardMaterial color="#1a0510" flatShading metalness={0.4} />
      </mesh>

      {/* Torso — dark plated armor */}
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[0.85, 0.8, 0.45]} />
        <meshStandardMaterial color="#1a0a1f" flatShading metalness={0.6} />
      </mesh>
      {/* Chest plate detail (red gem) */}
      <mesh position={[0, 1.35, 0.24]}>
        <boxGeometry args={[0.18, 0.18, 0.04]} />
        <meshStandardMaterial color="#7f1d1d" emissive="#dc2626" emissiveIntensity={1.2} flatShading />
      </mesh>
      {/* Shoulder pauldrons */}
      <mesh position={[-0.52, 1.55, 0]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#0a0510" flatShading metalness={0.7} />
      </mesh>
      <mesh position={[0.52, 1.55, 0]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#0a0510" flatShading metalness={0.7} />
      </mesh>
      {/* Spikes on pauldrons */}
      {[0, 1, 2].map((i) => (
        <mesh key={`spL${i}`} position={[-0.52, 1.7 - i * 0.05, 0]} rotation={[0, 0, -1.2]}>
          <coneGeometry args={[0.06, 0.22, 4]} />
          <meshStandardMaterial color="#1a0a1f" flatShading metalness={0.8} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={`spR${i}`} position={[0.52, 1.7 - i * 0.05, 0]} rotation={[0, 0, 1.2]}>
          <coneGeometry args={[0.06, 0.22, 4]} />
          <meshStandardMaterial color="#1a0a1f" flatShading metalness={0.8} />
        </mesh>
      ))}

      {/* Head — pale purple skin */}
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshStandardMaterial color="#3a1f3a" flatShading />
      </mesh>
      {/* Eyes — glowing red */}
      <mesh ref={leftEye} position={[-0.1, 2.0, 0.22]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={2} />
      </mesh>
      <mesh ref={rightEye} position={[0.1, 2.0, 0.22]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={2} />
      </mesh>
      {/* Horns — twin curved */}
      <mesh position={[-0.14, 2.28, 0.02]} rotation={[-0.3, 0, -0.5]}>
        <coneGeometry args={[0.07, 0.5, 6]} />
        <meshStandardMaterial color="#1a0510" flatShading metalness={0.7} />
      </mesh>
      <mesh position={[0.14, 2.28, 0.02]} rotation={[-0.3, 0, 0.5]}>
        <coneGeometry args={[0.07, 0.5, 6]} />
        <meshStandardMaterial color="#1a0510" flatShading metalness={0.7} />
      </mesh>
      {/* Crown above forehead */}
      <mesh position={[0, 2.22, 0.18]}>
        <torusGeometry args={[0.16, 0.04, 6, 12]} />
        <meshStandardMaterial color="#a16207" emissive="#92400e" emissiveIntensity={0.4} flatShading metalness={0.8} />
      </mesh>

      {/* Cape — flowing behind */}
      <group ref={cape} position={[0, 1.6, -0.22]}>
        <mesh position={[0, -0.5, 0]}>
          <boxGeometry args={[0.95, 1.4, 0.04]} />
          <meshStandardMaterial color="#3b0764" emissive="#581c87" emissiveIntensity={0.2} flatShading side={THREE.DoubleSide} />
        </mesh>
        {/* Cape lower jagged edge */}
        <mesh position={[-0.3, -1.25, 0]} rotation={[0, 0, 0.4]}>
          <coneGeometry args={[0.2, 0.35, 3]} />
          <meshStandardMaterial color="#3b0764" flatShading />
        </mesh>
        <mesh position={[0.3, -1.25, 0]} rotation={[0, 0, -0.4]}>
          <coneGeometry args={[0.2, 0.35, 3]} />
          <meshStandardMaterial color="#3b0764" flatShading />
        </mesh>
      </group>

      {/* Left arm — empty fist */}
      <mesh position={[-0.55, 1.05, 0]}>
        <boxGeometry args={[0.18, 0.7, 0.2]} />
        <meshStandardMaterial color="#1a0a1f" flatShading metalness={0.5} />
      </mesh>

      {/* Right arm + massive sword */}
      <group ref={swordArm} position={[0.55, 1.55, 0]}>
        <mesh position={[0, -0.35, 0]}>
          <boxGeometry args={[0.18, 0.7, 0.2]} />
          <meshStandardMaterial color="#1a0a1f" flatShading metalness={0.5} />
        </mesh>
        {/* Sword pommel */}
        <mesh position={[0, -0.75, 0]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#7f1d1d" emissive="#dc2626" emissiveIntensity={0.6} flatShading />
        </mesh>
        {/* Grip */}
        <mesh position={[0, -0.92, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.28, 8]} />
          <meshStandardMaterial color="#451a03" flatShading />
        </mesh>
        {/* Crossguard */}
        <mesh position={[0, -1.07, 0]}>
          <boxGeometry args={[0.3, 0.04, 0.08]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} flatShading />
        </mesh>
        {/* Blade — long, black metal with red glow */}
        <mesh position={[0, -1.7, 0]}>
          <boxGeometry args={[0.13, 1.2, 0.03]} />
          <meshStandardMaterial color="#0a0a0f" emissive="#7f1d1d" emissiveIntensity={0.4} flatShading metalness={0.9} />
        </mesh>
        <mesh position={[0, -2.32, 0]}>
          <coneGeometry args={[0.065, 0.15, 4]} />
          <meshStandardMaterial color="#0a0a0f" emissive="#dc2626" emissiveIntensity={0.6} flatShading metalness={0.9} />
        </mesh>
      </group>

      {/* Persistent lighting */}
      <pointLight position={[0, 1.5, 0.4]} color="#a855f7" intensity={3} distance={10} />
      <pointLight position={[0, 0.3, 0]} color="#dc2626" intensity={1.5} distance={5} />
    </group>
  );
}
