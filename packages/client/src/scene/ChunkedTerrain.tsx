// Renders the infinite world as discrete chunks loaded around the player.
// Mounts chunks within LOAD_RADIUS, unmounts beyond UNLOAD_RADIUS.
// Each chunk is a memoized component that renders its own toon-shaded
// smooth heightmap terrain mesh + decor (trees/rocks/bushes).

import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import {
  CHUNK_SIZE, CELL_SIZE, CHUNK_CELLS, STEP, MAX_HEIGHT, WATER_Y, TERRAIN_MESH_STEP,
  getHeight, getSmoothHeight, getBiomeValue, getBiome, isWater, bankFactor, getChunkDecor, worldToChunk,
  type Biome,
} from "./chunkWorld";
import { GrassField } from "./GrassField";
import { registerObstacles, unregisterObstacles } from "./obstacles";
import { toonGradient } from "./materials";

// Radius tuned to keep frame time smooth on modest hardware: fewer resident
// chunks means less per-chunk mesh/decor build cost as the player walks and
// chunks stream in/out (each chunk mount does real work — terrain-mesh
// sampling, decor placement, grass — not free). Was 3/4, then 2/3
// (7×7=49 → 5×5=25 chunks); still felt like it rendered too far, so cut
// again to 1/2 (3×3=9 chunks resident). Paired with the fog retune in
// Environment.tsx so the closer unload boundary is masked instead of
// visibly popping into view.
//
// UNLOAD_RADIUS must equal LOAD_RADIUS, not exceed it — eviction below only
// culls chunks farther than UNLOAD_RADIUS from the player's CURRENT tick
// position, so a gap here doesn't just prevent boundary-crossing thrash (the
// presumed intent), it lets the resident set grow to Chebyshev-distance-2 of
// wherever the player has wandered — up to 5×5=25 chunks under normal
// movement (e.g. fighting in place near a boundary), not the 9 documented
// above, silently reintroducing the exact per-frame cost (grass/water
// uniform writes, terrain draw calls, decor instance counts) this constant
// was tightened twice already to avoid.
const LOAD_RADIUS = 1;       // chunks loaded around player (1 = 3×3 area = ~96m wide)
const UNLOAD_RADIUS = 1;     // chunks beyond this distance are evicted — keep equal to LOAD_RADIUS
const STREAM_INTERVAL_MS = 300;

// Elevation gradient stops per biome — [ground, rockMid, peak]. Blended
// continuously by height, written directly into a per-vertex color attribute
// on the terrain mesh (see TerrainMesh below) — the old hard 2-band bucketed
// system only existed to keep InstancedMesh color-grouping cheap, which a
// single mesh draw call per chunk no longer needs.
const BIOME_STOPS: Record<Biome, [string, string, string]> = {
  plains: ["#86c259", "#7c5e3f", "#a8a09a"],
  forest: ["#3fb555", "#7c5e3f", "#a8a09a"],
  desert: ["#e8c890", "#c9986a", "#a8a09a"],
  snow:   ["#e6ecf2", "#d4dce4", "#f0f4f8"],
  swamp:  ["#4a6b3f", "#5e6b3f", "#8f9a86"],
};
const _stopColors = new Map<string, THREE.Color>();
function stopColor(hex: string): THREE.Color {
  let c = _stopColors.get(hex);
  if (!c) { c = new THREE.Color(hex); _stopColors.set(hex, c); }
  return c;
}

// Mutates + returns `out` — avoids per-vertex Color allocation across a
// 17×17 grid × many streamed chunks.
function pickColor(biome: Biome, h: number, out: THREE.Color): THREE.Color {
  const ratio = Math.min(1, Math.max(0, h / MAX_HEIGHT));
  const [groundHex, midHex, peakHex] = BIOME_STOPS[biome];
  if (ratio < 0.5) {
    out.copy(stopColor(groundHex)).lerp(stopColor(midHex), ratio / 0.5);
  } else {
    out.copy(stopColor(midHex)).lerp(stopColor(peakHex), (ratio - 0.5) / 0.5);
  }
  return out;
}

// Bank/shoreline tint — a soft "wet ground" ring around water instead of a
// hard grass-to-water cutoff. Mutates `color` in place.
const WET_TONE = new THREE.Color("#3f5a42");
function applyBankTint(color: THREE.Color, bank: number): THREE.Color {
  if (bank > 0) color.lerp(WET_TONE, Math.min(1, bank) * 0.5);
  return color;
}

