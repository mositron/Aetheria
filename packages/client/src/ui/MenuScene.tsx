import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Shared 3D backdrop for menu screens — blocky mountains + sky + floating particles. */
export function MenuScene({ variant = "twilight" }: { variant?: "twilight" | "dawn" | "dungeon" }) {
  const palette = PALETTES[variant];

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, 12, 50]} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 6]} intensity={0.8} color={palette.sun} />
      <pointLight position={[-6, 3, -5]} intensity={1.5} color={palette.glowA} distance={20} />
      <pointLight position={[6, 3, -5]} intensity={1.2} color={palette.glowB} distance={20} />

      <DistantTerrain palette={palette} />
      <FloatingEmbers count={70} color={palette.ember} />
      {variant === "twilight" && <Moon />}
    </>
  );
}

const PALETTES = {
  twilight: {
    sky: "#0c1024",
    fog: "#1a1638",
    sun: "#a8b8ff",
    glowA: "#22d3ee",
    glowB: "#a855f7",
    ground: "#1c1740",
    mountainA: "#2e2755",
    mountainB: "#1f1a3c",
    treeTrunk: "#1a0e22",
    leaves: "#3a2e6b",
    ember: "#a78bfa",
  },
  dawn: {
    sky: "#1e2a4a",
    fog: "#7d6ab0",
    sun: "#ffd9a0",
    glowA: "#fb923c",
    glowB: "#f472b6",
    ground: "#3a2f56",
    mountainA: "#5a4a78",
    mountainB: "#3d3358",
    treeTrunk: "#3a2618",
    leaves: "#4a8a3f",
    ember: "#fde68a",
  },
  dungeon: {
    sky: "#08010f",
    fog: "#1a0822",
    sun: "#7c3aed",
    glowA: "#a855f7",
    glowB: "#22d3ee",
    ground: "#1a0822",
    mountainA: "#2c0f3a",
    mountainB: "#170824",
    treeTrunk: "#1a0a14",
    leaves: "#3a1f4a",
    ember: "#c084fc",
  },
};

type Palette = (typeof PALETTES)[keyof typeof PALETTES];

function DistantTerrain({ palette }: { palette: Palette }) {
  // Render once via useMemo + instanced meshes for cheap perf
  const data = useMemo(() => {
    const rand = mulberry32(7);
    // ring of mountains in the distance
    const mountains: { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string }[] = [];
    const peaks = 24;
    for (let i = 0; i < peaks; i++) {
      const a = (i / peaks) * Math.PI * 2 + rand() * 0.1;
      const r = 22 + rand() * 6;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const layers = 3 + Math.floor(rand() * 3);
      const peakH = 4 + rand() * 6;
      for (let L = 0; L < layers; L++) {
        const t = L / layers;
        const w = (1 - t) * (3 + rand() * 3) + 1.8;
        const h = peakH / layers;
        const y = -2 + L * h + h / 2;
        mountains.push({
          x: cx + (rand() - 0.5) * 0.4, y, z: cz + (rand() - 0.5) * 0.4,
          sx: w, sy: h, sz: w,
          color: L % 2 === 0 ? palette.mountainA : palette.mountainB,
        });
      }
    }

    // a few foreground trees as silhouettes (further so they don't crowd)
    const trees: { x: number; z: number; s: number; trunkH: number; leafSize: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      const r = 12 + rand() * 4;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      // skip foreground arc (camera-facing)
      if (cz > 6) continue;
      trees.push({
        x: cx, z: cz, s: 0.9 + rand() * 0.5,
        trunkH: 0.9 + rand() * 0.4,
        leafSize: 0.8 + rand() * 0.3,
      });
    }
    return { mountains, trees };
  }, [palette]);

  return (
    <group>
      {/* ground disk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
        <circleGeometry args={[40, 32]} />
        <meshStandardMaterial color={palette.ground} />
      </mesh>

      {/* mountains via instanced (one material per color) */}
      <BlockInstances list={data.mountains.filter((m) => m.color === palette.mountainA)} color={palette.mountainA} />
      <BlockInstances list={data.mountains.filter((m) => m.color === palette.mountainB)} color={palette.mountainB} />

      {/* trees */}
      {data.trees.map((t, i) => (
        <group key={i} position={[t.x, -2, t.z]} scale={t.s}>
          <mesh position={[0, t.trunkH / 2, 0]}>
            <boxGeometry args={[0.32, t.trunkH, 0.32]} />
            <meshStandardMaterial color={palette.treeTrunk} flatShading />
          </mesh>
          <mesh position={[0, t.trunkH + t.leafSize * 0.4, 0]}>
            <boxGeometry args={[t.leafSize * 1.5, t.leafSize * 0.9, t.leafSize * 1.5]} />
            <meshStandardMaterial color={palette.leaves} flatShading />
          </mesh>
          <mesh position={[0, t.trunkH + t.leafSize * 1.1, 0]}>
            <boxGeometry args={[t.leafSize * 1.0, t.leafSize * 0.7, t.leafSize * 1.0]} />
            <meshStandardMaterial color={palette.leaves} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BlockInstances({ list, color }: { list: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[]; color: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!mesh.current || list.length === 0) return;
    const obj = new THREE.Object3D();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      obj.position.set(b.x, b.y, b.z);
      obj.scale.set(b.sx, b.sy, b.sz);
      obj.rotation.set(0, 0, 0);
      obj.updateMatrix();
      mesh.current.setMatrixAt(i, obj.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [list]);

  if (list.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined as any, undefined as any, list.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} flatShading />
    </instancedMesh>
  );
}

function FloatingEmbers({ count, color }: { count: number; color: string }) {
  const group = useRef<THREE.Points>(null);
  const { positions, velocities } = useMemo(() => {
    const rand = mulberry32(31);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (rand() - 0.5) * 30;
      positions[i * 3 + 1] = rand() * 8 - 1;
      positions[i * 3 + 2] = (rand() - 0.5) * 30;
      velocities[i * 3 + 0] = (rand() - 0.5) * 0.1;
      velocities[i * 3 + 1] = 0.15 + rand() * 0.3;
      velocities[i * 3 + 2] = (rand() - 0.5) * 0.1;
    }
    return { positions, velocities };
  }, [count]);

  useFrame((_, dt) => {
    if (!group.current) return;
    const attr = (group.current.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 0] += velocities[i * 3 + 0] * dt;
      arr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      arr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (arr[i * 3 + 1] > 9) {
        arr[i * 3 + 1] = -1;
        arr[i * 3 + 0] = (Math.random() - 0.5) * 30;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 30;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={group}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.18} transparent opacity={0.9} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Moon() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 8 + Math.sin(clock.getElapsedTime() * 0.3) * 0.2;
  });
  return (
    <group ref={ref} position={[-10, 8, -15]}>
      <mesh>
        <sphereGeometry args={[1.4, 16, 12]} />
        <meshBasicMaterial color="#fef3c7" />
      </mesh>
      <pointLight color="#fef3c7" intensity={2} distance={20} />
    </group>
  );
}
