/**
 * World Lobby — browser-accessible world browser + creation entry point.
 * Shown when the player clicks "My Worlds" in the main menu.
 *
 * Shows:
 * - Player's own worlds (host badge)
 * - Public worlds they can join
 * - "Create New World" → WorldCreate
 * - Invite-code join shortcut
 */
import { useEffect, useState } from "react";
import { GameFrame } from "./GameFrame";
import { WorldCreate } from "./WorldCreate";
import { useT } from "../locales/useT";

interface WorldMeta {
  id: string;
  hostName: string;
  template: string;
  mode: string;
  playerCount: number;
  maxPlayers: number;
  inviteCode: string;
  status: string;
  createdAt: number;
}

interface Props {
  /** Called when the player chooses a world to join */
  onJoin: (worldId: string, inviteCode: string) => void;
  onClose: () => void;
}

export function WorldLobby({ onJoin, onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<"browse" | "create">("browse");
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchWorlds = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/worlds");
      if (res.ok) {
        const data = await res.json();
        setWorlds(data.worlds ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorlds();
    const id = setInterval(fetchWorlds, 10_000);
    return () => clearInterval(id);
  }, []);

  const joinByCode = () => {
    if (!codeInput.trim()) return;
    onJoin("", codeInput.trim().toUpperCase());
  };

  const templateLabel: Record<string, string> = {
    forest: "🌲 " + t('world.template.forest'),
    desert: "🏜️ " + t('world.template.desert'),
    mountain: "⛰️ " + t('world.template.mountain'),
    island: "🏝️ " + t('world.template.island'),
  };

  const statusBadge: Record<string, string> = {
    open: "bg-emerald/30 text-emerald-300 border-emerald/50",
    playing: "bg-blue/30 text-blue-300 border-blue/50",
    closed: "bg-slate/30 text-slate-400 border-slate/50",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-8 px-4"
    >
      <div className="w-[52rem] max-w-[95vw] max-h-[88vh] flex flex-col">
        <GameFrame
          title={t('worldLobby.title')}
          className="flex flex-col min-h-0 flex-1"
          innerClassName="flex flex-col flex-1 min-h-0"
        >
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={onClose}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
            >
              ✕
            </button>
            <button
              onClick={() => setTab("browse")}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border-2 transition ${tab === "browse" ? "bg-cyan-600 border-cyan-400 text-white" : "bg-slate-900/50 border-slate-600 text-slate-300 hover:border-cyan-500"}`}
            >
              {t('worldLobby.explore')}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-1.5 rounded-full text-sm font-bold border-2 transition border-amber-500 bg-amber-600/20 text-amber-300 hover:bg-amber-600/40"
            >
              + {t('worldLobby.createNew')}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinByCode()}
                placeholder={t('worldLobby.inviteCodePlaceholder')}
                maxLength={8}
                className="bg-slate-900/70 border border-slate-500 rounded px-3 py-1.5 text-sm text-cyan-100 placeholder-slate-500 font-mono w-32 focus:border-cyan-400 focus:outline-none"
              />
              <button
                onClick={joinByCode}
                className="px-3 py-1.5 rounded text-sm font-bold bg-cyan-700 hover:bg-cyan-600 text-cyan-100 border border-cyan-500 transition"
              >
                {t('world.join')}
              </button>
            </div>
          </div>

          {/* World grid */}
          <div className="flex-1 overflow-y-auto game-scroll pr-1">
            {loading && worlds.length === 0 && (
              <div className="text-center py-12 text-slate-400">{t('world.loading')}</div>
            )}
            {!loading && worlds.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                {t('world.noPublicWorlds')}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 pb-2">
              {worlds.map((w) => (
                <div
                  key={w.id}
                  className="border border-slate-600 rounded-xl p-3 bg-slate-900/60 hover:border-cyan-500 transition cursor-pointer"
                  onClick={() => onJoin(w.id, "")}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-2xl">{templateLabel[w.template] ?? "🌍"}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${statusBadge[w.status] ?? statusBadge.closed}`}>
                      {w.status}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white mb-0.5 truncate">{w.hostName} {t('world.hostPlaying')}</div>
                  <div className="text-xs text-slate-400 mb-2">{w.mode === "co-op" ? t('world.coop') : w.mode === "pvp" ? t('world.pvp') : t('world.adventure')} · {w.template}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cyan-300">{w.playerCount}/{w.maxPlayers} {t('world.players')}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(w.inviteCode); }}
                      className="text-[10px] text-slate-500 hover:text-cyan-300 font-mono transition"
                      title={t('worldLobby.copyInviteCode')}
                    >
                      {w.inviteCode}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GameFrame>
      </div>

      {showCreate && (
        <WorldCreate
          onCreated={(worldId, code) => {
            setShowCreate(false);
            onJoin(worldId, code);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}