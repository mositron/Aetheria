// Procedural treasure chest — closed (wood box + iron banding + lock + glow)
// or opened (lid rotated 110°, sparkle particles).

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const THEME_GEM: Record<string, string> = {
  shadow: "#a855f7",
  frost: "#7dd3fc",
  desert: "#fcd34d",
  swamp: "#a3e635",
  forest: "#22c55e",
  wilderness: "#ef4444",
};

export function ChestModel({
  theme,
  opened,
  onClick,
  onHoverIn,
  onHoverOut,
}: {
  theme: string;
  opened: boolean;
  onClick: () => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}) {
  const lidRef = useRef<THREE.Group>(null);
  const sparkleRef = useRef<THREE.Group>(null);
  const gem = THEME_GEM[theme] ?? "#fbbf24";

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Smoothly animate lid open/closed
    if (lidRef.current) {
      const target = opened ? -1.9 : 0;
      lidRef.current.rotation.x += (target - lidRef.current.rotation.x) * 0.15;
    }
    // Sparkle bob when opened
    if (sparkleRef.current) {
      sparkleRef.current.visible = opened;
      if (opened) {
        sparkleRef.current.position.y = 0.6 + Math.sin(t * 3) * 0.1;
        sparkleRef.current.rotation.y = t * 0.8;
      }
    }
  });

  return (
    <group
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onHoverIn?.(); }}
      onPointerOut={() => onHoverOut?.()}
    >
      {/* Base box */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.6, 0.7]} />
        <meshStandardMaterial color="#6b4226" roughness={0.85} />
      </mesh>
      {/* Iron banding (front + sides) */}
      <mesh position={[0, 0.3, 0.36]}>
        <boxGeometry args={[1.02, 0.1, 0.02]} />
        <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.55, 0.36]}>
        <boxGeometry args={[1.02, 0.06, 0.02]} />
        <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* Lock — front center */}
      <mesh position={[0, 0.4, 0.37]}>
        <boxGeometry args={[0.18, 0.18, 0.05]} />
        <meshStandardMaterial color={opened ? "#444" : "#fbbf24"} metalness={0.8} roughness={0.3} emissive={opened ? "#000" : gem} emissiveIntensity={opened ? 0 : 0.4} />
      </mesh>
      {/* Lid — rotates open */}
      <group ref={lidRef} position={[0, 0.62, -0.35]}>
        <mesh position={[0, 0.13, 0.35]} castShadow>
          <boxGeometry args={[1.0, 0.26, 0.7]} />
          <meshStandardMaterial color="#7a4d2b" roughness={0.85} />
        </mesh>
        {/* Lid banding */}
        <mesh position={[0, 0.13, 0.71]}>
          <boxGeometry args={[1.02, 0.08, 0.02]} />
          <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
      {/* Sparkle inside opened chest */}
      <group ref={sparkleRef} position={[0, 0.6, 0]} visible={false}>
        <mesh>
          <octahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial color={gem} emissive={gem} emissiveIntensity={1.5} />
        </mesh>
        <pointLight color={gem} intensity={1.5} distance={3} />
      </group>
      {/* Idle glow when closed (theme color) */}
      {!opened && (
        <pointLight position={[0, 0.5, 0]} color={gem} intensity={0.6} distance={2.5} />
      )}
    </group>
  );
}
