// Per-job player accessories — staff for mage, bow on back for archer,
// shield for swordsman, halo for acolyte, twin daggers for thief, +
// 2nd-class variants.

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

type Job =
  | "novice" | "swordsman" | "mage" | "archer" | "acolyte" | "thief"
  | "knight" | "wizard" | "sniper" | "priest" | "assassin"
  | "lord_knight" | "high_wizard" | "sniper_t2" | "high_priest" | "assassin_t2";

export function PlayerJobProps({ job, hasWeapon }: { job: string; hasWeapon: boolean }) {
  const j = job as Job;
  switch (j) {
    case "swordsman":  return hasWeapon ? <SwordsmanProps /> : null;
    case "knight":
    case "lord_knight": return <KnightProps tier={j === "lord_knight" ? 2 : 1} />;
    case "mage":       return <MageProps />;
    case "wizard":
    case "high_wizard": return <WizardProps tier={j === "high_wizard" ? 2 : 1} />;
    case "archer":     return <ArcherProps />;
    case "sniper":
    case "sniper_t2":  return <SniperProps tier={j === "sniper_t2" ? 2 : 1} />;
    case "acolyte":    return <AcolyteProps />;
    case "priest":
    case "high_priest": return <PriestProps tier={j === "high_priest" ? 2 : 1} />;
    case "thief":      return <ThiefProps />;
    case "assassin":
    case "assassin_t2": return <AssassinProps tier={j === "assassin_t2" ? 2 : 1} />;
    default:           return null;
  }
}

// ── Swordsman / Knight ────────────────────────────────────────────────────
function SwordsmanProps() {
  return (
    // Round buckler shield strapped to left arm
    <group position={[-0.42, 0.95, 0.05]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} flatShading />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <torusGeometry args={[0.17, 0.014, 8, 24]} />
        <meshStandardMaterial color="#475569" metalness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function KnightProps({ tier }: { tier: 1 | 2 }) {
  return (
    <group>
      {/* Larger heater shield */}
      <group position={[-0.45, 0.95, 0.05]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.3, 0.42, 0.05]} />
          <meshStandardMaterial color={tier === 2 ? "#fbbf24" : "#94a3b8"} metalness={0.7} flatShading />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <coneGeometry args={[0.06, 0.16, 4]} />
          <meshStandardMaterial color="#dc2626" flatShading />
        </mesh>
      </group>
      {/* Cape */}
      {tier === 2 && (
        <mesh position={[0, 1.25, -0.22]}>
          <boxGeometry args={[0.75, 0.95, 0.03]} />
          <meshStandardMaterial color="#7f1d1d" flatShading side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ── Mage / Wizard ─────────────────────────────────────────────────────────
function MageProps() {
  const orb = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (orb.current) {
      const t = clock.getElapsedTime();
      (orb.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + Math.sin(t * 3) * 0.4;
    }
  });
  return (
    // Wooden staff with glowing blue orb at top
    <group position={[0.42, 1.0, 0.05]} rotation={[0, 0, -0.15]}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 1.5, 8]} />
        <meshStandardMaterial color="#451a03" flatShading />
      </mesh>
      <mesh ref={orb} position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={1.2} flatShading transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, 0.82, 0]} color="#3b82f6" intensity={0.8} distance={2.5} />
    </group>
  );
}

function WizardProps({ tier }: { tier: 1 | 2 }) {
  const orbA = useRef<THREE.Mesh>(null);
  const orbB = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (orbA.current) {
      orbA.current.position.x = Math.cos(t * 1.5) * 0.55;
      orbA.current.position.z = Math.sin(t * 1.5) * 0.55;
    }
    if (orbB.current) {
      orbB.current.position.x = Math.cos(t * 1.5 + Math.PI) * 0.55;
      orbB.current.position.z = Math.sin(t * 1.5 + Math.PI) * 0.55;
    }
  });
  const color = tier === 2 ? "#a855f7" : "#60a5fa";
  return (
    <group>
      <MageProps />
      {/* Floating tomes/orbs orbiting head */}
      <mesh ref={orbA} position={[0.55, 1.85, 0]}>
        <icosahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} flatShading />
      </mesh>
      <mesh ref={orbB} position={[-0.55, 1.85, 0]}>
        <icosahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} flatShading />
      </mesh>
    </group>
  );
}

