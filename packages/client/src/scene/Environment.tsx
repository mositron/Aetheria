import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MAPS, biomeAt, BIOMES, type MapId } from "@game/shared";
// 5-band gradient texture for built-in toon material (Pagonia-look)
const toonGradient = (() => {
  const steps = [60, 130, 195, 230, 255];
  const data = new Uint8Array(steps.length * 4);
  for (let i = 0; i < steps.length; i++) {
    const v = steps[i];
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

// Deterministic PRNG so layout is the same every load
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

type Palette = {
  groundA: string; groundB: string; groundC: string;
  rock: string; rockDark: string;
  trunk: string; leavesA: string; leavesB: string;
  river: string; riverDeep: string;
  flowerA: string; flowerB: string;
};

const PALETTES: Record<MapId, Palette> = {
  field: {
    // Pagonia-style saturated palette
    groundA: "#7ed957", groundB: "#9fea4e", groundC: "#4f9e2e",
    rock: "#c2b8aa", rockDark: "#7c6f5d",
    trunk: "#6b3917", leavesA: "#3fb555", leavesB: "#6bd66e",
    river: "#7dd3fc", riverDeep: "#0c7eb8",
    flowerA: "#ec4899", flowerB: "#fde047",
  },
  dungeon: {
    groundA: "#4a3568", groundB: "#5b4286", groundC: "#3a2854",
    rock: "#6b5476", rockDark: "#42334e",
    trunk: "#4a2638", leavesA: "#a855f7", leavesB: "#c084fc",
    river: "#a855f7", riverDeep: "#6b21a8",
    flowerA: "#f472b6", flowerB: "#22d3ee",
  },
};

type Block = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string };

function buildField(mapId: MapId, size: number, pal: Palette) {
  const rand = mulberry32(mapId === "field" ? 42 : 99);
  const half = size / 2;
  const useBiomes = mapId === "field";

  // ground patches: scattered low boxes coloured by biome (so each region has visual identity)
  const groundPatches: Block[] = [];
  const patchCount = Math.floor((size * size) / (useBiomes ? 90 : 60));
  for (let i = 0; i < patchCount; i++) {
    const x = (rand() - 0.5) * size;
    const z = (rand() - 0.5) * size;
    const w = 1.5 + rand() * 2.5;
    const d = 1.5 + rand() * 2.5;
    const h = 0.08 + rand() * 0.15;
    let color: string;
    if (useBiomes) {
      const biome = BIOMES[biomeAt(x, z, half)];
      const r = rand();
      color = r < 0.5 ? biome.accent : r < 0.85 ? biome.ground : biome.trim;
    } else {
      const r = rand();
      color = r < 0.5 ? pal.groundB : r < 0.85 ? pal.groundA : pal.groundC;
    }
    groundPatches.push({ x, y: h / 2, z, sx: w, sy: h, sz: d, color });
  }

  // mountains around the rim
  const mountains: Block[] = [];
  const ringRadius = half - 4;
  const peaks = mapId === "field" ? 14 : 10;
  for (let i = 0; i < peaks; i++) {
    const a = (i / peaks) * Math.PI * 2 + rand() * 0.3;
    const cx = Math.cos(a) * (ringRadius - rand() * 4);
    const cz = Math.sin(a) * (ringRadius - rand() * 4);
    const peakH = 5 + rand() * 7;
    // stack a few cubes of varying width to look like a chunky mountain
    const layers = 4 + Math.floor(rand() * 3);
    for (let L = 0; L < layers; L++) {
      const t = L / layers;
      const w = (1 - t) * (3 + rand() * 3) + 1.5;
      const h = peakH / layers;
      const y = L * h + h / 2;
      const ox = (rand() - 0.5) * 0.6;
      const oz = (rand() - 0.5) * 0.6;
      const color = L % 2 === 0 ? pal.rock : pal.rockDark;
      mountains.push({ x: cx + ox, y, z: cz + oz, sx: w, sy: h, sz: w, color });
    }
  }

  // river: kept for small/dungeon map only; open-world uses lake biome instead
  const river: Block[] = [];
  if (false && mapId === "field") {
    const riverZ = -size * 0.18;
    const riverWidth = 4;
    // skip a gap near x=0 so players can cross at a bridge
    for (let x = -half + 2; x < half - 2; x += 2) {
      if (Math.abs(x) < 3) continue; // bridge gap
      const wob = Math.sin(x * 0.18) * 1.2;
      river.push({
        x, y: -0.05, z: riverZ + wob,
        sx: 2.05, sy: 0.12, sz: riverWidth,
        color: pal.river,
      });
      // deeper center stripe
      river.push({
        x, y: -0.1, z: riverZ + wob,
        sx: 2.05, sy: 0.04, sz: riverWidth * 0.5,
        color: pal.riverDeep,
      });
    }
    // bridge planks
    for (let i = 0; i < 3; i++) {
      river.push({
        x: -2 + i * 2, y: 0.12, z: riverZ + Math.sin(0 * 0.18) * 1.2,
        sx: 2, sy: 0.12, sz: riverWidth + 0.5,
        color: pal.trunk,
      });
    }
  }

  // decor: trees, rocks, bushes, flowers — biome-aware density/mix
  const decor: { type: "tree" | "rock" | "bush" | "flower"; x: number; z: number; s: number; r: number; seed: number }[] = [];
  const count = useBiomes ? 200 : 30;
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * (size - 6);
    const z = (rand() - 0.5) * (size - 6);
    if (Math.hypot(x, z) < 14) continue; // keep village/spawn clear
    const r = rand();
    let type: "tree" | "rock" | "bush" | "flower";
    if (useBiomes) {
      const b = biomeAt(x, z, half);
      if (b === "village") continue;
      if (b === "lake") continue; // no decor on water
      if (b === "forest")          type = r < 0.65 ? "tree" : r < 0.85 ? "bush" : "flower";
      else if (b === "mountains")  type = r < 0.65 ? "rock" : r < 0.85 ? "bush" : "tree";
      else if (b === "swamp")      type = r < 0.5 ? "bush" : r < 0.8 ? "tree" : "rock";
      else if (b === "wilderness") type = r < 0.5 ? "rock" : r < 0.8 ? "tree" : "bush";
      else                         type = r < 0.35 ? "tree" : r < 0.6 ? "bush" : r < 0.85 ? "flower" : "rock";
    } else if (mapId === "dungeon") {
      type = r < 0.6 ? "rock" : r < 0.85 ? "bush" : "flower";
    } else {
      type = r < 0.45 ? "tree" : r < 0.7 ? "bush" : r < 0.9 ? "flower" : "rock";
    }
    decor.push({ type, x, z, s: 0.8 + rand() * 0.5, r: Math.floor(rand() * 4) * (Math.PI / 2), seed: Math.floor(rand() * 9999) });
  }

  // Village at center (only on open-world field) — simple blocky houses + lake tiles
  const village: Block[] = [];
  const lakeBlocks: Block[] = [];
  if (useBiomes) {
    // 4 huts arranged around (0,0) with a central plaza
    const huts: Array<{ x: number; z: number; rot: number }> = [
      { x: 6, z: 6, rot: 0 },
      { x: -6, z: 6, rot: 0 },
      { x: 6, z: -6, rot: 0 },
      { x: -6, z: -6, rot: 0 },
    ];
    for (const h of huts) {
      // base walls
      village.push({ x: h.x, y: 1, z: h.z, sx: 3, sy: 2, sz: 3, color: "#9a7e5c" });
      // roof
      village.push({ x: h.x, y: 2.4, z: h.z, sx: 3.4, sy: 0.4, sz: 3.4, color: "#7c2d12" });
      village.push({ x: h.x, y: 2.8, z: h.z, sx: 2.6, sy: 0.4, sz: 2.6, color: "#7c2d12" });
      village.push({ x: h.x, y: 3.15, z: h.z, sx: 1.6, sy: 0.3, sz: 1.6, color: "#7c2d12" });
      // door
      village.push({ x: h.x, y: 0.6, z: h.z + 1.51, sx: 0.6, sy: 1.2, sz: 0.05, color: "#3a2618" });
      // window
      village.push({ x: h.x + 1.0, y: 1.2, z: h.z + 1.51, sx: 0.4, sy: 0.4, sz: 0.05, color: "#fde047" });
    }
    // central fountain
    village.push({ x: 0, y: 0.2, z: 0, sx: 2.5, sy: 0.3, sz: 2.5, color: "#71717a" });
    village.push({ x: 0, y: 0.45, z: 0, sx: 2.0, sy: 0.2, sz: 2.0, color: "#3aa0d8" });

    // Lake tiles (raised slightly to be visible)
    const lakeCx = half * 0.4;
    const lakeCz = half * 0.35;
    const lakeR = half * 0.18;
    const step = 2.5;
    for (let x = lakeCx - lakeR; x <= lakeCx + lakeR; x += step) {
      for (let z = lakeCz - lakeR; z <= lakeCz + lakeR; z += step) {
        const d = Math.hypot(x - lakeCx, z - lakeCz);
        if (d > lakeR) continue;
        const deeper = d < lakeR * 0.5;
        lakeBlocks.push({
          x, y: 0.06, z,
          sx: step * 1.02, sy: 0.12, sz: step * 1.02,
          color: deeper ? "#1e6fa3" : "#3aa0d8",
        });
      }
    }
  }

  return { groundPatches, mountains, river, decor, village, lakeBlocks };
}

export function Environment({ mapId }: { mapId: MapId }) {
  const mapDef = MAPS[mapId];
  const pal = PALETTES[mapId];
  const data = useMemo(() => buildField(mapId, mapDef.size, pal), [mapId, mapDef.size, pal]);

  return (
    <group>
      {/* Toon-shaded ground plane (Pagonia-look, no custom shader = safe) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[mapDef.size, mapDef.size, 1, 1]} />
        <meshToonMaterial color={pal.groundC} gradientMap={toonGradient} />
      </mesh>

      {/* ground patches: thousands of tiny boxes batched (no shadows for perf) */}
      <InstancedBlocks blocks={data.groundPatches} />

      {/* mountains (no shadow casting — too many cubes, shadow map would melt) */}
      <InstancedBlocks blocks={data.mountains} />

      {/* river (static — animation removed for perf) */}
      <InstancedBlocks blocks={data.river} />

      {/* lake (open-world only) */}
      <InstancedBlocks blocks={data.lakeBlocks} />

      {/* village buildings */}
      <InstancedBlocks blocks={data.village} />

      {/* decor */}
      {data.decor.map((d, i) => (
        <Decor key={i} type={d.type} x={d.x} z={d.z} s={d.s} r={d.r} seed={d.seed} pal={pal} />
      ))}

      {/* fog */}
      <fog attach="fog" args={[mapId === "dungeon" ? "#1a0f2c" : "#a8d8f0", 30, 90]} />
    </group>
  );
}

/** Renders many same-colored boxes via grouping by color (cheap-ish) */
function InstancedBlocks({ blocks, castShadow, receiveShadow, animate }: { blocks: Block[]; castShadow?: boolean; receiveShadow?: boolean; animate?: "water" }) {
  // group by color so we minimize materials
  const groups = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const b of blocks) {
      const list = m.get(b.color);
      if (list) list.push(b);
      else m.set(b.color, [b]);
    }
    return Array.from(m.entries());
  }, [blocks]);

  return (
    <>
      {groups.map(([color, list]) => (
        <BlockGroup key={color} color={color} list={list} castShadow={castShadow} receiveShadow={receiveShadow} animate={animate} />
      ))}
    </>
  );
}

