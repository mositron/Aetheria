import { useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import {
  DEFAULT_APPEARANCE, HAIR_STYLES, BODY_SHAPES,
  SKIN_PRESETS, HAIR_PRESETS, EYE_PRESETS, SHIRT_PRESETS, PANTS_PRESETS,
  HAT_STYLES, GLASSES_STYLES, SCARF_STYLES, ACC_COLOR_PRESETS,
  type Appearance,
} from "@game/shared";
import { useStore, type CharacterSummary } from "../store";
import { HeroModel } from "../scene/models/HeroModel";
import { MenuScene } from "./MenuScene";
import { GameFrame } from "./GameFrame";

type Props = {
  onCancel: () => void;
  onCreated: (c: CharacterSummary) => void;
};

export function CharacterCreator({ onCancel, onCreated }: Props) {
  const token = useStore((s) => s.token);
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState<Appearance>({ ...DEFAULT_APPEARANCE });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function patch(p: Partial<Appearance>) {
    setAppearance((a) => ({ ...a, ...p }));
  }

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/auth/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), job: "novice", appearance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      onCreated(data.character);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full h-full relative overflow-hidden text-white">
      {/* Shared 3D backdrop */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 2, 5], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
          <MenuScene variant="dawn" />
          <Rotating>
            <group position={[0, -1, 0]}>
              <HeroModel
                bodyColor={appearance.shirt}
                appearance={appearance}
                isMoving={() => false}
                isAttacking={() => false}
                isCasting={() => false}
                isDead={() => false}
                hasWeapon={() => false}
              />
            </group>
          </Rotating>
          <mesh position={[0, -1.05, 0]}>
            <cylinderGeometry args={[1.1, 1.2, 0.1, 8]} />
            <meshStandardMaterial color="#1e293b" flatShading />
          </mesh>
        </Canvas>
      </div>

      {/* vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)]" />

      {/* Title banner top */}
      <div className="absolute top-6 left-0 right-0 text-center pointer-events-none">
        <div className="text-xs text-amber-300/80 uppercase tracking-[0.4em]">⚒ Forge of Heroes ⚒</div>
        <h1 className="text-3xl font-black tracking-wider bg-gradient-to-b from-amber-100 to-amber-400 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]">
          สร้างผู้กล้า
        </h1>
      </div>

      {/* Right: customization frame */}
      <div className="absolute top-20 right-6 bottom-6 w-[26rem] overflow-y-auto pr-1">
        <GameFrame title="แต่งกายผู้กล้า" variant="violet">
          <div className="space-y-4 pt-1">
            <div>
              <div className="game-label">✦ ชื่อ</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                className="game-input"
                placeholder="ตั้งชื่อ (2-16 ตัวอักษร)"
              />
            </div>

            <Section label="✂ ทรงผม">
              <div className="grid grid-cols-3 gap-1.5">
                {HAIR_STYLES.map((s) => (
                  <Chip key={s} active={appearance.hairStyle === s} onClick={() => patch({ hairStyle: s })}>
                    {HAIR_STYLE_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label="⚔ รูปร่าง">
              <div className="grid grid-cols-3 gap-1.5">
                {BODY_SHAPES.map((s) => (
                  <Chip key={s} active={appearance.body === s} onClick={() => patch({ body: s })}>
                    {BODY_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label="◉ สีผิว">
              <Swatches options={SKIN_PRESETS} value={appearance.skin} onChange={(c) => patch({ skin: c })} />
            </Section>
            <Section label="◉ สีผม">
              <Swatches options={HAIR_PRESETS} value={appearance.hair} onChange={(c) => patch({ hair: c })} />
            </Section>
            <Section label="◉ สีตา">
              <Swatches options={EYE_PRESETS} value={appearance.eye} onChange={(c) => patch({ eye: c })} />
            </Section>
            <Section label="◉ สีเสื้อ">
              <Swatches options={SHIRT_PRESETS} value={appearance.shirt} onChange={(c) => patch({ shirt: c })} />
            </Section>
            <Section label="◉ สีกางเกง">
              <Swatches options={PANTS_PRESETS} value={appearance.pants} onChange={(c) => patch({ pants: c })} />
            </Section>

            <Section label="🎩 หมวก">
              <div className="grid grid-cols-5 gap-1">
                {HAT_STYLES.map((s) => (
                  <Chip key={s} active={appearance.hat === s} onClick={() => patch({ hat: s })}>
                    {s === "none" ? "✕" : s === "cap" ? "🧢" : s === "wizard" ? "🎩" : s === "crown" ? "👑" : "🎀"}
                  </Chip>
                ))}
              </div>
              {appearance.hat && appearance.hat !== "none" && (
                <div className="mt-1.5">
                  <Swatches options={ACC_COLOR_PRESETS} value={appearance.hatColor ?? "#fbbf24"} onChange={(c) => patch({ hatColor: c })} />
                </div>
              )}
            </Section>

            <Section label="👓 แว่นตา">
              <div className="grid grid-cols-3 gap-1">
                {GLASSES_STYLES.map((s) => (
                  <Chip key={s} active={appearance.glasses === s} onClick={() => patch({ glasses: s })}>
                    {s === "none" ? "✕" : s === "round" ? "🤓" : "😎"}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label="🧣 ผ้าพันคอ">
              <div className="grid grid-cols-3 gap-1">
                {SCARF_STYLES.map((s) => (
                  <Chip key={s} active={appearance.scarf === s} onClick={() => patch({ scarf: s })}>
                    {s === "none" ? "✕" : s === "regular" ? "🧣" : "🧣🧣"}
                  </Chip>
                ))}
              </div>
              {appearance.scarf && appearance.scarf !== "none" && (
                <div className="mt-1.5">
                  <Swatches options={ACC_COLOR_PRESETS} value={appearance.scarfColor ?? "#f472b6"} onChange={(c) => patch({ scarfColor: c })} />
                </div>
              )}
            </Section>

            {err && (
              <div className="text-rose-300 text-sm border-l-2 border-rose-400 pl-2 bg-rose-900/30 py-1">
                ⚠ {err}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={onCancel} disabled={busy} className="btn-game muted flex-1">ยกเลิก</button>
              <button onClick={submit} disabled={busy || name.trim().length < 2} className="btn-game violet flex-1">
                {busy ? "…" : "✦ สร้าง"}
              </button>
            </div>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}

const HAIR_STYLE_LABEL: Record<string, string> = {
  short: "สั้น", long: "ยาว", ponytail: "หางม้า", spiky: "ตั้ง", bun: "มวย", bald: "หัวล้าน",
};
const BODY_LABEL: Record<string, string> = {
  slim: "ผอม", normal: "ปกติ", wide: "ใหญ่",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="game-label">{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs py-2 border-2 transition uppercase tracking-wider ${
        active
          ? "border-violet-400 bg-violet-500/25 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]"
          : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-violet-400/50"
      }`}
    >
      {children}
    </button>
  );
}

function Swatches({ options, value, onChange }: { options: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-8 h-8 border-2 transition ${
            value === c
              ? "border-violet-300 scale-110 shadow-[0_0_10px_rgba(168,85,247,0.7)]"
              : "border-slate-700 hover:border-violet-400/60"
          }`}
          style={{ background: c }}
          title={c}
        />
      ))}
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
