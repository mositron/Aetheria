import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

type Effect = {
  id: number;
  kind: string;
  fromId: string;
  fx: number; fz: number;
  tx: number; tz: number;
  aoe: number;
  born: number;
};

let UID = 0;
const LIFE = 700;

const SKILL_KIND_MAP: Record<string, "fire" | "ice" | "holy" | "arrow" | "slash" | "poison" | "heal"> = {
  firebolt: "fire",
  frost_nova: "ice",
  bash: "slash",
  whirlwind: "slash",
  arrow_shot: "arrow",
  double_strafe: "arrow",
  heal: "heal",
  holy_smite: "holy",
  envenom: "poison",
  back_slide: "slash",
};

export function SkillEffects({ room }: { room: Room<WorldState> }) {
  const [effects, setEffects] = useState<Effect[]>([]);

  useEffect(() => {
    const off = room.onMessage("skillCast" as any, (m: any) => {
      const from = room.state.players.get(m.fromId);
      const e: Effect = {
        id: ++UID,
        kind: SKILL_KIND_MAP[m.skillId] ?? "slash",
        fromId: m.fromId,
        fx: from?.pos.x ?? m.tx, fz: from?.pos.z ?? m.tz,
        tx: m.tx, tz: m.tz,
        aoe: m.aoeRadius ?? 0,
        born: performance.now(),
      };
      setEffects((p) => [...p.slice(-20), e]);
    });
    return () => off?.();
  }, [room]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      setEffects((arr) => arr.filter((e) => now - e.born < LIFE));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <group>
      {effects.map((e) => <Fx key={e.id} e={e} />)}
    </group>
  );
}

function Fx({ e }: { e: Effect }) {
  switch (e.kind) {
    case "fire": return <FireBolt e={e} />;
    case "ice":  return <FrostBurst e={e} />;
    case "holy": return <HolyFlash e={e} />;
    case "arrow": return <Arrow e={e} />;
    case "poison": return <PoisonPuff e={e} />;
    case "heal": return <HealAura e={e} />;
    default: return <SlashArc e={e} />;
  }
}

function ageOf(e: Effect) { return Math.min(1, (performance.now() - e.born) / LIFE); }

function FireBolt({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    ref.current.position.set(THREE.MathUtils.lerp(e.fx, e.tx, t), 1.0, THREE.MathUtils.lerp(e.fz, e.tz, t));
    const s = (1 - t) + (t > 0.85 ? (t - 0.85) * 8 : 0); // explode at end
    ref.current.scale.set(s, s, s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.35, 12, 8]} />
      <meshBasicMaterial color="#fb923c" transparent />
    </mesh>
  );
}

function FrostBurst({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  const r = Math.max(e.aoe || 1.5, 1.5);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    const s = t * r * 2;
    ref.current.scale.set(s, s, s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
  });
  return (
    <mesh ref={ref} position={[e.tx, 0.4, e.tz]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.5, 32]} />
      <meshBasicMaterial color="#7dd3fc" transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

function HolyFlash({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    const s = 1 + t * 2;
    ref.current.scale.set(s, s, s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
  });
  return (
    <mesh ref={ref} position={[e.tx, 1.2, e.tz]}>
      <sphereGeometry args={[0.5, 12, 8]} />
      <meshBasicMaterial color="#fde047" transparent />
    </mesh>
  );
}

function Arrow({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    ref.current.position.set(
      THREE.MathUtils.lerp(e.fx, e.tx, t),
      1.0,
      THREE.MathUtils.lerp(e.fz, e.tz, t),
    );
    (ref.current.material as THREE.MeshBasicMaterial).opacity = t < 0.85 ? 1 : 1 - (t - 0.85) * 6;
  });
  const dir = new THREE.Vector3(e.tx - e.fx, 0, e.tz - e.fz);
  const angle = Math.atan2(dir.x, dir.z);
  return (
    <mesh ref={ref} rotation={[0, angle, Math.PI / 2]}>
      <cylinderGeometry args={[0.03, 0.03, 0.6, 5]} />
      <meshBasicMaterial color="#fde68a" transparent />
    </mesh>
  );
}

function PoisonPuff({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    const s = 0.4 + t * 1.5;
    ref.current.scale.set(s, s, s);
    ref.current.position.y = 0.6 + t * 0.6;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.7;
  });
  return (
    <mesh ref={ref} position={[e.tx, 0.6, e.tz]}>
      <sphereGeometry args={[0.4, 8, 6]} />
      <meshBasicMaterial color="#84cc16" transparent />
    </mesh>
  );
}

function HealAura({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    const s = 1 + t * 1.2;
    ref.current.scale.set(s, s, s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
  });
  return (
    <mesh ref={ref} position={[e.fx, 1, e.fz]}>
      <torusGeometry args={[0.6, 0.06, 8, 24]} />
      <meshBasicMaterial color="#34d399" transparent />
    </mesh>
  );
}

function SlashArc({ e }: { e: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = ageOf(e);
    ref.current.rotation.z = -t * Math.PI;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
  });
  return (
    <mesh ref={ref} position={[e.tx, 1, e.tz]}>
      <torusGeometry args={[0.7, 0.06, 6, 12, Math.PI]} />
      <meshBasicMaterial color="#ffffff" transparent />
    </mesh>
  );
}
