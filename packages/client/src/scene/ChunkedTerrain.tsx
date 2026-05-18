// Renders the infinite world as discrete chunks loaded around the player.
// Mounts chunks within LOAD_RADIUS, unmounts beyond UNLOAD_RADIUS.
// Each chunk is a memoized component that renders its own toon-shaded
// stacked columns + decor (trees/rocks/bushes).

import { useEffect, useMemo, useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import {
  CHUNK_SIZE, CELL_SIZE, CHUNK_CELLS, STEP, MAX_HEIGHT, WATER_Y,
  getHeight, getBiomeValue, getBiome, isWater, getChunkDecor, worldToChunk,
  type Biome,
} from "./chunkWorld";
import { registerObstacles, unregisterObstacles } from "./obstacles";

const LOAD_RADIUS = 3;       // chunks loaded around player (3 = 7×7 area = ~225m wide)
const UNLOAD_RADIUS = 4;     // chunks beyond this distance are evicted
const STREAM_INTERVAL_MS = 300;

// Shared toon gradient (single instance, all chunks share)
const toonGradient = (() => {
  const steps = [50, 110, 175, 220, 255];
  const data = new Uint8Array(steps.length * 4);
  for (let i = 0; i < steps.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = steps[i];
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();

function pickColor(biome: Biome, h: number): string {
  const ratio = h / MAX_HEIGHT;
  // High elevations always rocky/snowy regardless of biome
  if (ratio > 0.75) return biome === "snow" ? "#f0f4f8" : "#a8a09a";
  if (ratio > 0.45) {
    if (biome === "desert") return "#c9986a";
    if (biome === "snow")   return "#d4dce4";
    if (biome === "swamp")  return "#5e6b3f";
    return "#7c5e3f";  // rocky mid
  }
  // Ground level by biome
  switch (biome) {
    case "forest": return "#3fb555";
    case "desert": return "#e8c890";
    case "snow":   return "#e6ecf2";
    case "swamp":  return "#4a6b3f";
    default:       return "#86c259";    // plains
  }
}

// ── Single chunk renderer ────────────────────────────────────────────────────
function Chunk({ cx, cz }: { cx: number; cz: number }) {
  // Build all geometry data once per chunk mount
  const data = useMemo(() => {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    type Col = { x: number; z: number; h: number; color: string };
    const columns: Col[] = [];
    const waterTiles: Array<{ x: number; z: number }> = [];

    for (let i = 0; i < CHUNK_CELLS; i++) {
      for (let j = 0; j < CHUNK_CELLS; j++) {
        const x = baseX + (i + 0.5) * CELL_SIZE;
        const z = baseZ + (j + 0.5) * CELL_SIZE;
        const h = getHeight(x, z);
        if (isWater(x, z)) {
          waterTiles.push({ x, z });
        } else if (h > 0) {
          const biome = getBiome(x, z);
          columns.push({ x, z, h, color: pickColor(biome, h) });
        }
      }
    }
    const decor = getChunkDecor(cx, cz);
    return { columns, waterTiles, decor };
  }, [cx, cz]);

  // Group columns by color → fewer materials, fewer draw calls
  const colorGroups = useMemo(() => {
    const m = new Map<string, typeof data.columns>();
    for (const c of data.columns) {
      const list = m.get(c.color);
      if (list) list.push(c); else m.set(c.color, [c]);
    }
    return Array.from(m.entries());
  }, [data.columns]);

  // Publish obstacles for this chunk on mount, remove on unmount
  useEffect(() => {
    const obs: Array<{ x: number; z: number; r: number }> = [];
    for (const t of data.decor.trees) obs.push({ x: t.x, z: t.z, r: 0.5 * t.scale });
    for (const r of data.decor.rocks) obs.push({ x: r.x, z: r.z, r: 0.6 * r.scale });
    const source = `chunk:${cx},${cz}`;
    registerObstacles(source, obs);
    return () => { unregisterObstacles(source); };
  }, [cx, cz, data.decor]);

  return (
    <group>
      {colorGroups.map(([color, cols]) => (
        <ColumnGroup key={color} color={color} cols={cols} />
      ))}
      {data.waterTiles.length > 0 && <WaterPatch tiles={data.waterTiles} />}
      {data.decor.trees.map((t, i) => <Tree key={`t${i}`} {...t} />)}
      {data.decor.rocks.map((r, i) => <Rock key={`r${i}`} {...r} />)}
      {data.decor.bushes.map((b, i) => <Bush key={`b${i}`} {...b} />)}
    </group>
  );
}

function ColumnGroup({ color, cols }: { color: string; cols: Array<{ x: number; z: number; h: number }> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D();
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      obj.position.set(c.x, c.h / 2, c.z);
      obj.scale.set(CELL_SIZE, c.h, CELL_SIZE);
      obj.updateMatrix();
      ref.current.setMatrixAt(i, obj.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [cols]);
  if (cols.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, cols.length]} receiveShadow castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </instancedMesh>
  );
}

function WaterPatch({ tiles }: { tiles: Array<{ x: number; z: number }> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D();
    for (let i = 0; i < tiles.length; i++) {
      obj.position.set(tiles[i].x, WATER_Y + 0.05, tiles[i].z);
      obj.scale.set(CELL_SIZE * 1.01, 0.1, CELL_SIZE * 1.01);
      obj.updateMatrix();
      ref.current.setMatrixAt(i, obj.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [tiles]);
  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, tiles.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color="#38bdf8" gradientMap={toonGradient} transparent opacity={0.85} />
    </instancedMesh>
  );
}

// ── Decor primitives (toon-shaded simple shapes) ────────────────────────────
function Tree({ x, z, scale, rot }: { x: number; z: number; scale: number; rot: number }) {
  const baseY = getHeight(x, z);
  return (
    <group position={[x, baseY, z]} rotation={[0, rot, 0]} scale={scale}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.35, 1.2, 0.35]} />
        <meshToonMaterial color="#6b3917" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <coneGeometry args={[1.1, 1.4, 6, 1]} />
        <meshToonMaterial color="#3fb555" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[0.85, 1.1, 6, 1]} />
        <meshToonMaterial color="#6bd66e" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 3.3, 0]}>
        <coneGeometry args={[0.55, 0.7, 6, 1]} />
        <meshToonMaterial color="#3fb555" gradientMap={toonGradient} />
      </mesh>
    </group>
  );
}