// ── Single chunk renderer ────────────────────────────────────────────────────
function Chunk({ cx, cz, room }: { cx: number; cz: number; room: Room<WorldState> }) {
  // Water tiles (for the animated WaterPatch instances) + decor placement —
  // both still sampled at cell centers, unrelated to the terrain mesh's
  // vertex grid below.
  const data = useMemo(() => {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const waterTiles: Array<{ x: number; z: number }> = [];

    for (let i = 0; i < CHUNK_CELLS; i++) {
      for (let j = 0; j < CHUNK_CELLS; j++) {
        const x = baseX + (i + 0.5) * CELL_SIZE;
        const z = baseZ + (j + 0.5) * CELL_SIZE;
        if (isWater(x, z)) waterTiles.push({ x, z });
      }
    }
    const decor = getChunkDecor(cx, cz);
    return { waterTiles, decor };
  }, [cx, cz]);

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
      <TerrainMesh cx={cx} cz={cz} />
      {data.waterTiles.length > 0 && <WaterPatch tiles={data.waterTiles} />}
      <GrassField cx={cx} cz={cz} room={room} />
      {(data.decor.trees.length > 0 || data.decor.rocks.length > 0 || data.decor.bushes.length > 0) && (
        <DecorVisibility cx={cx} cz={cz} room={room}>
          {data.decor.trees.length > 0 && <TreeInstanced trees={data.decor.trees} />}
          {data.decor.rocks.length > 0 && <RockInstanced rocks={data.decor.rocks} />}
          {data.decor.bushes.length > 0 && <BushInstanced bushes={data.decor.bushes} />}
        </DecorVisibility>
      )}
      {/* One signpost per chunk near origin facing back home (every 4th chunk) */}
      {((cx + cz) & 3) === 0 && <Signpost cx={cx} cz={cz} />}
    </group>
  );
}

function Signpost({ cx, cz }: { cx: number; cz: number }) {
  const px = (cx + 0.5) * CHUNK_SIZE;
  const pz = (cz + 0.5) * CHUNK_SIZE;
  const baseY = getHeight(px, pz);
  const dist = Math.hypot(px, pz);
  if (dist < 28) return null; // not too close to spawn
  // Rotate sign to point toward origin
  const angle = Math.atan2(-pz, -px);
  return (
    <group position={[px, baseY, pz]} rotation={[0, angle, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.15, 1, 0.15]} />
        <meshToonMaterial color="#6b3917" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0.45, 1.0, 0]} castShadow>
        <boxGeometry args={[1, 0.4, 0.08]} />
        <meshToonMaterial color="#caa472" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0.6, 1.0, 0]}>
        <boxGeometry args={[0.05, 0.25, 0.09]} />
        <meshToonMaterial color="#2b1808" gradientMap={toonGradient} />
      </mesh>
    </group>
  );
}

// Ground grid resolution — sampled at TERRAIN_MESH_STEP spacing (coarser
// than CELL_SIZE, see chunkWorld.ts) so adjacent chunks' shared edge
// vertices still land on identical world coordinates (getHeight is a pure
// fn of world x,z with no per-chunk randomness, so seams tile automatically
// — no stitching logic needed) while cutting per-chunk noise evaluations
// substantially versus sampling every cell.
const TERRAIN_GRID = CHUNK_SIZE / TERRAIN_MESH_STEP + 1;
const _scratchColor = new THREE.Color();

