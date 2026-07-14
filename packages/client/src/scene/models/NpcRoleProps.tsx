// Role-specific NPC accessories — apron, hammer, scroll, glasses, etc.
// Rendered ALONGSIDE HeroModel so the body is consistent but the role is
// instantly recognizable.
//
// Drop new roles in by adding a case to the switch + a small render fn.

import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Appearance } from "@game/shared";

export type NpcRole =
  | "carpenter" | "blacksmith" | "merchant" | "scholar"
  | "tutor" | "waypoint" | "guard" | "generic";

/** Map known NPC ids to a role; fallback "generic". */
export function roleFromNpcId(id: string): NpcRole {
  if (id.startsWith("carpenter")) return "carpenter";
  if (id.startsWith("blacksmith")) return "blacksmith";
  if (id.startsWith("merchant")) return "merchant";
  if (id.startsWith("scholar")) return "scholar";
  if (id.startsWith("tutor")) return "tutor";
  if (id.startsWith("waypoint")) return "waypoint";
  if (id.startsWith("guard")) return "guard";
  return "generic";
}

/** Override appearance for role identity (so carpenter always looks like a carpenter). */
export function appearanceForRole(role: NpcRole, base: Appearance): Appearance {
  switch (role) {
    case "carpenter":
      return { ...base, shirt: "#a16207", pants: "#451a03", hat: "cap", hatColor: "#78350f", body: "wide" };
    case "blacksmith":
      return { ...base, shirt: "#3f3f46", pants: "#1c1917", hat: "headband", hatColor: "#dc2626", body: "wide" };
    case "merchant":
      return { ...base, shirt: "#fbbf24", pants: "#7c2d12", hat: "cap", hatColor: "#92400e", scarf: "regular", scarfColor: "#dc2626" };
    case "scholar":
      return { ...base, shirt: "#7c3aed", pants: "#1e1b4b", hairStyle: "long", glasses: "round", scarf: "long", scarfColor: "#fbbf24" };
    case "tutor":
      return { ...base, shirt: "#22d3ee", pants: "#0e7490", hat: "wizard", hatColor: "#0891b2", hairStyle: "long" };
    case "waypoint":
      return { ...base, shirt: "#6366f1", pants: "#312e81", hat: "wizard", hatColor: "#4338ca", scarf: "long", scarfColor: "#8b5cf6" };
    case "guard":
      return { ...base, shirt: "#475569", pants: "#1e293b", hat: "crown", hatColor: "#cbd5e1", body: "wide" };
    default:
      return base;
  }
}

/** Render role accessories — hammers, scrolls, weapons — next to / on the NPC. */
export function NpcRoleProps({ role }: { role: NpcRole }) {
  switch (role) {
    case "carpenter":  return <CarpenterProps />;
    case "blacksmith": return <BlacksmithProps />;
    case "merchant":   return <MerchantProps />;
    case "scholar":    return <ScholarProps />;
    case "tutor":      return <TutorProps />;
    case "waypoint":   return <WaypointProps />;
    case "guard":      return <GuardProps />;
    default:           return null;
  }
}

// ── Per-role mesh fragments ───────────────────────────────────────────────

function CarpenterProps() {
  return (
    <group>
      {/* Apron — dark brown plane on chest */}
      <RoundedBox args={[0.5, 0.55, 0.04]} radius={0.03} smoothness={2} position={[0, 0.95, 0.18]}>
        <meshStandardMaterial color="#78350f" flatShading />
      </RoundedBox>
      {/* Hammer in right hand */}
      <group position={[0.42, 0.85, 0.05]} rotation={[0, 0, -0.3]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
          <meshStandardMaterial color="#451a03" flatShading />
        </mesh>
        <RoundedBox args={[0.16, 0.12, 0.12]} radius={0.025} smoothness={2} position={[0, 0.28, 0]}>
          <meshStandardMaterial color="#64748b" flatShading />
        </RoundedBox>
      </group>
      {/* Plank under arm */}
      <RoundedBox args={[0.7, 0.06, 0.18]} radius={0.02} smoothness={2} position={[-0.4, 0.95, 0]} rotation={[0, 0, 0.3]}>
        <meshStandardMaterial color="#a16207" flatShading />
      </RoundedBox>
    </group>
  );
}

function BlacksmithProps() {
  return (
    <group>
      {/* Heavy leather apron */}
      <RoundedBox args={[0.6, 0.7, 0.05]} radius={0.03} smoothness={2} position={[0, 0.85, 0.2]}>
        <meshStandardMaterial color="#1c1917" flatShading />
      </RoundedBox>
      {/* Anvil at feet */}
      <group position={[0.6, 0.18, 0]}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.36, 0.12, 0.22]} />
          <meshStandardMaterial color="#27272a" flatShading metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.5, 0.12, 0.16]} />
          <meshStandardMaterial color="#52525b" flatShading metalness={0.7} />
        </mesh>
      </group>
      {/* Hammer in hand */}
      <group position={[-0.42, 0.85, 0.05]} rotation={[0, 0, 0.3]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.05, 0.55, 8]} />
          <meshStandardMaterial color="#1c1917" flatShading />
        </mesh>
        <RoundedBox args={[0.2, 0.18, 0.14]} radius={0.03} smoothness={2} position={[0, 0.32, 0]}>
          <meshStandardMaterial color="#475569" flatShading metalness={0.8} />
        </RoundedBox>
      </group>
      {/* Glowing forge ember at feet */}
      <pointLight position={[0.6, 0.4, 0]} color="#fb923c" intensity={1.2} distance={2.5} />
    </group>
  );
}

