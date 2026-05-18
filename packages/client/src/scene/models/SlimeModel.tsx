import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { isDead?: () => boolean; isAttacking?: () => boolean };

export function SlimeModel({ isDead, isAttacking }: Props) {
  const body = useRef<THREE.Mesh>(null);
  const root = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const attackPhase = useRef(0);
  const nextBlink = useRef(performance.now() + 2000 + Math.random() * 3000);
  const blinkPhase = useRef(0);

  useFrame((_, dt) => {
    if (!body.current || !root.current) return;
    const dead = isDead?.() ?? false;
    if (dead) {
      body.current.scale.set(1.4, 0.2, 1.4);
      return;
    }
    const t = performance.now() * 0.003;
    let squish = 1 + Math.sin(t) * 0.12;

    if (isAttacking?.() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 3;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      squish = 1 - lunge * 0.4;
      root.current.position.z = lunge * 0.3;
    } else {
      root.current.position.z = 0;
    }

    body.current.scale.set(1 / squish, squish, 1 / squish);
    root.current.position.y = Math.abs(Math.sin(t * 1.2)) * 0.15;

    // Blink eyes
    const now = performance.now();
    if (blinkPhase.current > 0) {
      blinkPhase.current -= dt * 10;
      const sy = blinkPhase.current > 0 ? 0.1 : 1;
      if (leftEye.current) leftEye.current.scale.y = sy;
      if (rightEye.current) rightEye.current.scale.y = sy;
    } else if (now >= nextBlink.current) {
      blinkPhase.current = 1;
      nextBlink.current = now + 2500 + Math.random() * 3500;
    }
  });

  return (
    <group ref={root}>
      <mesh ref={body} position={[0, 0.4, 0]} castShadow>
        <sphereGeometry args={[0.45, 16, 12]} />
        <meshStandardMaterial color="#86efac" emissive="#22c55e" emissiveIntensity={0.18} transparent opacity={0.88} />
      </mesh>
      {/* shiny highlight on top */}
      <mesh position={[-0.1, 0.65, 0.15]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
      {/* big sparkly eye whites */}
      <mesh position={[-0.14, 0.5, 0.36]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[0.14, 0.5, 0.36]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color="white" />
      </mesh>
      {/* pupils (blink) */}
      <mesh ref={leftEye} position={[-0.14, 0.5, 0.42]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      <mesh ref={rightEye} position={[0.14, 0.5, 0.42]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      {/* eye highlights */}
      <mesh position={[-0.155, 0.53, 0.44]}>
        <sphereGeometry args={[0.018, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.155, 0.53, 0.44]}>
        <sphereGeometry args={[0.018, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* tiny smile */}
      <mesh position={[0, 0.36, 0.43]}>
        <boxGeometry args={[0.12, 0.02, 0.01]} />
        <meshBasicMaterial color="#166534" />
      </mesh>
      {/* cheeks */}
      <mesh position={[-0.28, 0.42, 0.3]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0.28, 0.42, 0.3]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
