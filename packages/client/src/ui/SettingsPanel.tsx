import { useEffect, useState } from "react";
import { getSfxVolume, setSfxVolume, stopAmbient } from "../sfx/sfx";
import { GameFrame } from "./GameFrame";
import { keyEq } from "../utils/keyMatch";
import { useStore } from "../store";
import { useT } from "../locales/useT";

type Settings = {
  ambient: boolean;
  shadows: boolean;
  particles: boolean;
  highQuality: boolean;
};

const DEFAULTS: Settings = { ambient: true, shadows: true, particles: true, highQuality: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem("settings");
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

function save(s: Settings) {
  localStorage.setItem("settings", JSON.stringify(s));
  window.dispatchEvent(new Event("settings-changed"));
}

export function SettingsPanel() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState(getSfxVolume());
  const [settings, setSettings] = useState<Settings>(load());
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "o")) setOpen((o) => !o);
      if (e.key === "Escape" && open) setOpen(false);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", onKey);
    window.addEventListener("toggle-settings", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("toggle-settings", onToggle);
    };
  }, [open]);

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(next);
    if (patch.ambient === false) stopAmbient();
  }

  if (!open) return null;

  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4" onClick={() => setOpen(false)}>
      <div className="w-[22rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
<GameFrame title={t("settings.title")}>
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10 flex items-center justify-center">✕</button>

          <div className="space-y-3 pt-1">
            <Section icon="🔊" label={t("settings.sfxVolume")}>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={1} step={0.05} value={vol}
                  onChange={(e) => { const v = parseFloat(e.target.value); setVol(v); setSfxVolume(v); }}
                  className="flex-1 cursor-pointer"
                />
                <span className="text-xs text-cyan-100 w-10 text-right">{Math.round(vol * 100)}%</span>
              </div>
            </Section>

            <Toggle icon="🎵" label={t("settings.ambientMusic")} value={settings.ambient} onChange={(v) => update({ ambient: v })} desc={t("settings.ambientMusicDesc")} />
            <Toggle icon="🌑" label={t("settings.shadows")} value={settings.shadows} onChange={(v) => update({ shadows: v })} desc={t("settings.shadowsDesc")} />
            <Toggle icon="✨" label={t("settings.particles")} value={settings.particles} onChange={(v) => update({ particles: v })} desc={t("settings.particlesDesc")} />
            <Toggle icon="🖼" label={t("settings.highQuality")} value={settings.highQuality} onChange={(v) => update({ highQuality: v })} desc={t("settings.highQualityDesc")} />

            <Section icon="🌐" label={t("settings.language")}>
              <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-xl border border-cyan-400/20">
                <span className="text-lg">🌐</span>
                <div className="flex-1 text-sm font-bold text-white">{t("settings.language")}</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setLang("th")}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${lang === "th" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300"}`}
                  >
                    {t("settings.langThai")}
                  </button>
                  <button
                    onClick={() => setLang("en")}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${lang === "en" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300"}`}
                  >
                    {t("settings.langEnglish")}
                  </button>
                </div>
              </div>
            </Section>

            <div className="pt-2 border-t border-cyan-400/20 text-[10px] text-slate-400 text-center">
              {t("settings.hint")}
            </div>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}

function Section({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-cyan-300 font-bold mb-1">{icon} {label}</div>
      {children}
    </div>
  );
}

function Toggle({ icon, label, value, desc, onChange }: { icon: string; label: string; value: boolean; desc?: string; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-xl border border-cyan-400/20">
      <span className="text-lg">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-bold text-white">{label}</div>
        {desc && <div className="text-[10px] text-slate-400">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="relative w-12 h-7 rounded-full transition-colors"
        style={{ background: value ? "linear-gradient(90deg, #22d3ee, #0891b2)" : "#475569" }}
      >
        <div
          className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform"
          style={{ transform: value ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

/** Helper hook for other components to read current settings reactively. */
export function useSettings(): Settings {
  const [s, setS] = useState(load());
  useEffect(() => {
    const on = () => setS(load());
    window.addEventListener("settings-changed", on);
    return () => window.removeEventListener("settings-changed", on);
  }, []);
  return s;
}
