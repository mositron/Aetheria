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
import { useT } from "../locales/useT";

type Props = {
  onCancel: () => void;
  onCreated: (c: CharacterSummary) => void;
};

export function CharacterCreator({ onCancel, onCreated }: Props) {
  const t = useT();
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
      const res = await fetch("/api/auth/characters", {
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
      <div className="absolute top-4 sm:top-6 left-0 right-0 text-center pointer-events-none px-2">
        <div className="text-[9px] sm:text-xs text-amber-300/80 uppercase tracking-[0.4em]">⚒ Forge of Heroes ⚒</div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-b from-amber-100 to-amber-400 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]">
          {t("char.createTitle")}
        </h1>
      </div>

      {/* Right: customization frame — full-width on mobile */}
      <div className="absolute top-20 sm:top-24 right-0 sm:right-6 bottom-4 w-full sm:w-[26rem] overflow-y-auto px-4 sm:px-0 pr-4 sm:pr-1">
        <GameFrame title={t("char.customizeTitle")} variant="violet">
          <div className="space-y-3 sm:space-y-4 pt-1">
            <div>
              <div className="game-label">{t("char.name")}</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                className="game-input"
                placeholder={t("char.namePlaceholder")}
              />
            </div>

            <Section label={t("char.hairStyle")}>
              <div className="grid grid-cols-3 gap-1.5">
                {HAIR_STYLES.map((s) => (
                  <Chip key={s} active={appearance.hairStyle === s} onClick={() => patch({ hairStyle: s })}>
                    {t(`char.hair${s.charAt(0).toUpperCase() + s.slice(1)}` as any) ?? HAIR_STYLE_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label={t("char.bodyShape")}>
              <div className="grid grid-cols-3 gap-1.5">
                {BODY_SHAPES.map((s) => (
                  <Chip key={s} active={appearance.body === s} onClick={() => patch({ body: s })}>
                    {t(`char.body${s.charAt(0).toUpperCase() + s.slice(1)}` as any) ?? BODY_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label={t("char.skinColor")}>
              <Swatches options={SKIN_PRESETS} value={appearance.skin} onChange={(c) => patch({ skin: c })} />
            </Section>
            <Section label={t("char.hairColor")}>
              <Swatches options={HAIR_PRESETS} value={appearance.hair} onChange={(c) => patch({ hair: c })} />
            </Section>
            <Section label={t("char.eyeColor")}>
              <Swatches options={EYE_PRESETS} value={appearance.eye} onChange={(c) => patch({ eye: c })} />
            </Section>
            <Section label={t("char.shirtColor")}>
              <Swatches options={SHIRT_PRESETS} value={appearance.shirt} onChange={(c) => patch({ shirt: c })} />
            </Section>
            <Section label={t("char.pantsColor")}>
              <Swatches options={PANTS_PRESETS} value={appearance.pants} onChange={(c) => patch({ pants: c })} />
            </Section>

            <Section label={t("char.hat")}>
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

            <Section label={t("char.glasses")}>
              <div className="grid grid-cols-3 gap-1">
                {GLASSES_STYLES.map((s) => (
                  <Chip key={s} active={appearance.glasses === s} onClick={() => patch({ glasses: s })}>
                    {s === "none" ? "✕" : s === "round" ? "🤓" : "😎"}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label={t("char.scarf")}>
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
              <button onClick={onCancel} disabled={busy} className="btn-game muted flex-1 text-xs sm:text-sm">{t("char.cancel")}</button>
              <button onClick={submit} disabled={busy || name.trim().length < 2} className="btn-game violet flex-1 text-xs sm:text-sm">
                {busy ? "…" : t("char.create")}
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
      className={`text-[10px] sm:text-xs py-2 border-2 transition uppercase tracking-wider ${
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
