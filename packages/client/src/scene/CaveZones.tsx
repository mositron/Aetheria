// Walkable cave zones — themed visuals (mouth + walls + stalactites +
// crystal lights) anchored at CAVES coords from shared/biomes.ts.
// No portal, no map switch — just walk in.

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAVES, caveAt, type CaveDef } from "@game/shared";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useStore } from "../store";

type Theme = CaveDef["theme"];

const THEME_TINT: Record<Theme, {
  floor: string;      // recessed disc color
  rock: string;       // boulder color
  rockAccent: string; // archway color
  crystalA: string;   // primary glow
  crystalB: string;   // secondary glow
  background: string; // scene bg when inside
  ambient: string;    // ambient light color
}> = {
  shadow:     { floor: "#1f1410", rock: "#3a2a22", rockAccent: "#4a3528", crystalA: "#fbbf24", crystalB: "#60a5fa", background: "#1a0f0a", ambient: "#7c4a20" },
  frost:      { floor: "#1e2a3a", rock: "#4a5870", rockAccent: "#5b6b85", crystalA: "#60a5fa", crystalB: "#a5f3fc", background: "#0e1a28", ambient: "#3b6fb5" },
  desert:     { floor: "#3a2a18", rock: "#7c5a35", rockAccent: "#8e6940", crystalA: "#fbbf24", crystalB: "#fde047", background: "#2a1d10", ambient: "#a87a3e" },
  swamp:      { floor: "#1a2a18", rock: "#3a4a25", rockAccent: "#4a5b30", crystalA: "#a3e635", crystalB: "#34d399", background: "#0e1f12", ambient: "#5a7a3a" },
  forest:     { floor: "#1f2a18", rock: "#3a4a28", rockAccent: "#4a5b35", crystalA: "#a3e635", crystalB: "#60a5fa", background: "#10180e", ambient: "#5a7a3a" },
  wilderness: { floor: "#180a1a", rock: "#3a1a3a", rockAccent: "#4a2050", crystalA: "#ef4444", crystalB: "#a855f7", background: "#0a040f", ambient: "#7c3a90" },
};

export function CaveZones({ room }: { room: Room<WorldState> }) {
  const sessionId = useStore((s) => s.sessionId);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const insideRef = useRef<string | null>(null);
  const { scene } = useThree();
  const savedBg = useRef<THREE.Color | null>(null);

  useFrame(() => {
    const me = sessionId ? room.state.players.get(sessionId) : null;
    if (!me) return;
    const cid = caveAt(me.pos.x, me.pos.z);
    const cave = cid ? CAVES.find((c) => c.id === cid) : null;
    const tint = cave ? THEME_TINT[cave.theme] : null;

    if (ambRef.current) {
      ambRef.current.intensity = tint ? 0.5 : 0;
      if (tint) ambRef.current.color.set(tint.ambient);
    }

    if (cid !== insideRef.current) {
      const wasOutside = insideRef.current === null;
      const nowInside = cid !== null;
      if (nowInside && wasOutside) {
        // entering: stash bg, set cave tint
        savedBg.current = scene.background instanceof THREE.Color ? scene.background.clone() : null;
        scene.background = new THREE.Color(tint!.background);
        if (scene.fog) (scene.fog as THREE.Fog).color.copy(new THREE.Color(tint!.background));
      } else if (!nowInside && !wasOutside) {
        // leaving: restore bg
        if (savedBg.current) {
          scene.background = savedBg.current;
          if (scene.fog) (scene.fog as THREE.Fog).color.copy(savedBg.current);
        }
        savedBg.current = null;
      } else if (nowInside && !wasOutside) {
        // moved between caves
        scene.background = new THREE.Color(tint!.background);
      }
      insideRef.current = cid;
    }
  });

  return (
    <>
      <ambientLight ref={ambRef} intensity={0} color="#7c4a20" />
      {CAVES.map((c) => (
        <CaveZone key={c.id} cave={c} />
      ))}
    </>
  );
}

