// Pagonia-style stepped terrain: heightmap → stacked toon-shaded boxes.
// Renders dramatic plateaus, cliffs, mountains, with rivers + waterfalls.
// Decorative — keeps player's flat play area centered on (0,0).

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

// ── Deterministic PRNG ──────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 2D value noise (cheap painterly look)
function makeNoise2D(seed: number) {
  const rand = mulberry32(seed);
  const grid: number[] = [];
  const N = 64;
  for (let i = 0; i < N * N; i++) grid.push(rand());
  return (x: number, y: number) => {
    x = (x % N + N) % N;
    y = (y % N + N) % N;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = grid[(yi % N) * N + (xi % N)];
    const b = grid[(yi % N) * N + ((xi + 1) % N)];
    const c = grid[((yi + 1) % N) * N + (xi % N)];
    const d = grid[((yi + 1) % N) * N + ((xi + 1) % N)];
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, y * f);
    f *= 2;
    a *= 0.5;
  }
  return v;
}

// ── Terrain generation ──────────────────────────────────────────────────────
// Returns array of column "stacks" — one per visible cell with height > 0.
// Each column is rendered as a stretched box (cellSize × height × cellSize).

type Column = { x: number; z: number; h: number; biome: number };

function generateTerrain(seed: number, opts: {
  innerRadius: number;     // player area kept flat
  outerRadius: number;     // edge of generated terrain
  cellSize: number;
  maxHeight: number;
  stepSize: number;        // height quantization
}): { columns: Column[]; rivers: RiverSegment[]; waterfalls: Waterfall[] } {
  const noise = makeNoise2D(seed);
  const noise2 = makeNoise2D(seed + 99);
  const { innerRadius, outerRadius, cellSize, maxHeight, stepSize } = opts;

  const columns: Column[] = [];
  const heightMap = new Map<string, number>();

  const cellsR = Math.ceil(outerRadius / cellSize);
  for (let cx = -cellsR; cx <= cellsR; cx++) {
    for (let cz = -cellsR; cz <= cellsR; cz++) {
      const x = cx * cellSize;
      const z = cz * cellSize;
      const d = Math.hypot(x, z);
      if (d < innerRadius) continue;       // keep play area flat
      if (d > outerRadius) continue;       // outside generation zone

      // Falloff: terrain rises with distance from center
      const rampIn = Math.min(1, (d - innerRadius) / 8);    // gradual rise near play area
      const rampOut = 1;                                     // full at outer

      // Multi-octave noise heightmap
      const nx = cx * 0.08;
      const nz = cz * 0.08;
      let h = fbm(noise, nx, nz, 5);
      h = Math.pow(h, 1.4);  // contrast bumps

      // Biome variation (red canyon vs green plateau vs gray peak)
      const biome = fbm(noise2, nx * 0.5, nz * 0.5, 2);

      // Quantize to steps for stepped-cliff look
      h = h * maxHeight * rampIn * rampOut;
      h = Math.floor(h / stepSize) * stepSize;
      if (h <= 0) continue;

      columns.push({ x, z, h, biome });
      heightMap.set(`${cx},${cz}`, h);
    }
  }

  // ── Generate rivers: trace down-slope paths from high points ───────────────
  const rivers: RiverSegment[] = [];
  // Pick a few seed points in highlands, trace down to inner ring
  const riverSeeds = 3;
  const rand = mulberry32(seed + 555);
  const tried = new Set<string>();
  for (let s = 0; s < riverSeeds; s++) {
    const a = (s / riverSeeds) * Math.PI * 2 + rand() * 0.5;
    let cx = Math.round(Math.cos(a) * (cellsR - 3));
    let cz = Math.round(Math.sin(a) * (cellsR - 3));
    let safety = 50;
    while (safety-- > 0) {
      const key = `${cx},${cz}`;
      if (tried.has(key)) break;
      tried.add(key);
      const here = heightMap.get(key) ?? 0;
      if (here <= 0) break;
      // find lowest neighbor
      let bestKey: string | null = null;
      let bestH = here;
      let bestDx = 0, bestDz = 0;
      for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]] as const) {
        const nk = `${cx+dx},${cz+dz}`;
        const nh = heightMap.get(nk) ?? 0;
        if (nh < bestH) { bestH = nh; bestKey = nk; bestDx = dx; bestDz = dz; }
      }
      const fromX = cx * cellSize;
      const fromZ = cz * cellSize;
      if (!bestKey) {
        // ends here — push final segment leading into play area
        rivers.push({ x1: fromX, z1: fromZ, x2: fromX + 0, z2: fromZ + 0, h1: here, h2: 0 });
        break;
      }
      const toX = (cx + bestDx) * cellSize;
      const toZ = (cz + bestDz) * cellSize;
      rivers.push({ x1: fromX, z1: fromZ, x2: toX, z2: toZ, h1: here, h2: bestH });
      cx += bestDx;
      cz += bestDz;
    }
  }

  // ── Find waterfalls: any river segment with >= 2-step drop ─────────────────
  const waterfalls: Waterfall[] = [];
  for (const r of rivers) {
    if (r.h1 - r.h2 >= stepSize * 2) {
      waterfalls.push({
        x: (r.x1 + r.x2) / 2,
        z: (r.z1 + r.z2) / 2,
        topY: r.h1,
        bottomY: r.h2,
      });
    }
  }

  return { columns, rivers, waterfalls };
}

