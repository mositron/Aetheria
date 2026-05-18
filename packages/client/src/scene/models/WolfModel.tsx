import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

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
      {/* body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.5, 0.45, 1.0]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* head */}
      <mesh position={[0, 0.7, 0.55]}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* snout */}
      <mesh position={[0, 0.62, 0.8]}>
        <boxGeometry args={[0.22, 0.18, 0.22]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      {/* ears */}
      <mesh position={[-0.15, 0.95, 0.5]} rotation={[0, 0, 0.3]}>
        <coneGeometry args={[0.08, 0.18, 4]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      <mesh position={[0.15, 0.95, 0.5]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.08, 0.18, 4]} />
        <meshStandardMaterial color={fur} />
      </mesh>
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
      {/* legs (4) */}
      <mesh ref={fl} position={[-0.18, 0.25, 0.35]}>
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      <mesh ref={fr} position={[0.18, 0.25, 0.35]}>
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      <mesh ref={bl} position={[-0.18, 0.25, -0.35]}>
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      <mesh ref={br} position={[0.18, 0.25, -0.35]}>
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* tail */}
      <mesh ref={tail} position={[0, 0.6, -0.55]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.4]} />
        <meshStandardMaterial color={fur} />
      </mesh>
    </group>
  );
}
