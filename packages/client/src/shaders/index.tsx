// Beautiful reusable shader materials — drop-in for any mesh.
// Beats Godot's Visual Shader because they're pure GLSL with React props.
//
//   <mesh>
//     <boxGeometry />
//     <ToonMaterial color="#22d3ee" rimColor="#fff" />
//   </mesh>

import { useMemo, useRef } from "react";
import { useFrame, extend, type MaterialNode } from "@react-three/fiber";
import * as THREE from "three";

// ── 1. Toon / Cel-shaded ────────────────────────────────────────────────────
// 3-band quantized lighting + fresnel rim light + soft shadow edge.
class ToonShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uColor:    { value: new THREE.Color("#22d3ee") },
        uRimColor: { value: new THREE.Color("#ffffff") },
        uRimPower: { value: 2.5 },
        uBands:    { value: 3.0 },
        uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
        uShadowMix:{ value: 0.55 },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform vec3 uRimColor;
        uniform float uRimPower;
        uniform float uBands;
        uniform vec3 uLightDir;
        uniform float uShadowMix;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float ndl = dot(normalize(vNormal), normalize(uLightDir));
          ndl = ndl * 0.5 + 0.5;
          float banded = floor(ndl * uBands) / (uBands - 1.0);
          vec3 shadow = uColor * uShadowMix;
          vec3 lit = mix(shadow, uColor, banded);
          float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
          rim = pow(rim, uRimPower);
          vec3 final = lit + uRimColor * rim * 0.7;
          gl_FragColor = vec4(final, 1.0);
        }`,
    });
  }
}

// ── 2. Dissolve (death / spawn / portal) ────────────────────────────────────
class DissolveShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      uniforms: {
        uColor:     { value: new THREE.Color("#ffffff") },
        uEdgeColor: { value: new THREE.Color("#22d3ee") },
        uProgress:  { value: 0.0 },     // 0 = whole, 1 = gone
        uEdgeWidth: { value: 0.05 },
        uTime:      { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform vec3 uEdgeColor;
        uniform float uProgress;
        uniform float uEdgeWidth;
        uniform float uTime;
        varying vec3 vPosition;
        varying vec3 vNormal;
        // 3D noise
        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(
            mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
            f.z);
        }
        void main() {
          float n = noise(vPosition * 3.5 + vec3(uTime * 0.2, 0.0, 0.0));
          if (n < uProgress) discard;
          float edge = smoothstep(uProgress, uProgress + uEdgeWidth, n);
          vec3 col = mix(uEdgeColor, uColor, edge);
          float emit = (1.0 - edge) * 2.0;
          gl_FragColor = vec4(col + uEdgeColor * emit, 1.0);
        }`,
    });
  }
}

// ── 3. Hologram (boss spawn / ghost / illusion) ─────────────────────────────
class HologramShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor:     { value: new THREE.Color("#67e8f9") },
        uTime:      { value: 0 },
        uOpacity:   { value: 0.7 },
        uScanSpeed: { value: 1.5 },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vec4 mv = viewMatrix * worldPos;
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uScanSpeed;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          float fresnel = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
          fresnel = pow(fresnel, 2.0);
          float scan = sin(vWorldPos.y * 25.0 - uTime * uScanSpeed * 4.0) * 0.5 + 0.5;
          scan = smoothstep(0.4, 1.0, scan);
          float flicker = 0.85 + sin(uTime * 30.0) * 0.05 + sin(uTime * 17.0) * 0.05;
          vec3 col = uColor * (fresnel * 1.5 + scan * 0.4 + 0.2) * flicker;
          gl_FragColor = vec4(col, (fresnel + scan * 0.5) * uOpacity);
        }`,
    });
  }
}

// ── 4. Water (animated, refractive feel without raymarch) ───────────────────
class WaterShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      uniforms: {
        uShallow:  { value: new THREE.Color("#7dd3fc") },
        uDeep:     { value: new THREE.Color("#0c4a6e") },
        uFoam:     { value: new THREE.Color("#ffffff") },
        uTime:     { value: 0 },
        uWaveAmp:  { value: 0.05 },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uWaveAmp;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying float vHeight;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float w = sin(pos.x * 1.4 + uTime * 1.2) * cos(pos.z * 1.1 + uTime * 0.9);
          float w2 = sin(pos.x * 3.1 - uTime * 1.7) * 0.4;
          pos.y += (w + w2) * uWaveAmp;
          vHeight = w;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform float uTime;
        varying vec2 vUv;
        varying float vHeight;
        void main() {
          float depth = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uDeep, uShallow, depth);
          float foam = smoothstep(0.7, 1.0, vHeight + sin(vUv.x * 80.0 + uTime * 3.0) * 0.15);
          col = mix(col, uFoam, foam * 0.8);
          gl_FragColor = vec4(col, 0.88);
        }`,
    });
  }
}