function BlockGroup({ color, list, castShadow, receiveShadow }: { color: string; list: Block[]; castShadow?: boolean; receiveShadow?: boolean; animate?: "water" }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  // One-time matrix fill on mount — NO per-frame work
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
    mesh.current.computeBoundingSphere();
  }, [list]);

  if (list.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined as any, undefined as any, list.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} flatShading />
    </instancedMesh>
  );
}

function Decor({ type, x, z, s, r, seed, pal }: { type: "tree" | "rock" | "bush" | "flower"; x: number; z: number; s: number; r: number; seed: number; pal: Palette }) {
  // Compute all random values ONCE per seed — never re-roll on re-render.
  const shape = useMemo(() => {
    const rand = mulberry32(seed);
    if (type === "tree") {
      return {
        trunkH: 1.0 + rand() * 0.6,
        leafSize: 0.9 + rand() * 0.4,
        ox1: rand() * 0.2 - 0.1, oz1: rand() * 0.2 - 0.1,
        ox2: rand() * 0.2 - 0.1, oz2: rand() * 0.2 - 0.1,
      };
    }
    if (type === "rock") {
      const n = 2 + Math.floor(rand() * 3);
      const sizes = Array.from({ length: n }, (_, i) => 0.5 - i * 0.1 + rand() * 0.15);
      let cum = 0;
      const items = sizes.map((sz) => {
        const yy = cum + sz / 2;
        cum += sz;
        return { sz, y: yy, ox: (rand() - 0.5) * 0.15, oz: (rand() - 0.5) * 0.15 };
      });
      return { items };
    }
    if (type === "flower") {
      return { petalColor: rand() < 0.5 ? pal.flowerA : pal.flowerB };
    }
    return {};
  }, [seed, type, pal]);

  if (type === "tree") {
    const { trunkH, leafSize, ox1, oz1, ox2, oz2 } = shape as any;
    return (
      <group position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
        <mesh position={[0, trunkH / 2, 0]} castShadow>
          <boxGeometry args={[0.35, trunkH, 0.35]} />
          <meshToonMaterial color={pal.trunk} gradientMap={toonGradient} />
        </mesh>
        {/* Faceted conical canopy (cone gives proper Pagonia-style) */}
        <mesh position={[0, trunkH + leafSize * 0.6, 0]} castShadow>
          <coneGeometry args={[leafSize * 1.1, leafSize * 1.4, 6, 1]} />
          <meshToonMaterial color={pal.leavesA} gradientMap={toonGradient} />
        </mesh>
        <mesh position={[ox1, trunkH + leafSize * 1.4, oz1]} castShadow>
          <coneGeometry args={[leafSize * 0.85, leafSize * 1.1, 6, 1]} />
          <meshToonMaterial color={pal.leavesB} gradientMap={toonGradient} />
        </mesh>
        <mesh position={[ox2, trunkH + leafSize * 2.0, oz2]}>
          <coneGeometry args={[leafSize * 0.55, leafSize * 0.7, 6, 1]} />
          <meshToonMaterial color={pal.leavesA} gradientMap={toonGradient} />
        </mesh>
      </group>
    );
  }

  if (type === "rock") {
    const { items } = shape as any;
    return (
      <group position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
        {items.map((it: { sz: number; y: number; ox: number; oz: number }, i: number) => (
          <mesh key={i} position={[it.ox, it.y, it.oz]} rotation={[i * 0.3, i * 0.7, i * 0.5]} castShadow>
            <dodecahedronGeometry args={[it.sz * 0.6, 0]} />
            <meshToonMaterial color={i % 2 === 0 ? pal.rock : pal.rockDark} gradientMap={toonGradient} />
          </mesh>
        ))}
      </group>
    );
  }

  if (type === "bush") {
    return (
      <group position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
        <mesh position={[0, 0.25, 0]}>
          <icosahedronGeometry args={[0.35, 0]} />
          <meshToonMaterial color={pal.leavesA} gradientMap={toonGradient} />
        </mesh>
        <mesh position={[0.22, 0.36, 0.1]}>
          <icosahedronGeometry args={[0.22, 0]} />
          <meshToonMaterial color={pal.leavesB} gradientMap={toonGradient} />
        </mesh>
        <mesh position={[-0.18, 0.3, -0.12]}>
          <icosahedronGeometry args={[0.2, 0]} />
          <meshToonMaterial color={pal.leavesA} gradientMap={toonGradient} />
        </mesh>
      </group>
    );
  }

  // flower
  const { petalColor } = shape as any;
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.06, 0.36, 0.06]} />
        <meshToonMaterial color="#2f6b35" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <icosahedronGeometry args={[0.12, 0]} />
        <meshToonMaterial color={petalColor} gradientMap={toonGradient} />
      </mesh>
    </group>
  );
}