type RiverSegment = { x1: number; z1: number; x2: number; z2: number; h1: number; h2: number };
type Waterfall = { x: number; z: number; topY: number; bottomY: number };

// ── Toon-gradient texture (shared, single instance) ─────────────────────────
const toonGradient = (() => {
  const steps = [50, 110, 175, 220, 255];
  const data = new Uint8Array(steps.length * 4);
  for (let i = 0; i < steps.length; i++) {
    data[i * 4 + 0] = steps[i];
    data[i * 4 + 1] = steps[i];
    data[i * 4 + 2] = steps[i];
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

// ── Biome color picker for terrain columns ──────────────────────────────────
function pickColor(biome: number, h: number, maxH: number): string {
  const heightRatio = h / maxH;
  // High peaks: gray/white
  if (heightRatio > 0.75) return biome < 0.5 ? "#d8d4c8" : "#a8a09a";
  // Mid: rock browns
  if (heightRatio > 0.45) {
    if (biome < 0.3) return "#b8845a";       // tan/sandstone
    if (biome < 0.6) return "#7c5e3f";       // brown
    return "#6b8e5a";                          // mossy
  }
  // Low: grassy plateau
  if (biome < 0.4) return "#86c259";          // grass
  if (biome < 0.7) return "#a3d962";          // bright grass
  return "#5e9b3f";                            // dark grass
}

// ── Instanced renderer per color group ──────────────────────────────────────
type Cell = { x: number; y: number; z: number; sy: number; color: string };

function InstancedColumns({ cells, cellSize, castShadow }: { cells: Cell[]; cellSize: number; castShadow?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, Cell[]>();
    for (const c of cells) {
      const list = m.get(c.color);
      if (list) list.push(c);
      else m.set(c.color, [c]);
    }
    return Array.from(m.entries());
  }, [cells]);

  return (
    <>
      {groups.map(([color, list]) => (
        <ColumnGroup key={color} color={color} list={list} cellSize={cellSize} castShadow={castShadow} />
      ))}
    </>
  );
}

function ColumnGroup({ color, list, cellSize, castShadow }: { color: string; list: Cell[]; cellSize: number; castShadow?: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current || list.length === 0) return;
    const obj = new THREE.Object3D();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      obj.position.set(c.x, c.y, c.z);
      obj.scale.set(cellSize, c.sy, cellSize);
      obj.rotation.set(0, 0, 0);
      obj.updateMatrix();
      mesh.current.setMatrixAt(i, obj.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [list, cellSize]);

  if (list.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined as any, undefined as any, list.length]}
      castShadow={castShadow}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </instancedMesh>
  );
}