// ── 5. Rim glow (status effect: poison, burn, frozen) ───────────────────────
class RimShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      uniforms: {
        uBase:     { value: new THREE.Color("#ffffff") },
        uRim:      { value: new THREE.Color("#a855f7") },
        uPower:    { value: 3.0 },
        uIntensity:{ value: 1.4 },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uBase;
        uniform vec3 uRim;
        uniform float uPower;
        uniform float uIntensity;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
          rim = pow(rim, uPower) * uIntensity;
          gl_FragColor = vec4(uBase + uRim * rim, 0.6 + rim * 0.4);
        }`,
    });
  }
}

extend({ ToonShaderMaterial, DissolveShaderMaterial, HologramShaderMaterial, WaterShaderMaterial, RimShaderMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    toonShaderMaterial: MaterialNode<ToonShaderMaterial, typeof ToonShaderMaterial>;
    dissolveShaderMaterial: MaterialNode<DissolveShaderMaterial, typeof DissolveShaderMaterial>;
    hologramShaderMaterial: MaterialNode<HologramShaderMaterial, typeof HologramShaderMaterial>;
    waterShaderMaterial: MaterialNode<WaterShaderMaterial, typeof WaterShaderMaterial>;
    rimShaderMaterial: MaterialNode<RimShaderMaterial, typeof RimShaderMaterial>;
  }
}

// ── React wrappers (auto-update time uniforms) ──────────────────────────────
export function ToonMaterial(props: {
  color?: string; rimColor?: string; rimPower?: number; bands?: number; shadowMix?: number;
}) {
  const ref = useRef<ToonShaderMaterial>(null);
  return (
    <toonShaderMaterial
      ref={ref as any}
      uniforms-uColor-value={new THREE.Color(props.color ?? "#22d3ee")}
      uniforms-uRimColor-value={new THREE.Color(props.rimColor ?? "#ffffff")}
      uniforms-uRimPower-value={props.rimPower ?? 2.5}
      uniforms-uBands-value={props.bands ?? 3}
      uniforms-uShadowMix-value={props.shadowMix ?? 0.55}
    />
  );
}

export function DissolveMaterial(props: {
  color?: string; edgeColor?: string; progress: number; edgeWidth?: number;
}) {
  const ref = useRef<DissolveShaderMaterial>(null);
  useFrame((s) => { if (ref.current) (ref.current.uniforms.uTime.value = s.clock.elapsedTime); });
  return (
    <dissolveShaderMaterial
      ref={ref as any}
      uniforms-uColor-value={new THREE.Color(props.color ?? "#ffffff")}
      uniforms-uEdgeColor-value={new THREE.Color(props.edgeColor ?? "#22d3ee")}
      uniforms-uProgress-value={props.progress}
      uniforms-uEdgeWidth-value={props.edgeWidth ?? 0.05}
    />
  );
}

export function HologramMaterial(props: { color?: string; opacity?: number; scanSpeed?: number }) {
  const ref = useRef<HologramShaderMaterial>(null);
  useFrame((s) => { if (ref.current) (ref.current.uniforms.uTime.value = s.clock.elapsedTime); });
  return (
    <hologramShaderMaterial
      ref={ref as any}
      uniforms-uColor-value={new THREE.Color(props.color ?? "#67e8f9")}
      uniforms-uOpacity-value={props.opacity ?? 0.7}
      uniforms-uScanSpeed-value={props.scanSpeed ?? 1.5}
    />
  );
}

export function WaterMaterial(props: { shallow?: string; deep?: string; foam?: string; waveAmp?: number }) {
  const ref = useRef<WaterShaderMaterial>(null);
  useFrame((s) => { if (ref.current) (ref.current.uniforms.uTime.value = s.clock.elapsedTime); });
  return (
    <waterShaderMaterial
      ref={ref as any}
      uniforms-uShallow-value={new THREE.Color(props.shallow ?? "#7dd3fc")}
      uniforms-uDeep-value={new THREE.Color(props.deep ?? "#0c4a6e")}
      uniforms-uFoam-value={new THREE.Color(props.foam ?? "#ffffff")}
      uniforms-uWaveAmp-value={props.waveAmp ?? 0.05}
    />
  );
}

export function RimMaterial(props: { base?: string; rim?: string; power?: number; intensity?: number }) {
  return (
    <rimShaderMaterial
      uniforms-uBase-value={new THREE.Color(props.base ?? "#ffffff")}
      uniforms-uRim-value={new THREE.Color(props.rim ?? "#a855f7")}
      uniforms-uPower-value={props.power ?? 3}
      uniforms-uIntensity-value={props.intensity ?? 1.4}
    />
  );
}
