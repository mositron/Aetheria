/**
 * WorldCreate — modal for creating a new server-hosted world.
 */
import { useState } from "react";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";

interface Props {
  onCreated: (worldId: string, inviteCode: string) => void;
  onClose: () => void;
}

const TEMPLATE_IDS = ["forest", "desert", "mountain", "island"] as const;
const MODE_IDS = ["adventure", "co-op", "pvp"] as const;
const PRIVACY_IDS = ["private", "friends", "public"] as const;
const MAX_PLAYERS_OPTIONS = [4, 8, 16, 32];

const TEMPLATE_COLORS: Record<string, string> = {
  forest: "emerald",
  desert: "amber",
  mountain: "slate",
  island: "cyan",
};

const MODE_ICONS: Record<string, string> = {
  adventure: "🗺️",
  "co-op": "🤝",
  pvp: "⚔️",
};

export function WorldCreate({ onCreated, onClose }: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<string>("forest");
  const [mode, setMode] = useState<string>("adventure");
  const [privacy, setPrivacy] = useState<string>("private");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t('worldCreate.error.nameRequired')); return; }
    if (trimmed.length > 32) { setError(t('worldCreate.error.nameTooLong')); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/worlds/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, template, mode, privacy, maxPlayers }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t('confirm.error')); return; }
      onCreated(data.worldId, data.inviteCode);
    } catch {
      setError(t('worldCreate.error.serverConnection'));
    } finally {
      setSubmitting(false);
    }
  };

  const colorMap: Record<string, string> = {
    emerald: "border-emerald-500 bg-emerald-900/20 hover:bg-emerald-900/30",
    amber: "border-amber-500 bg-amber-900/20 hover:bg-amber-900/30",
    slate: "border-slate-400 bg-slate-800/40 hover:bg-slate-800/60",
    cyan: "border-cyan-500 bg-cyan-900/20 hover:bg-cyan-900/30",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm py-8 px-4"
      onClick={onClose}
    >
      <div
        className="w-[36rem] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <GameFrame
          title={t('worldCreate.title')}
          className="flex flex-col gap-4"
          innerClassName="flex flex-col gap-4"
        >
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
          >
            ✕
          </button>

          {/* World name */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1.5 block">{t('worldCreate.worldName')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder={t('worldCreate.worldNamePlaceholder')}
              className="w-full bg-slate-900/70 border border-slate-500 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Template */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">{t('worldCreate.terrain')}</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setTemplate(id)}
                  className={`border-2 rounded-lg p-3 text-left transition ${template === id ? `${colorMap[TEMPLATE_COLORS[id]]} ring-2 ring-offset-1 ring-offset-slate-900` : "border-slate-700 bg-slate-900/40 hover:border-slate-500"}`}
                >
                  <div className="text-sm font-bold text-white mb-0.5">{t(`worldCreate.terrain.${id}`)}</div>
                  <div className="text-[11px] text-slate-400">{t(`worldCreate.terrain.${id}Desc`)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">{t('worldCreate.mode')}</label>
            <div className="flex gap-2">
              {MODE_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex-1 border-2 rounded-lg py-2 text-center text-sm font-bold transition ${mode === id ? "border-cyan-500 bg-cyan-900/30 text-cyan-100" : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500"}`}
                >
                  {MODE_ICONS[id]} {t(`worldCreate.mode.${id}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Privacy */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">{t('worldCreate.privacy')}</label>
            <div className="flex gap-2">
              {PRIVACY_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setPrivacy(id)}
                  className={`flex-1 border-2 rounded-lg py-2 text-center transition ${privacy === id ? "border-cyan-500 bg-cyan-900/30 text-cyan-100" : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500"}`}
                >
                  <div className="text-xs font-bold">{t(`worldCreate.privacy.${id}`)}</div>
                  <div className="text-[10px] opacity-70">{t(`worldCreate.privacy.${id}Desc`)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Max players */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">{t('worldCreate.playerCount')}</label>
            <div className="flex gap-2">
              {MAX_PLAYERS_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 border-2 rounded-lg py-2 text-center text-sm font-bold transition ${maxPlayers === n ? "border-cyan-500 bg-cyan-900/30 text-cyan-100" : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-rose-400 text-sm font-bold text-center">{error}</div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-b from-cyan-600 to-cyan-800 hover:from-cyan-500 hover:to-cyan-700 text-white border border-cyan-400/50 transition disabled:opacity-50"
          >
            {submitting ? t('worldCreate.creating') : t('worldCreate.createWorld')}
          </button>
        </GameFrame>
      </div>
    </div>
  );
}