// ── Archer / Sniper ───────────────────────────────────────────────────────
function ArcherProps() {
  return (
    <group>
      {/* Short bow on left hand */}
      <group position={[-0.42, 0.95, 0.05]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.45, 0.025, 4, 24, Math.PI]} />
          <meshStandardMaterial color="#78350f" flatShading />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 0.9, 4]} />
          <meshStandardMaterial color="#f1f5f9" />
        </mesh>
      </group>
      {/* Quiver on back */}
      <mesh position={[0, 1.2, -0.25]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 10]} />
        <meshStandardMaterial color="#451a03" flatShading />
      </mesh>
      {/* Arrows sticking out */}
      {[-0.04, 0, 0.04].map((dx, i) => (
        <mesh key={i} position={[dx, 1.42, -0.25]} rotation={[0, 0, 0.3]}>
          <cylinderGeometry args={[0.005, 0.005, 0.2, 4]} />
          <meshStandardMaterial color="#fef3c7" />
        </mesh>
      ))}
    </group>
  );
}

function SniperProps({ tier }: { tier: 1 | 2 }) {
  return (
    <group>
      <ArcherProps />
      {/* Larger longbow that replaces */}
      {tier === 2 && (
        <group position={[-0.5, 1.0, 0.08]}>
          <mesh>
            <torusGeometry args={[0.7, 0.03, 4, 24, Math.PI]} />
            <meshStandardMaterial color="#1f1408" emissive="#16a34a" emissiveIntensity={0.3} flatShading />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ── Acolyte / Priest ──────────────────────────────────────────────────────
function AcolyteProps() {
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (halo.current) halo.current.rotation.y = clock.getElapsedTime() * 0.7;
  });
  return (
    <group>
      {/* Halo above head */}
      <mesh ref={halo} position={[0, 2.15, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.18, 0.022, 6, 20]} />
        <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.5} flatShading transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, 2.15, 0]} color="#fde047" intensity={0.5} distance={2} />
      {/* Holy mace in right hand */}
      <group position={[0.4, 0.9, 0.05]} rotation={[0, 0, -0.3]}>
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, 0.5, 8]} />
          <meshStandardMaterial color="#fef3c7" flatShading />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={0.5} flatShading metalness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function PriestProps({ tier }: { tier: 1 | 2 }) {
  return (
    <group>
      <AcolyteProps />
      {/* Bigger halo + wing glints for high priest */}
      {tier === 2 && (
        <>
          <mesh position={[-0.55, 1.6, -0.05]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.35, 0.18, 0.02]} />
            <meshStandardMaterial color="#fffbeb" emissive="#fef3c7" emissiveIntensity={0.5} transparent opacity={0.7} />
          </mesh>
          <mesh position={[0.55, 1.6, -0.05]} rotation={[0, 0, -0.6]}>
            <boxGeometry args={[0.35, 0.18, 0.02]} />
            <meshStandardMaterial color="#fffbeb" emissive="#fef3c7" emissiveIntensity={0.5} transparent opacity={0.7} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ── Thief / Assassin ──────────────────────────────────────────────────────
function ThiefProps() {
  return (
    <group>
      {/* Twin daggers — one each hand */}
      <group position={[-0.42, 0.9, 0.05]}>
        <mesh>
          <coneGeometry args={[0.04, 0.3, 4]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} flatShading />
        </mesh>
        <mesh position={[0, -0.17, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.1, 6]} />
          <meshStandardMaterial color="#1f2937" flatShading />
        </mesh>
      </group>
      <group position={[0.42, 0.9, 0.05]}>
        <mesh>
          <coneGeometry args={[0.04, 0.3, 4]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} flatShading />
        </mesh>
        <mesh position={[0, -0.17, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.1, 6]} />
          <meshStandardMaterial color="#1f2937" flatShading />
        </mesh>
      </group>
    </group>
  );
}

function AssassinProps({ tier }: { tier: 1 | 2 }) {
  return (
    <group>
      <ThiefProps />
      {/* Dark hood overlay + glowing eye */}
      {tier === 2 && (
        <>
          <mesh position={[0, 2.0, -0.05]}>
            <coneGeometry args={[0.32, 0.28, 8]} />
            <meshStandardMaterial color="#0a0a0a" flatShading />
          </mesh>
          <pointLight position={[0, 1.95, 0.2]} color="#ef4444" intensity={0.6} distance={1.2} />
        </>
      )}
    </group>
  );
}
