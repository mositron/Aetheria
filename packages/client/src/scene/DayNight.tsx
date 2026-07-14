import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { MapId } from "@game/shared";

const DAY_LENGTH_MS = 5 * 60 * 1000;

export function DayNight({ mapId }: { mapId: MapId }) {
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const skyRef = useRef<any>(null);
  const moonRef = useRef<THREE.Mesh>(null);
  const moonLightRef = useRef<THREE.PointLight>(null);
  const starsRef = useRef<THREE.Group>(null);
  const skyGroupRef = useRef<THREE.Group>(null);
  // Day/night transitions are tracked via lastNight ref — NOT React state.
  // setState inside useFrame caused scene-wide stutter on transitions.
  const lastNight = useRef(false);
  const { scene } = useThree();
  // Pre-allocate sky colors to avoid per-transition GC
  const nightColor = useRef(new THREE.Color("#1a0f3a")).current;
  const dayColor = useRef(new THREE.Color("#bae6fd")).current;

  // mount Stars/moon once — toggle visibility per frame instead of remounting
  useFrame(() => {
    if (mapId !== "field") return;
    const t = (Date.now() % DAY_LENGTH_MS) / DAY_LENGTH_MS;
    const sunAngle = t * Math.PI * 2 - Math.PI / 2;
    const sx = Math.cos(sunAngle) * 20;
    const sy = Math.sin(sunAngle) * 20;
    const sz = 5;
    const dayFactor = Math.max(0, Math.min(1, (sy + 4) / 8));
    const night = dayFactor < 0.15;

    if (dirLightRef.current) {
      dirLightRef.current.position.set(sx, Math.max(0.5, sy), sz);
      // Stronger sun for crisp toon shadows (Pagonia look)
      dirLightRef.current.intensity = 0.25 + dayFactor * 1.7;
      const horizon = 1 - Math.min(1, Math.abs(sy) / 6);
      // Warmer sun mid-day, golden at horizon
      dirLightRef.current.color.setRGB(1, 1 - horizon * 0.35, 0.85 - horizon * 0.55);
    }
    // Cooler ambient = stronger sun/shadow separation = more "stylized".
    // At night, blend ambient toward blue moonlight tones for atmosphere.
    if (ambRef.current) {
      ambRef.current.intensity = night ? 0.32 : 0.18 + dayFactor * 0.42;
      if (night) ambRef.current.color.setRGB(0.45, 0.55, 0.85);  // moonlit blue
      else       ambRef.current.color.setRGB(0.66, 0.83, 1.00);  // sky blue
    }

    if (moonRef.current) {
      moonRef.current.visible = night;
      moonRef.current.position.set(-sx * 0.7, 15, -sz * 0.7);
    }
    if (moonLightRef.current) {
      moonLightRef.current.visible = night;
      moonLightRef.current.position.set(-sx * 0.7, 15, -sz * 0.7);
      // Brighter moon glow for better night visibility
      moonLightRef.current.intensity = night ? 2.2 : 0;
    }
    if (starsRef.current) starsRef.current.visible = night;
    if (skyGroupRef.current) skyGroupRef.current.visible = !night;

    // toggle bg color via scene only on transition — cheap
    if (night !== lastNight.current) {
      lastNight.current = night;
      // Brighter cheerful daytime: pastel sky-blue; night: deep navy with hint of violet
      const col = night ? nightColor : dayColor;
      scene.background = col;
      if (scene.fog) (scene.fog as THREE.Fog).color.copy(col);
    }
  });

  useEffect(() => () => { lastNight.current = false; }, []);

  return (
    <>
      {/* Cool ambient (sky blue) — creates the cyan shadow tint of Pagonia */}
      <ambientLight ref={ambRef} intensity={0.6} color="#a8d4ff" />
      {/* Warm crisp sun */}
      <directionalLight ref={dirLightRef} position={[10, 15, 5]} intensity={1.6} color="#fff2cc" castShadow shadow-bias={-0.0005} />
      {/* Hemisphere: warmer ground bounce, cool sky */}
      <hemisphereLight args={["#bae6fd", "#fde68a", 0.55]} />
      <group ref={skyGroupRef}>
        <Sky sunPosition={[10, 5, 10]} turbidity={2} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.85} />
      </group>
      <FluffyClouds nightRef={lastNight} />
      <group ref={starsRef} visible={false}>
        <Stars radius={80} depth={50} count={1500} factor={5} fade speed={0.3} />
      </group>
      <mesh ref={moonRef} visible={false}>
        <sphereGeometry args={[2.5, 16, 12]} />
        <meshBasicMaterial color="#fef3c7" />
      </mesh>
      <pointLight ref={moonLightRef} color="#fde68a" intensity={1.5} distance={150} visible={false} />
    </>
  );
}

// Procedural soft-edge radial gradient — replaces the old plain-box cloud
// clusters with painterly billboard sprites. Drawn once at module load
// (same procedural-everything spirit as sfx.ts), reused across every cloud.
let _cloudTexture: THREE.Texture | null = null;
function cloudTexture(): THREE.Texture {
  if (_cloudTexture) return _cloudTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _cloudTexture = tex;
  return tex;
}

/** Slow-drifting cute fluffy clouds high overhead. Hidden at night. */
function FluffyClouds({ nightRef }: { nightRef: React.MutableRefObject<boolean> }) {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => cloudTexture(), []);
  const clouds = useRef<{ x: number; y: number; z: number; speed: number }[]>(
    Array.from({ length: 12 }).map((_, i) => ({
      x: (i / 12) * 200 - 100,
      y: 25 + Math.random() * 10,
      z: (Math.random() - 0.5) * 200,
      speed: 0.4 + Math.random() * 0.4,
    }))
  );

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.visible = !nightRef.current;
    group.current.children.forEach((m, i) => {
      const c = clouds.current[i];
      c.x += c.speed * dt;
      if (c.x > 120) c.x = -120;
      m.position.set(c.x, c.y, c.z);
    });
  });

  return (
    <group ref={group}>
      {clouds.current.map((_, i) => (
        <group key={i}>
          <sprite scale={[9, 4, 1]}>
            <spriteMaterial map={tex} transparent depthWrite={false} opacity={0.95} fog />
          </sprite>
          <sprite scale={[6.5, 3.2, 1]} position={[3.4, 0.3, 0.2]}>
            <spriteMaterial map={tex} transparent depthWrite={false} opacity={0.85} fog />
          </sprite>
          <sprite scale={[5.5, 2.8, 1]} position={[-2.8, -0.2, -0.2]}>
            <spriteMaterial map={tex} transparent depthWrite={false} opacity={0.85} fog />
          </sprite>
        </group>
      ))}
    </group>
  );
}
