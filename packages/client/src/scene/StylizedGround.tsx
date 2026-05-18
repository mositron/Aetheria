// Painterly stylized ground — toon-shaded with noise swirls,
// like Pioneers of Pagonia / low-poly RTS games. One mesh, GPU-only.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uColorA;       // base grass
  uniform vec3 uColorB;       // darker patches
  uniform vec3 uColorC;       // highlights
  uniform vec3 uLightDir;
  uniform float uBands;
  uniform float uTime;
  uniform float uScale;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  // Hash + value noise (cheap, painterly look)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
      f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Painterly swirl pattern
    vec2 wp = vWorldPos.xz * uScale;
    float n  = fbm(wp);
    float n2 = fbm(wp * 2.7 + vec2(31.4, 17.2));
    float swirl = fbm(wp * 0.5 + vec2(n * 2.0, n2 * 2.0));

    // Base color: 3-way mix using noise bands
    vec3 base = mix(uColorB, uColorA, smoothstep(0.3, 0.55, n));
    base = mix(base, uColorC, smoothstep(0.65, 0.85, swirl));

    // Toon lighting: quantize ndl to N bands
    float ndl = dot(normalize(vNormal), normalize(uLightDir));
    ndl = ndl * 0.5 + 0.5;
    float banded = floor(ndl * uBands) / max(1.0, uBands - 1.0);
    vec3 shadow = base * 0.65;
    vec3 lit = mix(shadow, base, banded);

    // Subtle vignette on edges of patches (more "hand-painted")
    float darken = 1.0 - smoothstep(0.55, 0.85, swirl) * 0.15;
    lit *= darken;

    gl_FragColor = vec4(lit, 1.0);
  }
`;

type Props = {
  size: number;
  colorA?: string;   // main
  colorB?: string;   // shadow patches
  colorC?: string;   // highlight patches
  bands?: number;
  scale?: number;    // noise scale (higher = smaller swirls)
};

export function StylizedGround({
  size,
  colorA = "#86d96d",
  colorB = "#5fa14a",
  colorC = "#bef264",
  bands = 3,
  scale = 0.12,
}: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useRef({
    uColorA: { value: new THREE.Color(colorA) },
    uColorB: { value: new THREE.Color(colorB) },
    uColorC: { value: new THREE.Color(colorC) },
    uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
    uBands: { value: bands },
    uTime: { value: 0 },
    uScale: { value: scale },
  }).current;

  useFrame((s) => {
    uniforms.uTime.value = s.clock.elapsedTime;
    // sync colors if props change (HMR)
    uniforms.uColorA.value.set(colorA);
    uniforms.uColorB.value.set(colorB);
    uniforms.uColorC.value.set(colorC);
    uniforms.uBands.value = bands;
    uniforms.uScale.value = scale;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
      <planeGeometry args={[size, size, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}
