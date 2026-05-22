import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

/** Falling snow particles for Christmas season */
export function Snowfall({ count = 100 }: { count?: number }) {
  const meshRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 100;
      pos[i * 3 + 1] = Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    return pos;
  }, [count]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= delta * 3;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 50;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.3} transparent opacity={0.8} />
    </points>
  );
}

/** Floating water splash particles for Songkran */
export function ParticleSplash({ count = 50, spread = 80, color = "#7dd3fc" }: { count?: number; spread?: number; color?: string }) {
  const meshRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = Math.random() * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    return pos;
  }, [count, spread]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= delta * 5;
      pos[i * 3] += Math.sin(Date.now() * 0.001 + i) * delta * 2;
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = 20 + Math.random() * 5;
      }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.4} transparent opacity={0.7} />
    </points>
  );
}

/** Floating lanterns for Loy Krathong */
export function LanternFloat({ count = 30 }: { count?: number }) {
  const meshRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 25 + 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return pos;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += Math.sin(Date.now() * 0.0005 + i * 0.5) * 0.05;
      pos[i * 3 + 1] = 10 + Math.sin(Date.now() * 0.001 + i) * 3;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#fde68a" size={0.5} transparent opacity={0.85} />
    </points>
  );
}

/** Floating skulls for Halloween */
export function FloatingSkulls({ count = 20 }: { count?: number }) {
  const meshRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 15 + 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    return pos;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += Math.sin(Date.now() * 0.0003 + i * 1.2) * 0.08;
      pos[i * 3 + 1] = 5 + Math.sin(Date.now() * 0.0008 + i * 0.7) * 4;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a855f7" size={0.4} transparent opacity={0.7} />
    </points>
  );
}

/** Season-aware wrapper — renders the correct particle system based on current season */
export function SeasonalEffects({ room }: { room: Room<WorldState> }) {
  const season = room.state.season;

  if (season === "christmas") return <Snowfall count={100} />;
  if (season === "songkran") return <ParticleSplash count={50} spread={80} color="#7dd3fc" />;
  if (season === "loy_krathong") return <LanternFloat count={30} />;
  if (season === "halloween") return <FloatingSkulls count={20} />;

  return null;
}