// Smooth per-chunk terrain mesh — replaces the old stacked-unit-cube
// InstancedMesh columns with a single triangulated heightmap surface (real
// slopes + vertex-lit normals instead of flat cube tops). getHeight() still
// applies its existing STEP quantization, which now reads as gentle stylized
// terracing on an interpolated slope rather than flat boxes — "low-poly
// hills" for free, no new sampling function needed.
function TerrainMesh({ cx, cz }: { cx: number; cz: number }) {
  const geometry = useMemo(() => {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const size = TERRAIN_GRID;
    const positions = new Float32Array(size * size * 3);
    const colors = new Float32Array(size * size * 3);

    let vi = 0;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const wx = baseX + i * TERRAIN_MESH_STEP;
        const wz = baseZ + j * TERRAIN_MESH_STEP;
        const h = getHeight(wx, wz);
        const biome = getBiome(wx, wz);
        pickColor(biome, h, _scratchColor);
        applyBankTint(_scratchColor, bankFactor(wx, wz));

        const p = vi * 3;
        positions[p] = wx; positions[p + 1] = h; positions[p + 2] = wz;
        colors[p] = _scratchColor.r; colors[p + 1] = _scratchColor.g; colors[p + 2] = _scratchColor.b;
        vi++;
      }
    }

    const cells = TERRAIN_GRID - 1;
    const indices = new Uint16Array(cells * cells * 6);
    let ii = 0;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = i + size * j;
        const b = i + size * (j + 1);
        const c = (i + 1) + size * (j + 1);
        const d = (i + 1) + size * j;
        indices[ii++] = a; indices[ii++] = b; indices[ii++] = d;
        indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, [cx, cz]);

  // Imperatively-built geometry isn't auto-disposed by R3F on unmount —
  // chunks mount/unmount continuously under the 300ms streamer, so skipping
  // this is a GPU buffer leak (same class already fixed once in 06792e9).
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    // receiveShadow only — terrain casting shadows onto itself is invisible
    // on this gentle a heightmap, but was still an extra shadow-pass draw
    // call for every one of the up to 9 resident chunks, every frame.
    <mesh geometry={geometry} receiveShadow>
      <meshToonMaterial vertexColors gradientMap={toonGradient} />
    </mesh>
  );
}