function CaveZone({ cave }: { cave: CaveDef }) {
  const { x: cx, z: cz, r, theme } = cave;
  const tint = THEME_TINT[theme];

  // Orient cave mouth toward the village (origin). If the cave is north of
  // origin, the mouth opens south, etc.
  const mouthAngle = Math.atan2(-cz, -cx); // direction from cave to origin, in XZ plane

  // Deterministic rock placement.
  const decor = useMemo(() => {
    const seed = Math.floor(cx * 13 + cz * 7 + (theme.charCodeAt(0) * 31));
    let s = seed;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    const wallRocks: Array<{ x: number; z: number; s: number; rot: number }> = [];
    // Dense ring of wall rocks around perimeter (skip a gap at mouth direction)
    const wallCount = 28;
    for (let i = 0; i < wallCount; i++) {
      const a = (i / wallCount) * Math.PI * 2;
      // Skip the arc near mouthAngle (60° opening)
      const angleDelta = Math.atan2(Math.sin(a - mouthAngle), Math.cos(a - mouthAngle));
      if (Math.abs(angleDelta) < Math.PI / 6) continue;
      wallRocks.push({
        x: Math.cos(a) * (r * 0.95 + rand() * 1.5),
        z: Math.sin(a) * (r * 0.95 + rand() * 1.5),
        s: 1.2 + rand() * 0.9,
        rot: rand() * Math.PI,
      });
    }
    // Interior floor rocks (smaller)
    const floorRocks: Array<{ x: number; z: number; s: number; rot: number }> = [];
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const dist = rand() * r * 0.6 + r * 0.2;
      floorRocks.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        s: 0.4 + rand() * 0.5,
        rot: rand() * Math.PI,
      });
    }
    // Stalactites hanging from above
    const stalactites: Array<{ x: number; z: number; h: number; s: number }> = [];
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const dist = rand() * r * 0.85;
      stalactites.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        h: 3.5 + rand() * 1.5,
        s: 0.25 + rand() * 0.3,
      });
    }
    return { wallRocks, floorRocks, stalactites };
  }, [cx, cz, r, theme, mouthAngle]);

  return (
    <group position={[cx, 0, cz]}>
      {/* Floor disc — dark, recessed */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[r, 48]} />
        <meshStandardMaterial color={tint.floor} roughness={1} />
      </mesh>
      {/* Slightly elevated boundary lip so player notices the edge */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.5, r + 0.2, 64]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>

      {/* Cave-mouth archway — auto-oriented toward village */}
      <group rotation={[0, mouthAngle + Math.PI, 0]}>
        <CaveMouth r={r} rockColor={tint.rockAccent} archColor={tint.rock} />
      </group>

      {/* Wall ring of large rocks (with mouth gap) */}
      {decor.wallRocks.map((rk, i) => (
        <mesh
          key={`w${i}`}
          position={[rk.x, rk.s * 0.7, rk.z]}
          rotation={[0, rk.rot, 0]}
          scale={rk.s}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={tint.rock} flatShading roughness={0.95} />
        </mesh>
      ))}
      {/* Smaller interior floor rocks */}
      {decor.floorRocks.map((rk, i) => (
        <mesh
          key={`f${i}`}
          position={[rk.x, rk.s * 0.5, rk.z]}
          rotation={[0, rk.rot, 0]}
          scale={rk.s}
          castShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={tint.rock} flatShading roughness={0.95} />
        </mesh>
      ))}
      {/* Stalactites hanging down */}
      {decor.stalactites.map((st, i) => (
        <mesh
          key={`s${i}`}
          position={[st.x, st.h, st.z]}
          rotation={[Math.PI, 0, 0]}
          scale={st.s}
        >
          <coneGeometry args={[1, 2.5, 6]} />
          <meshStandardMaterial color={tint.rockAccent} flatShading roughness={0.9} />
        </mesh>
      ))}

      {/* Two glowing crystals — themed lights */}
      <group position={[r * 0.4, 0, r * 0.4]}>
        <mesh position={[0, 0.7, 0]}>
          <octahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color={tint.crystalA} emissive={tint.crystalA} emissiveIntensity={1.5} flatShading />
        </mesh>
        <pointLight position={[0, 0.7, 0]} color={tint.crystalA} intensity={2.0} distance={r * 0.9} />
      </group>
      <group position={[-r * 0.4, 0, -r * 0.4]}>
        <mesh position={[0, 0.7, 0]}>
          <octahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color={tint.crystalB} emissive={tint.crystalB} emissiveIntensity={1.5} flatShading />
        </mesh>
        <pointLight position={[0, 0.7, 0]} color={tint.crystalB} intensity={2.0} distance={r * 0.9} />
      </group>
      {/* Center torch crystal for boss-tier caves */}
      {(theme === "wilderness") && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 1.2, 0]}>
            <octahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={2} flatShading />
          </mesh>
          <pointLight position={[0, 1.2, 0]} color="#ef4444" intensity={3.5} distance={r * 1.5} />
        </group>
      )}

      {/* Floating cave name label above the entrance */}
      <CaveLabel name={cave.name} mouthAngle={mouthAngle} r={r} />
    </group>
  );
}