function MerchantProps() {
  return (
    <group>
      {/* Coin pouch on belt */}
      <mesh position={[0.3, 0.6, 0.15]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#78350f" flatShading />
      </mesh>
      <mesh position={[0.3, 0.72, 0.18]}>
        <cylinderGeometry args={[0.04, 0.04, 0.06, 6]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.3} flatShading />
      </mesh>
      {/* Scale in left hand */}
      <group position={[-0.38, 0.95, 0.05]}>
        <mesh>
          <cylinderGeometry args={[0.02, 0.02, 0.35, 6]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.5} flatShading />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.32, 0.02, 0.02]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.5} flatShading />
        </mesh>
        <mesh position={[-0.14, 0.1, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.04, 8]} />
          <meshStandardMaterial color="#a16207" flatShading />
        </mesh>
        <mesh position={[0.14, 0.1, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.04, 8]} />
          <meshStandardMaterial color="#a16207" flatShading />
        </mesh>
      </group>
    </group>
  );
}

function ScholarProps() {
  return (
    <group>
      {/* Scroll in right hand */}
      <group position={[0.42, 0.92, 0.08]} rotation={[0, 0, -0.4]}>
        <mesh>
          <cylinderGeometry args={[0.06, 0.06, 0.32, 12]} />
          <meshStandardMaterial color="#fef3c7" flatShading />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[0.062, 0.012, 6, 12]} />
          <meshStandardMaterial color="#92400e" flatShading />
        </mesh>
      </group>
      {/* Open book in left hand */}
      <group position={[-0.36, 0.88, 0.16]} rotation={[Math.PI * 0.25, 0, 0]}>
        <RoundedBox args={[0.3, 0.04, 0.22]} radius={0.015} smoothness={2}>
          <meshStandardMaterial color="#7c2d12" flatShading />
        </RoundedBox>
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[0.28, 0.01, 0.2]} />
          <meshStandardMaterial color="#fef3c7" flatShading />
        </mesh>
      </group>
    </group>
  );
}

function TutorProps() {
  const wand = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (wand.current) wand.current.rotation.z = Math.sin(clock.getElapsedTime() * 2) * 0.15;
  });
  return (
    <group>
      {/* Magic wand with glowing tip */}
      <group ref={wand} position={[0.4, 1.0, 0.05]}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 0.45, 6]} />
          <meshStandardMaterial color="#451a03" flatShading />
        </mesh>
        <mesh position={[0, 0.26, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={1.2} flatShading />
        </mesh>
        <pointLight position={[0, 0.26, 0]} color="#06b6d4" intensity={0.6} distance={1.6} />
      </group>
    </group>
  );
}

function WaypointProps() {
  const orb = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (orb.current) orb.current.rotation.y = clock.getElapsedTime() * 1.5;
  });
  return (
    <group>
      {/* Portal staff */}
      <group position={[0.42, 0.85, 0.05]}>
        <mesh>
          <cylinderGeometry args={[0.04, 0.04, 1.4, 8]} />
          <meshStandardMaterial color="#312e81" flatShading />
        </mesh>
        <group ref={orb} position={[0, 0.78, 0]}>
          <mesh>
            <icosahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color="#8b5cf6" emissive="#6366f1" emissiveIntensity={1.0} flatShading transparent opacity={0.85} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.015, 6, 24]} />
            <meshStandardMaterial color="#a78bfa" emissive="#8b5cf6" emissiveIntensity={0.8} />
          </mesh>
        </group>
        <pointLight position={[0, 0.78, 0]} color="#8b5cf6" intensity={0.9} distance={2.5} />
      </group>
    </group>
  );
}

function GuardProps() {
  return (
    <group>
      {/* Round shield in left hand */}
      <group position={[-0.42, 0.85, 0.05]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.28, 0.06, 16]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.5} flatShading />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <torusGeometry args={[0.22, 0.018, 8, 24]} />
          <meshStandardMaterial color="#475569" metalness={0.6} flatShading />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} flatShading />
        </mesh>
      </group>
      {/* Spear in right hand */}
      <group position={[0.42, 1.0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 1.8, 6]} />
          <meshStandardMaterial color="#451a03" flatShading />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <coneGeometry args={[0.06, 0.22, 6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} flatShading />
        </mesh>
      </group>
    </group>
  );
}
