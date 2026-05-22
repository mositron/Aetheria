import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isMoving: () => boolean; isDead?: () => boolean; isAttacking?: () => boolean };

export function SandWormModel({ isMoving, isDead, isAttacking }: Props) {
  const root = useRef<THREE.Group>(null);
  const segments = useRef<THREE.Mesh[]>([]);
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
    if (moving) walkPhase.current += dt * 8;
    else walkPhase.current *= 0.85;

    // Wave motion along the segmented body
    const phase = walkPhase.current;
    segments.current.forEach((seg, i) => {
      if (!seg) return;
      const offset = i * 0.35;
      const wave = Math.sin(phase + offset) * 0.08;
      seg.position.y = 0.3 + Math.abs(Math.sin(phase + offset)) * 0.1;
      seg.rotation.x = wave;
    });

    // Attack lunge
    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 3;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      root.current.position.z = lunge * 0.4;
    } else {
      root.current.position.z = 0;
    }
  });

  const segmentCount = 6;
  const segColors = ["#c2a87c", "#d4b896", "#c9a875", "#bf9f6a", "#cbb585", "#c0a06b"];

  return (
    <group ref={root}>
      {/* Head segment — slightly larger */}
      <mesh position={[0, 0.4, 0.6]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.5, 8]} />
        <meshStandardMaterial color="#e8d5b5" />
      </mesh>
      {/* Head eyes */}
      <mesh position={[-0.12, 0.55, 0.85]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#92400e" />
      </mesh>
      <mesh position={[0.12, 0.55, 0.85]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#92400e" />
      </mesh>
      {/* Body segments */}
      {Array.from({ length: segmentCount }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) segments.current[i] = el; }}
          position={[0, 0.3, 0.2 - i * 0.4]}
          castShadow
        >
          <cylinderGeometry args={[0.25 - i * 0.015, 0.28 - i * 0.015, 0.35, 8]} />
          <meshStandardMaterial color={segColors[i % segColors.length]} />
        </mesh>
      ))}
      {/* Tail */}
      <mesh position={[0, 0.25, -2.4]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.18, 0.5, 8]} />
        <meshStandardMaterial color="#a0835a" />
      </mesh>
    </group>
  );
}