// ── Waterfall (animated vertical water) ─────────────────────────────────────
function WaterfallMesh({ x, z, topY, bottomY }: Waterfall) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (meshRef.current) {
      // Vertical UV scroll → "falling" illusion (procedural)
      meshRef.current.position.y = (topY + bottomY) / 2;
      meshRef.current.material = matRef.current!;
    }
  });
  const height = topY - bottomY;
  return (
    <group position={[x, 0, z]}>
      {/* Falling sheet */}
      <mesh ref={meshRef} position={[0, (topY + bottomY) / 2, 0]}>
        <boxGeometry args={[1.4, height, 0.4]} />
        <meshBasicMaterial ref={matRef} color="#bae6fd" transparent opacity={0.85} />
      </mesh>
      {/* Splash mist at bottom */}
      <mesh position={[0, bottomY + 0.1, 0]}>
        <boxGeometry args={[2.5, 0.3, 1.4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
      {/* Falling particle stream */}
      <FallingStream x={x} z={z} topY={topY} bottomY={bottomY} />
    </group>
  );
}

function FallingStream({ topY, bottomY }: { x: number; z: number; topY: number; bottomY: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const COUNT = 30;
  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 0] = (Math.random() - 0.5) * 1.2;
      arr[i * 3 + 1] = bottomY + Math.random() * (topY - bottomY);
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    return arr;
  }, [topY, bottomY]);
  useFrame((_, dt) => {
    if (!pointsRef.current) return;
    const attr = (pointsRef.current.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] -= dt * 6;
      if (arr[i * 3 + 1] < bottomY) {
        arr[i * 3 + 1] = topY;
        arr[i * 3 + 0] = (Math.random() - 0.5) * 1.2;
      }
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#e0f2fe" size={0.18} transparent opacity={0.9} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// ── River segment (a flat box-ribbon between two points) ────────────────────
function RiverMesh({ seg, width }: { seg: RiverSegment; width: number }) {
  const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
  const angle = Math.atan2(seg.z2 - seg.z1, seg.x2 - seg.x1);
  const cx = (seg.x1 + seg.x2) / 2;
  const cz = (seg.z1 + seg.z2) / 2;
  const y = ((seg.h1 + seg.h2) / 2) + 0.05;
  return (
    <mesh position={[cx, y, cz]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[len + 0.2, 0.08, width]} />
      <meshToonMaterial color="#38bdf8" gradientMap={toonGradient} />
    </mesh>
  );
}

// ── Main exported component ─────────────────────────────────────────────────
type Props = {
  innerRadius?: number;
  outerRadius?: number;
  cellSize?: number;
  maxHeight?: number;
  stepSize?: number;
  seed?: number;
};

export function StepTerrain({
  innerRadius = 22,
  outerRadius = 70,
  cellSize = 2,
  maxHeight = 12,
  stepSize = 1.2,
  seed = 1337,
}: Props) {
  const { columns, rivers, waterfalls } = useMemo(
    () => generateTerrain(seed, { innerRadius, outerRadius, cellSize, maxHeight, stepSize }),
    [seed, innerRadius, outerRadius, cellSize, maxHeight, stepSize]
  );

  // Convert columns → cell list (one stretched box per column)
  const cells: Cell[] = useMemo(() => {
    const out: Cell[] = [];
    for (const c of columns) {
      out.push({
        x: c.x,
        y: c.h / 2,
        z: c.z,
        sy: c.h,
        color: pickColor(c.biome, c.h, maxHeight),
      });
    }
    return out;
  }, [columns, maxHeight]);

  return (
    <group>
      <InstancedColumns cells={cells} cellSize={cellSize} castShadow />
      {rivers.map((r, i) => (
        <RiverMesh key={i} seg={r} width={cellSize * 0.8} />
      ))}
      {waterfalls.map((w, i) => (
        <WaterfallMesh key={i} {...w} />
      ))}
    </group>
  );
}
