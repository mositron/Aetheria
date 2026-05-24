import { useRef } from "react";
import React from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CompanionKind } from "@game/shared";

type Props = {
  kind: CompanionKind;
  isDead?: () => boolean;
  isAttacking?: () => boolean;
};

const COMPANION_TINTS: Record<CompanionKind, { body: string; emissive: string; accent: string }> = {
  pal_flame:  { body: "#ff6b35", emissive: "#ff4500", accent: "#ffd166" },
  pal_grass:  { body: "#52b788", emissive: "#2d6a4f", accent: "#95d5b2" },
  pal_aqua:   { body: "#4cc9f0", emissive: "#0077b6", accent: "#caf0f8" },
  pal_shock:  { body: "#f9c74f", emissive: "#e09f3e", accent: "#fff3b0" },
  pal_earth:  { body: "#bc6c25", emissive: "#6a4c13", accent: "#dda15e" },
};

const COMPANION_ROLE_EMISSIVE: Record<CompanionKind, number> = {
  pal_flame: 0.28,
  pal_grass: 0.18,
  pal_aqua:  0.22,
  pal_shock: 0.24,
  pal_earth: 0.14,
};

const bounceSpeed: Record<CompanionKind, number> = {
  pal_flame: 1.4,
  pal_grass: 0.8,
  pal_aqua:  1.1,
  pal_shock: 1.6,
  pal_earth: 0.65,
};

export const CompanionModel = React.memo(function CompanionModel({ kind, isDead, isAttacking }: Props) {
  const body     = useRef<THREE.Mesh>(null);
  const root     = useRef<THREE.Group>(null);
  const leftEye  = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const attackPhase  = useRef(0);
  const nextBlink    = useRef(performance.now() + 1800 + Math.random() * 2500);
  const blinkPhase   = useRef(0);

  const tint       = COMPANION_TINTS[kind];
  const emissiveInt = COMPANION_ROLE_EMISSIVE[kind];

  useFrame((_, dt) => {
    if (!body.current || !root.current) return;

    const dead = isDead?.() ?? false;
    if (dead) {
      body.current.scale.set(1.4, 0.2, 1.4);
      return;
    }

    const t = performance.now() * 0.003 * bounceSpeed[kind];
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

    // Blink
    const now = performance.now();
    if (blinkPhase.current > 0) {
      blinkPhase.current -= dt * 10;
      const sy = blinkPhase.current > 0 ? 0.1 : 1;
      if (leftEye.current)  leftEye.current.scale.y  = sy;
      if (rightEye.current) rightEye.current.scale.y = sy;
    } else if (now >= nextBlink.current) {
      blinkPhase.current = 1;
      nextBlink.current = now + 2200 + Math.random() * 3000;
    }
  });

  return (
    <group ref={root}>
      {/* ---- Body ---- */}
      <mesh ref={body} position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.45, 18, 14]} />
        <meshStandardMaterial
          color={tint.body}
          emissive={tint.emissive}
          emissiveIntensity={emissiveInt}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* ---- Top highlight ---- */}
      <mesh position={[-0.1, 0.68, 0.15]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} />
      </mesh>

      {/* ---- Eye whites ---- */}
      <mesh position={[-0.14, 0.52, 0.37]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[0.14, 0.52, 0.37]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color="white" />
      </mesh>

      {/* ---- Pupils (blink ref) ---- */}
      <mesh ref={leftEye} position={[-0.14, 0.52, 0.43]}>
        <sphereGeometry args={[0.052, 8, 8]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      <mesh ref={rightEye} position={[0.14, 0.52, 0.43]}>
        <sphereGeometry args={[0.052, 8, 8]} />
        <meshBasicMaterial color="#111" />
      </mesh>

      {/* ---- Eye highlights ---- */}
      <mesh position={[-0.155, 0.545, 0.455]}>
        <sphereGeometry args={[0.018, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.155, 0.545, 0.455]}>
        <sphereGeometry args={[0.018, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* ---- Smile ---- */}
      <mesh position={[0, 0.37, 0.44]}>
        <boxGeometry args={[0.12, 0.022, 0.01]} />
        <meshBasicMaterial color={tint.emissive} />
      </mesh>

      {/* ---- Cheeks ---- */}
      <mesh position={[-0.27, 0.44, 0.3]}>
        <sphereGeometry args={[0.058, 6, 6]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.45} />
      </mesh>
      <mesh position={[0.27, 0.44, 0.3]}>
        <sphereGeometry args={[0.058, 6, 6]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.45} />
      </mesh>

      {/* ---- Role-specific accent ---- */}
      {kind === "pal_flame" && (
        <mesh position={[0, 0.58, 0.34]} rotation={[0.3, 0, 0]}>
          <coneGeometry args={[0.07, 0.14, 6]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
      )}
      {kind === "pal_grass" && (
        <mesh position={[0, 0.6, 0.3]} rotation={[0.2, 0.4, 0]}>
          <coneGeometry args={[0.05, 0.12, 4]} />
          <meshBasicMaterial color="#95d5b2" />
        </mesh>
      )}
      {kind === "pal_aqua" && (
        <mesh position={[0, 0.62, 0.32]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshBasicMaterial color="#caf0f8" transparent opacity={0.75} />
        </mesh>
      )}
      {kind === "pal_shock" && (
        <mesh position={[0, 0.6, 0.32]} rotation={[0.1, 0, 0.3]}>
          <boxGeometry args={[0.04, 0.1, 0.03]} />
          <meshBasicMaterial color="#fff3b0" />
        </mesh>
      )}
      {kind === "pal_earth" && (
        <mesh position={[0, 0.56, 0.34]}>
          <boxGeometry args={[0.1, 0.07, 0.07]} />
          <meshBasicMaterial color="#dda15e" />
        </mesh>
      )}
    </group>
  );
});