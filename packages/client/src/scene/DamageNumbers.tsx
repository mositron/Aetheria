import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

type Popup = {
  id: number;
  x: number; y: number; z: number;
  text: string;
  color: string;
  born: number;
  kind: "normal" | "crit" | "miss" | "heal" | "self";
};

const LIFE = 900;
let UID = 0;

export function DamageNumbers({ room }: { room: Room<WorldState> }) {
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupsRef = useRef(popups);
  popupsRef.current = popups;

  useEffect(() => {
    const off = room.onMessage("damage", (m: any) => {
      const target = room.state.players.get(m.targetId) ?? room.state.monsters.get(m.targetId);
      if (!target) return;
      const isSelf = m.targetId === room.sessionId;
      const isCrit = !!m.crit;
      const isMiss = m.amount === 0;
      const isHeal = !!m.heal;
      const kind: Popup["kind"] = isHeal ? "heal" : isMiss ? "miss" : isSelf ? "self" : isCrit ? "crit" : "normal";
      const color =
        kind === "heal" ? "#34d399" :
        kind === "miss" ? "#9ca3af" :
        kind === "crit" ? "#fbbf24" :
        kind === "self" ? "#ef4444" :
        "#ffffff";
      const text =
        isHeal ? `+${m.amount}` :
        isMiss ? "MISS" :
        isCrit ? `CRIT! ${m.amount}` :
        String(m.amount);
      const id = ++UID;
      const next: Popup = {
        id,
        x: target.pos.x + (Math.random() - 0.5) * 0.4,
        y: 1.6,
        z: target.pos.z,
        text, color, kind,
        born: performance.now(),
      };
      setPopups((p) => [...p.slice(-30), next]);
    });
    return () => off?.();
  }, [room]);

  // GC expired popups
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      setPopups((p) => p.filter((x) => now - x.born < LIFE));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <group>
      {popups.map((p) => (
        <Pop key={p.id} p={p} />
      ))}
    </group>
  );
}

function Pop({ p }: { p: Popup }) {
  const ref = useRef<THREE.Sprite>(null);
  const tex = useMemo(() => makeText(p.text, p.color, p.kind === "crit"), [p.text, p.color, p.kind]);
  // Dispose the canvas texture when this popup unmounts — otherwise each unique
  // damage number leaks a GPU texture for the whole session.
  useEffect(() => () => { tex.dispose(); }, [tex]);
  useFrame(() => {
    if (!ref.current) return;
    const age = (performance.now() - p.born) / LIFE;
    // bouncy arc — fast up then slight bob
    const arcY = age < 0.5 ? Math.sin(age * Math.PI) * 1.4 : 1.4 + (age - 0.5) * 0.6;
    const driftX = Math.sin(age * 6) * 0.1;
    ref.current.position.set(p.x + driftX, p.y + arcY, p.z);
    const mat = ref.current.material as THREE.SpriteMaterial;
    mat.opacity = age < 0.7 ? 1 : Math.max(0, 1 - (age - 0.7) / 0.3);
    // squish-pop scale: big pop then settle, extra wobble for crit
    const popScale = age < 0.15 ? 0.4 + age / 0.15 * 0.9 : 1.2 + Math.sin(age * 10) * 0.06;
    const s =
      p.kind === "crit" ? popScale * 2.0 :       // crit = 2x — feel the impact
      p.kind === "heal" ? popScale * 1.1 :       // gentle bigger for healing
      p.kind === "miss" ? popScale * 0.85 :      // smaller to de-emphasize
      popScale;
    ref.current.scale.set(1.6 * s, 0.5 * s, 1);
  });
  return (
    <sprite ref={ref}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  );
}

function makeText(text: string, color: string, bold: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = `${bold ? "900" : "bold"} ${bold ? 38 : 30}px sans-serif`;
  ctx.fillStyle = color;
  ctx.strokeStyle = "black";
  ctx.lineWidth = 5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(text, 128, 32);
  ctx.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(canvas);
  t.needsUpdate = true;
  return t;
}
