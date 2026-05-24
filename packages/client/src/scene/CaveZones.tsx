// Walkable cave zones — visual cave mouths + dim ambience + rocky walls,
// all anchored at CAVES coords from shared/biomes.ts. No portal, no map
// switch — players just walk into the mouth and the world keeps going.

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAVES, caveAt } from "@game/shared";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useStore } from "../store";

const ROCK_COLOR     = "#3a2a22";
const ROCK_ACCENT    = "#4a3528";
const INTERIOR_COLOR = "#1a0f0a";
const PILLAR_GLOW    = "#fbbf24";

export function CaveZones({ room }: { room: Room<WorldState> }) {
  const sessionId = useStore((s) => s.sessionId);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const fogRef = useRef<{ active: boolean }>({ active: false });
  const { scene } = useThree();

  // Sample player position once per second to decide "is the player in a cave?".
  // Cheap — no per-frame state churn.
  useFrame(() => {
    const me = sessionId ? room.state.players.get(sessionId) : null;
    if (!me) return;
    const inCave = !!caveAt(me.pos.x, me.pos.z);
    // Dim ambient when inside cave to sell the "underground" feel.
    if (ambRef.current) {
      ambRef.current.intensity = inCave ? 0.4 : 0;
    }
    // Tint scene background to cave color while inside (and restore on exit).
    if (inCave !== fogRef.current.active) {
      fogRef.current.active = inCave;
      if (inCave) {
        scene.background = new THREE.Color(INTERIOR_COLOR);
        if (scene.fog) (scene.fog as THREE.Fog).color.copy(new THREE.Color(INTERIOR_COLOR));
      }
      // Exit case: DayNight.tsx restores sky/fog automatically when day toggle fires
    }
  });

  return (
    <>
      <ambientLight ref={ambRef} intensity={0} color="#7c4a20" />
      {CAVES.map((c) => (
        <CaveZone key={c.id} cx={c.x} cz={c.z} r={c.r} />
      ))}
    </>
  );
}

function CaveZone({ cx, cz, r }: { cx: number; cz: number; r: number }) {
  // Pre-compute rock decoration positions once.
  const rocks = useMemo(() => {
    const out: Array<{ x: number; z: number; s: number; rot: number }> = [];
    const seed = Math.floor(cx * 13 + cz * 7);
    let s = seed;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    // Ring of rocks around the cave mouth + scattered inside
    const ringCount = 14;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2 + rand() * 0.3;
      const dist = r * (0.92 + rand() * 0.12);
      out.push({
        x: cx + Math.cos(a) * dist,
        z: cz + Math.sin(a) * dist,
        s: 0.8 + rand() * 0.7,
        rot: rand() * Math.PI,
      });
    }
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const dist = rand() * r * 0.7;
      out.push({
        x: cx + Math.cos(a) * dist,
        z: cz + Math.sin(a) * dist,
        s: 0.6 + rand() * 0.5,
        rot: rand() * Math.PI,
      });
    }
    return out;
  }, [cx, cz, r]);

  return (
    <group position={[cx, 0, cz]}>
      {/* Floor disc — dark, recessed look */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[r, 48]} />
        <meshStandardMaterial color={INTERIOR_COLOR} roughness={1} />
      </mesh>

      {/* Boundary ring (visual hint where the cave ends) */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.5, r + 0.2, 64]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>

      {/* Cave-mouth archway — 2 angled pillars + a top arch facing the village */}
      <CaveMouth r={r} />

      {/* Scattered rocks giving the cave its rocky look */}
      {rocks.map((rk, i) => (
        <mesh
          key={i}
          position={[rk.x - cx, rk.s * 0.6, rk.z - cz]}
          rotation={[0, rk.rot, 0]}
          scale={rk.s}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={ROCK_COLOR} flatShading roughness={0.95} />
        </mesh>
      ))}

      {/* Two glowing crystals/torches for "cave" vibe + interior light */}
      <group position={[r * 0.3, 0, r * 0.3]}>
        <mesh position={[0, 0.6, 0]}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color={PILLAR_GLOW} emissive={PILLAR_GLOW} emissiveIntensity={1.2} flatShading />
        </mesh>
        <pointLight position={[0, 0.6, 0]} color={PILLAR_GLOW} intensity={1.5} distance={r * 0.8} />
      </group>
      <group position={[-r * 0.3, 0, -r * 0.3]}>
        <mesh position={[0, 0.6, 0]}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={1.2} flatShading />
        </mesh>
        <pointLight position={[0, 0.6, 0]} color="#3b82f6" intensity={1.5} distance={r * 0.8} />
      </group>
    </group>
  );
}

/** Two boulders + a triangular top forming a walkable archway. The opening
 *  faces the centre (origin) so players approaching from the village walk
 *  through it naturally. */
function CaveMouth({ r }: { r: number }) {
  // Direction from cave center back to (0,0). Mouth points along -d (out toward village).
  // For simplicity: mouth always faces positive Z (south) — rocky boulders flank.
  const halfGap = 1.6;
  return (
    <group rotation={[0, 0, 0]}>
      {/* Left boulder */}
      <mesh position={[-halfGap - 1.2, 1.2, r * 0.92]} castShadow>
        <dodecahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color={ROCK_ACCENT} flatShading roughness={0.9} />
      </mesh>
      {/* Right boulder */}
      <mesh position={[halfGap + 1.2, 1.2, r * 0.92]} castShadow>
        <dodecahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color={ROCK_ACCENT} flatShading roughness={0.9} />
      </mesh>
      {/* Arch keystone on top */}
      <mesh position={[0, 2.6, r * 0.92]} castShadow>
        <dodecahedronGeometry args={[1.3, 0]} />
        <meshStandardMaterial color={ROCK_COLOR} flatShading roughness={0.9} />
      </mesh>
      {/* Faint "ENTER" hint glow under the arch (subtle ground shimmer) */}
      <mesh position={[0, 0.05, r * 0.85]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.7, 16]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
