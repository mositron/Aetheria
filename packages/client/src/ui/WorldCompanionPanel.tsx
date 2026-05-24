import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import FocusTrap from "focus-trap-react";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";
import type { WorldState } from "@game/shared";

type CompanionKind = "pal_flame" | "pal_grass" | "pal_aqua" | "pal_shock" | "pal_earth";

const COMPANION_KEYS: CompanionKind[] = ["pal_flame", "pal_grass", "pal_aqua", "pal_shock", "pal_earth"];

type CompanionDef = { nameKey: string; emoji: string; roleKey: string; skillDescKey: string; tintHex: string; maxHp: number; atk: number; def: number; speed: number };
const COMPANION_DEFS: Record<CompanionKind, CompanionDef> = {
  pal_flame:  { nameKey: "companion.palFlame",  emoji: "🔥", roleKey: "companion.roleAttacker",  skillDescKey: "companion.palFlameSkill",  tintHex: "#ff6b35", maxHp: 80,  atk: 22, def: 5,  speed: 1.3 },
  pal_grass:  { nameKey: "companion.palGrass",  emoji: "🌿", roleKey: "companion.roleDefender",  skillDescKey: "companion.palGrassSkill",  tintHex: "#52b788", maxHp: 140, atk: 12, def: 18, speed: 0.8 },
  pal_aqua:   { nameKey: "companion.palAqua",   emoji: "💧", roleKey: "companion.roleSupport",   skillDescKey: "companion.palAquaSkill",   tintHex: "#4cc9f0", maxHp: 100, atk: 10, def: 10, speed: 1.1 },
  pal_shock:  { nameKey: "companion.palShock",  emoji: "⚡", roleKey: "companion.roleAttacker",  skillDescKey: "companion.palShockSkill",  tintHex: "#f9c74f", maxHp: 70,  atk: 28, def: 3,  speed: 1.6 },
  pal_earth:  { nameKey: "companion.palEarth", emoji: "🪨", roleKey: "companion.roleDefender",  skillDescKey: "companion.palEarthSkill",  tintHex: "#bc6c25", maxHp: 180, atk: 8,  def: 25, speed: 0.6 },
};

type WorldRoomState = {
  companions: Map<string, { ownerId: string; kind: string }>;
};

type Props = { room: Room<any> };

/** Visit panel: warp to another player's house */
function VisitPanel({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [targetName, setTargetName] = useState("");

  return (
    <div className="space-y-2">
      <div className="text-xs text-cyan-100 font-bold uppercase tracking-wider mb-1">🚪 {t("companion.visitHouse")}</div>
      <div className="flex gap-1">
        <input
          value={targetName}
          onChange={(e) => setTargetName(e.target.value)}
          placeholder={t("companion.playerName")}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
          onKeyDown={(e) => {
            if (e.key === "Enter" && targetName.trim()) {
              room.send("visitHouse", { ownerName: targetName.trim() });
            }
          }}
        />
        <button
          onClick={() => { if (targetName.trim()) room.send("visitHouse", { ownerName: targetName.trim() }); }}
          className="px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-cyan-100 text-xs font-bold"
        >
          {t("companion.go")}
        </button>
      </div>
      <div className="text-[10px] text-slate-400">{t("companion.mustBeSameMap")}</div>
    </div>
  );
}

export function WorldCompanionPanel({ room }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useExclusiveModal("worldCompanion", open, setOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Toggle via custom event so HUD/bottom-bar can open it
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-companions", onToggle);
    return () => window.removeEventListener("toggle-companions", onToggle);
  }, []);

  if (!open) return null;

  const companions = (room.state as unknown as WorldRoomState).companions;
  const mySid = room.sessionId;
  const me = room.state.players.get(room.sessionId);

  return (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
      <div
        data-no-screen-joy
        role="dialog"
        aria-modal="true"
        aria-label={t("companion.title")}
        className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4"
        onClick={() => setOpen(false)}
      >
        <div
          className="w-[22rem] max-w-[92vw] flex flex-col min-h-0"
          style={{ maxHeight: "calc(100vh - 8rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <GameFrame
            title={t("companion.title")}
            className="flex flex-col min-h-0"
            innerClassName="flex flex-col flex-1 min-h-0"
          >
          <button
            onClick={() => setOpen(false)}
            aria-label={t("companion.close")}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
          >
            ✕
          </button>

          {/* Visit house panel */}
          <div className="mb-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-700">
            <VisitPanel room={room as Room<WorldState>} />
          </div>

          {/* House open/close toggle */}
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="text-xs text-slate-300">🔒 {t("companion.openToVisitors")}:</span>
            <button
              onClick={() => room.send("toggleHouseOpen")}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${me?.houseOpen ? "bg-green-600" : "bg-slate-600"}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${me?.houseOpen ? "translate-x-4" : "translate-x-1"}`}
              />
            </button>
            <span className={`text-[10px] font-bold ${me?.houseOpen ? "text-green-400" : "text-slate-500"}`}>
              {me?.houseOpen ? t("companion.open") : t("companion.closed")}
            </span>
          </div>

          <div className="space-y-2.5 pt-1 overflow-y-auto game-scroll flex-1 pr-1" style={{ minHeight: 0 }}>
            {COMPANION_KEYS.map((kind) => {
              const def = COMPANION_DEFS[kind];
              const isSummoned = Array.from(companions?.values() ?? []).some(
                (c) => c.ownerId === mySid && c.kind === kind
              );

              return (
                <div
                  key={kind}
                  className="flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: isSummoned ? def.tintHex + "80" : "rgba(75,85,99,0.5)",
                    backgroundColor: isSummoned ? def.tintHex + "18" : "rgba(15,23,42,0.6)",
                  }}
                >
                  {/* Emoji icon */}
                  <div
                    className="text-3xl w-12 h-12 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: def.tintHex + "30" }}
                  >
                    {def.emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{t(def.nameKey)}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider"
                        style={{
                          borderColor: def.tintHex + "80",
                          color: def.tintHex,
                          backgroundColor: def.tintHex + "20",
                        }}
                      >
                        {t(def.roleKey)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{t(def.skillDescKey)}</div>
                    <div className="flex gap-3 mt-1 text-[10px] text-slate-300">
                      <span>❤️ {def.maxHp}</span>
                      <span>⚔️ {def.atk}</span>
                      <span>🛡 {def.def}</span>
                      <span>⚡ {def.speed}x</span>
                    </div>
                  </div>

                  {/* Action button */}
                  {isSummoned ? (
                    <button
                      onClick={() => room.send("recall_companion", { companionId: kind })}
                      className="w-16 h-9 rounded-lg text-xs font-bold border-2 border-amber-500/60 bg-amber-600/30 text-amber-200 hover:bg-amber-500/50 hover:border-amber-400 transition"
                    >
                      {t("companion.recall")}
                    </button>
                  ) : (
                    <button
                      onClick={() => room.send("summon_companion", { companionId: kind })}
                      className="w-16 h-9 rounded-lg text-xs font-bold border-2 border-cyan-500/60 bg-cyan-600/30 text-cyan-100 hover:bg-cyan-500/50 hover:border-cyan-400 transition"
                    >
                      {t("companion.summon")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-slate-500 text-center mt-2">
            {t("companion.hint")}
          </div>
        </GameFrame>
        </div>
      </div>
    </FocusTrap>
  );
}