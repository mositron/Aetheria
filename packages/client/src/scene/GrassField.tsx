// Cheap crossed-billboard grass blades, streamed per-chunk alongside
// ChunkedTerrain's trees/rocks/bushes. Two static triangle planes per blade
// (base wide, tip pointed) crossed at 90°, vertex-colored dark→light so no
// texture is needed. A tiny per-instance sine sway is injected into the
// vertex shader (object-space, before the instance matrix multiply) so
// blades don't all wave in lockstep. Visibility is distance-gated and
// throttled (~4Hz, only assigned on change) — never toggled every frame —
// per the LOD pattern already used for mob billboards.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { getSmoothHeight, getChunkGrass, CHUNK_SIZE } from "./chunkWorld";

const GRASS_RADIUS = 46;        // meters — only visible near the player
const CHECK_INTERVAL_MS = 220;  // throttled visibility re-check

let _grassGeo: THREE.BufferGeometry | null = null;
function grassBladeGeometry(): THREE.BufferGeometry {
  if (_grassGeo) return _grassGeo;
  const w = 0.22, h = 0.9;
  const positions = new Float32Array([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0]);
  const base = new THREE.Color("#2f6b35");
  const tip = new THREE.Color("#9be36a");
  const colors = new Float32Array([
    base.r, base.g, base.b,
    base.r, base.g, base.b,
    tip.r, tip.g, tip.b,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  _grassGeo = geo;
  return geo;
}

const grassMaterial = (() => {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    (mat as any).userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  // Low spatial frequency on the phase term made nearby blades sway almost
  // in lockstep, which read as the whole ground "pulsing" rather than
  // individual blades moving — higher-frequency phase spread + slower,
  // gentler amplitude fixes that without losing the wind effect.
  float bladePhase = instanceMatrix[3].x * 2.1 + instanceMatrix[3].z * 1.7;
  float sway = sin(uTime * 0.8 + bladePhase) * 0.06 * transformed.y;
  transformed.x += sway;
  transformed.z += sway * 0.5;
#endif`
      );
  };
  return mat;
})();

export function GrassField({ cx, cz, room }: { cx: number; cz: number; room: Room<WorldState> }) {
  const blades = useMemo(() => getChunkGrass(cx, cz), [cx, cz]);
  const geometry = useMemo(() => grassBladeGeometry(), []);
  const meshA = useRef<THREE.InstancedMesh>(null);
  const meshB = useRef<THREE.InstancedMesh>(null);
  const lastCheck = useRef(0);
  const visible = useRef(false);

  useEffect(() => {
    const obj = new THREE.Object3D();
    const fill = (mesh: THREE.InstancedMesh | null, extraRot: number) => {
      if (!mesh) return;
      for (let i = 0; i < blades.length; i++) {
        const b = blades[i];
        obj.position.set(b.x, getSmoothHeight(b.x, b.z), b.z);
        obj.rotation.set(0, b.rot + extraRot, 0);
        obj.scale.setScalar(b.scale);
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(meshA.current, 0);
    fill(meshB.current, Math.PI / 2);
  }, [blades]);

  useFrame((state) => {
    const shader = (grassMaterial as any).userData.shader;
    if (shader) shader.uniforms.uTime.value = state.clock.elapsedTime;

    const now = state.clock.elapsedTime * 1000;
    if (now - lastCheck.current < CHECK_INTERVAL_MS) return;
    lastCheck.current = now;
    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    const centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    const dx = me.pos.x - centerX, dz = me.pos.z - centerZ;
    const near = dx * dx + dz * dz <= GRASS_RADIUS * GRASS_RADIUS;
    if (near !== visible.current) {
      visible.current = near;
      if (meshA.current) meshA.current.visible = near;
      if (meshB.current) meshB.current.visible = near;
    }
  });

  if (blades.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={meshA} args={[geometry, grassMaterial, blades.length]} visible={false} />
      <instancedMesh ref={meshB} args={[geometry, grassMaterial, blades.length]} visible={false} />
    </group>
  );
}