function Rock({ x, z, scale, rot }: { x: number; z: number; scale: number; rot: number }) {
  const baseY = getHeight(x, z);
  return (
    <group position={[x, baseY, z]} rotation={[rot * 0.3, rot, rot * 0.5]} scale={scale}>
      <mesh castShadow>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshToonMaterial color="#c2b8aa" gradientMap={toonGradient} />
      </mesh>
    </group>
  );
}

function Bush({ x, z, scale, rot }: { x: number; z: number; scale: number; rot: number }) {
  const baseY = getHeight(x, z);
  return (
    <group position={[x, baseY, z]} rotation={[0, rot, 0]} scale={scale}>
      <mesh position={[0, 0.25, 0]}>
        <icosahedronGeometry args={[0.35, 0]} />
        <meshToonMaterial color="#3fb555" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0.22, 0.36, 0.1]}>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshToonMaterial color="#6bd66e" gradientMap={toonGradient} />
      </mesh>
    </group>
  );
}

// ── Main exported chunk manager ─────────────────────────────────────────────
export function ChunkedTerrain({ room }: { room: Room<WorldState> }) {
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const lastCheck = useRef(0);

  // Drive chunk loading from a low-frequency tick (300ms)
  useFrame(() => {
    const now = performance.now();
    if (now - lastCheck.current < STREAM_INTERVAL_MS) return;
    lastCheck.current = now;

    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    const { cx: pcx, cz: pcz } = worldToChunk(me.pos.x, me.pos.z);

    setLoaded((prev) => {
      const next = new Set(prev);
      let changed = false;

      // Mount missing chunks within LOAD_RADIUS
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
          const k = `${pcx + dx},${pcz + dz}`;
          if (!next.has(k)) { next.add(k); changed = true; }
        }
      }
      // Evict chunks beyond UNLOAD_RADIUS
      for (const k of next) {
        const [cx, cz] = k.split(",").map(Number);
        if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
          next.delete(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  return (
    <group>
      {Array.from(loaded).map((k) => {
        const [cx, cz] = k.split(",").map(Number);
        return <Chunk key={k} cx={cx} cz={cz} />;
      })}
    </group>
  );
}
