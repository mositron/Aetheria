import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { parseAppearance, type Appearance } from "@game/shared";
import { useStore, type CharacterSummary } from "../store";
import { HeroModel } from "../scene/models/HeroModel";
import { CharacterCreator } from "./CharacterCreator";
import { MenuScene } from "./MenuScene";
import { GameFrame } from "./GameFrame";

const MAX = 3;

export function CharacterSelect() {
  const { token, username, characters, setCharacters, selectCharacter, logout } = useStore();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(characters?.[0]?.id ?? null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/characters", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.characters)) {
          setCharacters(d.characters);
          if (d.characters.length > 0 && !selectedId) setSelectedId(d.characters[0].id);
        }
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (creating) {
    return (
      <CharacterCreator
        onCancel={() => setCreating(false)}
        onCreated={(c) => {
          setCharacters([...(characters ?? []), c]);
          setSelectedId(c.id);
          setCreating(false);
        }}
      />
    );
  }

  const list = characters ?? [];
  const selected = list.find((c) => c.id === selectedId) ?? null;

  async function onDelete(id: string) {
    if (!confirm("ลบตัวละครนี้? ข้อมูลจะหายถาวร")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/auth/characters/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "delete failed");
      }
      const nextList = list.filter((c) => c.id !== id);
      setCharacters(nextList);
      if (selectedId === id) setSelectedId(nextList[0]?.id ?? null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onPlay() {
    if (!selectedId) return;
    selectCharacter(selectedId);
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* 3D backdrop with character preview */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 2, 6], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
          <MenuScene variant="twilight" />
          {selected && (
            <Rotating>
              <group position={[0, -1, 0]}>
                <HeroModel
                  key={selected.id}
                  bodyColor={parseAppearance(selected.appearance).shirt}
                  appearance={parseAppearance(selected.appearance)}
                  isMoving={() => false}
                  isAttacking={() => false}
                  isCasting={() => false}
                  isDead={() => false}
                  hasWeapon={() => false}
                />
              </group>
            </Rotating>
          )}
          {/* runestone pedestal */}
          <Pedestal />
        </Canvas>
      </div>

      {/* vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65)_100%)]" />

      {/* title banner */}
      <div className="absolute top-6 left-0 right-0 text-center pointer-events-none">
        <div className="text-xs text-cyan-300/70 uppercase tracking-[0.4em]">เลือกผู้กล้า</div>
        <h1 className="text-3xl font-black tracking-wider bg-gradient-to-b from-white to-cyan-300 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">
          {username}
        </h1>
      </div>

      {/* Left: character list */}
      <div className="absolute top-28 left-6 bottom-28 w-80">
        <GameFrame title={`ตัวละคร · ${list.length}/${MAX}`} className="h-full flex flex-col">
          <div className="flex flex-col gap-2 overflow-y-auto pt-1 pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {Array.from({ length: MAX }).map((_, i) => {
              const c = list[i];
              if (!c) {
                return (
                  <button
                    key={`empty-${i}`}
                    onClick={() => setCreating(true)}
                    className="w-full h-20 border-2 border-dashed border-cyan-400/30 hover:border-cyan-300 hover:bg-cyan-400/10 transition flex items-center justify-center text-cyan-300/70 group"
                  >
                    <span className="text-3xl mr-2 group-hover:scale-110 transition">＋</span>
                    <span className="text-xs uppercase tracking-widest">สร้างผู้กล้า</span>
                  </button>
                );
              }
              const isSel = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 transition border-2 relative ${
                    isSel
                      ? "border-cyan-400 bg-cyan-500/15 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
                      : "border-slate-700 bg-slate-900/60 hover:border-cyan-400/50"
                  }`}
                >
                  {isSel && <span className="absolute -left-1 top-1/2 -translate-y-1/2 text-cyan-300">▶</span>}
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 border border-white/30"
                      style={{ background: parseAppearance(c.appearance).shirt }}
                    />
                    <div className="font-bold text-white truncate flex-1 uppercase tracking-wider text-sm">{c.name}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs">
                    <span className="text-amber-300 font-bold">Lv {c.level}</span>
                    <span className="text-cyan-300">⚔ {c.job}</span>
                    <span className="text-slate-400 text-[10px] ml-auto">📍 {c.mapId}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </GameFrame>
      </div>

      {/* Right: details */}
      {selected && (
        <div className="absolute top-28 right-6 w-72">
          <GameFrame title={selected.name} variant="violet">
            <div className="space-y-2.5 pt-1">
              <DetailRow label="อาชีพ" value={selected.job} accent="text-amber-300" icon="⚔" />
              <DetailRow label="เลเวล" value={`Lv ${selected.level}`} accent="text-cyan-300" icon="✦" />
              <DetailRow label="แผนที่" value={selected.mapId} accent="text-emerald-300" icon="📍" />
            </div>
          </GameFrame>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center">
        <GameFrame>
          <div className="flex items-center gap-3 px-2">
            {err && <div className="text-rose-300 text-sm">⚠ {err}</div>}
            <button onClick={logout} className="btn-game muted text-xs">⏻ ออก</button>
            {selected && (
              <button disabled={busy} onClick={() => onDelete(selected.id)} className="btn-game danger">
                🗑 ลบ
              </button>
            )}
            <button disabled={!selected || busy} onClick={onPlay} className="btn-game text-lg px-12">
              ▶ เข้าเกม
            </button>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon?: string }) {
  return (
    <div className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2 last:border-b-0">
      <span className="text-slate-400 text-xs uppercase tracking-wider">
        {icon && <span className="mr-1.5 text-violet-300">{icon}</span>}
        {label}
      </span>
      <span className={`font-bold uppercase tracking-wider ${accent ?? "text-white"}`}>{value}</span>
    </div>
  );
}

function Rotating({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return <group ref={ref}>{children}</group>;
}

function Pedestal() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.15;
  });
  return (
    <group position={[0, -1.05, 0]}>
      {/* main slab */}
      <mesh>
        <cylinderGeometry args={[1.2, 1.4, 0.18, 8]} />
        <meshStandardMaterial color="#1c1740" flatShading />
      </mesh>
      {/* glowing ring */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.5, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* runic ring (rotates) */}
      <group ref={ref}>
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.6, 0.05, Math.sin(a) * 1.6]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.18, 0.4, 0.08]} />
              <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.8} />
            </mesh>
          );
        })}
      </group>
      <pointLight position={[0, 0.8, 0]} color="#22d3ee" intensity={1.2} distance={6} />
    </group>
  );
}

export type { CharacterSummary };