/** Boulders + keystone arch. Mouth opening always faces +Z (rotated by parent). */
function CaveMouth({ r, rockColor, archColor }: { r: number; rockColor: string; archColor: string }) {
  const halfGap = 1.8;
  return (
    <group>
      <mesh position={[-halfGap - 1.4, 1.3, r * 0.92]} castShadow>
        <dodecahedronGeometry args={[2.0, 0]} />
        <meshStandardMaterial color={rockColor} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[halfGap + 1.4, 1.3, r * 0.92]} castShadow>
        <dodecahedronGeometry args={[2.0, 0]} />
        <meshStandardMaterial color={rockColor} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.8, r * 0.92]} castShadow>
        <dodecahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color={archColor} flatShading roughness={0.9} />
      </mesh>
      {/* Golden "enter here" floor ring */}
      <mesh position={[0, 0.05, r * 0.85]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.9, 16]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* Twin entrance torches — warm flicker draws players at dusk/night */}
      <EntranceTorch position={[-halfGap - 1.4, 2.9, r * 0.92]} />
      <EntranceTorch position={[halfGap + 1.4, 2.9, r * 0.92]} />
    </group>
  );
}

function EntranceTorch({ position }: { position: [number, number, number] }) {
  const flameRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const t = state.clock.getElapsedTime() * 5;
    // Cheap deterministic flicker — sin + sin combination feels organic
    const flicker = 0.85 + Math.sin(t) * 0.08 + Math.sin(t * 1.7) * 0.07;
    if (lightRef.current) lightRef.current.intensity = 1.8 * flicker;
    if (flameRef.current) {
      flameRef.current.scale.set(flicker, flicker * 1.1, flicker);
    }
  });
  return (
    <group position={position}>
      {/* tiny torch holder */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.08, 0.06, 0.4, 6]} />
        <meshStandardMaterial color="#4a2a18" />
      </mesh>
      {/* flame */}
      <mesh ref={flameRef} position={[0, 0.15, 0]}>
        <coneGeometry args={[0.18, 0.5, 8]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.95} />
      </mesh>
      <pointLight ref={lightRef} color="#fb923c" intensity={1.8} distance={6} decay={2} />
    </group>
  );
}

/** Always-up text label outside the cave mouth so players can identify it
 *  from afar. Uses a billboard sprite via canvas texture. */
function CaveLabel({ name, mouthAngle, r }: { name: string; mouthAngle: number; r: number }) {
  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, 512, 96);
    ctx.font = "bold 38px sans-serif";
    ctx.fillStyle = "#fde047";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 256, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, [name]);
  // Three.js textures aren't garbage-collected when their JS ref drops — they
  // need explicit dispose() to release GPU memory. Without this, every
  // unmount or `name` change leaks one CanvasTexture.
  useEffect(() => () => { sprite.dispose(); }, [sprite]);

  const spriteRef = useRef<THREE.Sprite>(null);
  const matRef = useRef<THREE.SpriteMaterial>(null);
  const baseX = 6;
  const baseY = 1.1;
  useFrame((state) => {
    if (!spriteRef.current) return;
    const t = state.clock.getElapsedTime() * 2;
    const s = 1 + Math.sin(t) * 0.08;
    spriteRef.current.scale.set(baseX * s, baseY * s, 1);
    if (matRef.current) matRef.current.opacity = 0.85 + Math.sin(t) * 0.15;
  });

  // Place label outside the mouth (opposite side of arch, facing village)
  const lx = Math.cos(mouthAngle) * (r + 4);
  const lz = Math.sin(mouthAngle) * (r + 4);
  return (
    <sprite ref={spriteRef} position={[lx, 4.5, lz]} scale={[baseX, baseY, 1]}>
      <spriteMaterial ref={matRef} map={sprite} depthTest={false} transparent />
    </sprite>
  );
}