// Shared water material — one shader compile for every chunk's water instead
// of one per chunk. Adds a gentle per-tile bob + a soft flow shimmer driven
// by a uTime uniform (updated via ref in useFrame, never React state).
const waterMaterial = (() => {
  const mat = new THREE.MeshToonMaterial({
    color: "#38bdf8",
    gradientMap: toonGradient,
    transparent: true,
    opacity: 0.86,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    (mat as any).userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vFlow;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.5;
  float wave = sin(uTime * 1.4 + wPhase) * 0.06;
  transformed.y += wave * step(0.0, position.y);
  vFlow = sin(uTime * 2.1 + wPhase * 1.7) * 0.5 + 0.5;
#else
  vFlow = 0.0;
#endif`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFlow;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vFlow * 0.14);"
      );
  };
  return mat;
})();

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

  useFrame((state) => {
    const shader = (waterMaterial as any).userData.shader;
    if (shader) shader.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh ref={ref} args={[undefined as any, waterMaterial, tiles.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

// Distance-based visibility for decor (trees/rocks/bushes) — a fully-treed
// chunk was previously rendered in full for as long as it stayed loaded
// (LOAD_RADIUS chunk streaming has no per-decor distance culling at all,
// unlike grass/mobs which already throttle-toggle visibility). Same
// hysteresis pattern as GrassField: check every ~250ms, only touch
// `.visible` on change, never at frame rate. Obstacle registration is
// unaffected (a separate effect keyed off chunk mount, not this) — collision
// stays correct even for decor that's visually culled here.
const DECOR_RADIUS = 50;
const DECOR_CHECK_INTERVAL_MS = 250;

function DecorVisibility({ cx, cz, room, children }: { cx: number; cz: number; room: Room<WorldState>; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const lastCheck = useRef(0);
  const visible = useRef(true);

  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    if (now - lastCheck.current < DECOR_CHECK_INTERVAL_MS) return;
    lastCheck.current = now;
    const me = room.state.players.get(room.sessionId);
    if (!me || !ref.current) return;
    const centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    const dx = me.pos.x - centerX, dz = me.pos.z - centerZ;
    const near = dx * dx + dz * dz <= DECOR_RADIUS * DECOR_RADIUS;
    if (near !== visible.current) {
      visible.current = near;
      ref.current.visible = near;
    }
  });

  return <group ref={ref}>{children}</group>;
}

// ── Decor primitives (toon-shaded simple shapes) ────────────────────────────
// ── Instanced versions (one InstancedMesh per part, per chunk) ──────────────
function TreeInstanced({ trees }: { trees: Array<{ x: number; z: number; scale: number; rot: number }> }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const leaf1 = useRef<THREE.InstancedMesh>(null);
  const leaf2 = useRef<THREE.InstancedMesh>(null);
  const leaf3 = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const obj = new THREE.Object3D();
    // getSmoothHeight does a bilinear blend of 4 getHeight() calls, each of
    // which is ~7 noise() evaluations — the same (x,z) was being recomputed
    // once per fill() call (trunk/leaf1/leaf2/leaf3 = 4x) for a value that's
    // identical across all 4 parts of the same tree. Compute once per tree.
    const baseYs = trees.map((t) => getSmoothHeight(t.x, t.z));
    const fill = (mesh: THREE.InstancedMesh | null, y: number, sx: number, sy: number, sz: number) => {
      if (!mesh) return;
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        obj.position.set(t.x, baseYs[i] + y * t.scale, t.z);
        obj.scale.set(sx * t.scale, sy * t.scale, sz * t.scale);
        obj.rotation.set(0, t.rot, 0);
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(trunk.current, 0.6, 0.35, 1.2, 0.35);
    fill(leaf1.current, 1.8, 1.1, 1.4, 1.1);
    fill(leaf2.current, 2.6, 0.85, 1.1, 0.85);
    fill(leaf3.current, 3.3, 0.55, 0.7, 0.55);
  }, [trees]);
  const n = trees.length;
  return (
    <group>
      {/* Trunk only — leaves don't cast shadow (CLAUDE.md: shadows only on
          torsos/bodies, not foliage). Cuts shadowmap rasterization for the
          ~3 cone leaves per tree across thousands of instances. */}
      <instancedMesh ref={trunk} args={[undefined as any, undefined as any, n]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color="#6b3917" gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={leaf1} args={[undefined as any, undefined as any, n]}>
        <coneGeometry args={[1, 1, 6, 1]} />
        <meshToonMaterial color="#3fb555" gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={leaf2} args={[undefined as any, undefined as any, n]}>
        <coneGeometry args={[1, 1, 6, 1]} />
        <meshToonMaterial color="#6bd66e" gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={leaf3} args={[undefined as any, undefined as any, n]}>
        <coneGeometry args={[1, 1, 6, 1]} />
        <meshToonMaterial color="#3fb555" gradientMap={toonGradient} />
      </instancedMesh>
    </group>
  );
}

function RockInstanced({ rocks }: { rocks: Array<{ x: number; z: number; scale: number; rot: number }> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D();
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      const baseY = getSmoothHeight(r.x, r.z);
      obj.position.set(r.x, baseY + 0.3 * r.scale, r.z);
      obj.scale.set(r.scale, r.scale, r.scale);
      obj.rotation.set(r.rot * 0.3, r.rot, r.rot * 0.5);
      obj.updateMatrix();
      ref.current.setMatrixAt(i, obj.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [rocks]);
  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, rocks.length]} castShadow>
      <dodecahedronGeometry args={[0.6, 0]} />
      <meshToonMaterial color="#c2b8aa" gradientMap={toonGradient} />
    </instancedMesh>
  );
}

function BushInstanced({ bushes }: { bushes: Array<{ x: number; z: number; scale: number; rot: number }> }) {
  const a = useRef<THREE.InstancedMesh>(null);
  const b = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const obj = new THREE.Object3D();
    // Same fix as TreeInstanced — one getSmoothHeight() per bush, not once
    // per fill() call (a/b = 2x redundant otherwise).
    const baseYs = bushes.map((u) => getSmoothHeight(u.x, u.z));
    const fill = (mesh: THREE.InstancedMesh | null, ox: number, oy: number, oz: number, s: number, jitter = 0) => {
      if (!mesh) return;
      for (let i = 0; i < bushes.length; i++) {
        const u = bushes[i];
        obj.position.set(u.x + ox * u.scale, baseYs[i] + oy * u.scale, u.z + oz * u.scale);
        obj.scale.set(s * u.scale, s * u.scale, s * u.scale);
        obj.rotation.set(jitter, u.rot, jitter);
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(a.current, 0, 0.25, 0, 0.35);
    fill(b.current, 0.22, 0.36, 0.1, 0.22);
  }, [bushes]);
  const n = bushes.length;
  return (
    <group>
      <instancedMesh ref={a} args={[undefined as any, undefined as any, n]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshToonMaterial color="#3fb555" gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={b} args={[undefined as any, undefined as any, n]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshToonMaterial color="#6bd66e" gradientMap={toonGradient} />
      </instancedMesh>
    </group>
  );
}

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
export function ChunkedTerrain({ room, onInitialReady }: { room: Room<WorldState>; onInitialReady?: () => void }) {
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const lastCheck = useRef(0);
  const firedReady = useRef(false);

  // Fires once, right after the first batch of chunks around the player has
  // actually mounted (not just been requested) — lets the loading screen
  // know the ground under the player is no longer empty.
  useEffect(() => {
    if (firedReady.current || loaded.size === 0) return;
    firedReady.current = true;
    onInitialReady?.();
  }, [loaded, onInitialReady]);

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
        return <Chunk key={k} cx={cx} cz={cz} room={room} />;
      })}
    </group>
  );
}
