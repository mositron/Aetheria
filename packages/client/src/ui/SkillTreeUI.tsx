import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { Player, WorldState, SkillNode } from "@game/shared";
import FocusTrap from "focus-trap-react";
import { SKILL_TREES, JOBS, type JobId } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";

const JOB_COLORS: Record<string, string> = {
  swordsman: "#ef4444",
  mage:      "#3b82f6",
  archer:    "#22c55e",
  acolyte:   "#fbbf24",
  thief:     "#a855f7",
  knight:    "#f97316",
  wizard:    "#8b5cf6",
  sniper:    "#16a34a",
  priest:    "#fbbf24",
  assassin:  "#ec4899",
};

const TIER_LABELS = ["", "Tier 1", "Tier 2", "Tier 3"];

function getUnlockedSkills(p: Player): string[] {
  try { return JSON.parse((p as any).unlockedSkillsJson || "[]"); } catch { return []; }
}

function canUnlock(node: SkillNode, unlocked: string[], skillPoints: number): boolean {
  if (skillPoints < 1) return false;
  if (unlocked.includes(node.skillId)) return false;
  return node.requires.every((r) => unlocked.includes(r));
}

function isUnlocked(node: SkillNode, unlocked: string[]): boolean {
  return unlocked.includes(node.skillId);
}

export function SkillTreeUI({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  useExclusiveModal("skillTree", open, setOpen);
  const t = useT();

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-skilltree", onToggle);
    return () => window.removeEventListener("toggle-skilltree", onToggle);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  const job = me.job as JobId;
  const tree = SKILL_TREES[job] ?? [];
  const unlocked = getUnlockedSkills(me);
  const skillPoints = (me as any).skillPoints ?? 0;
  const jobColor = JOB_COLORS[job] ?? "#6b7280";

  // Group by tier
  const tiers: SkillNode[][] = [[], [], [], []];
  for (const node of tree) {
    if (tiers[node.tier]) tiers[node.tier].push(node);
  }

  return (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[36rem] max-w-[94vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }} onClick={(e) => e.stopPropagation()}>
        <GameFrame
          title={`🌟 ${t('skilltree.title')} — ${JOBS[job]?.name ?? job}`}
          variant="violet"
          className="flex flex-col min-h-0"
          innerClassName="flex flex-col flex-1 min-h-0"
        >
          <button
            onClick={() => setOpen(false)}
            aria-label={t('skilltree.close')}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
          >
            ✕
          </button>

          {/* Header: job color bar + skill points */}
          <div className="flex items-center gap-3 mb-3 p-2 rounded-xl border" style={{ borderColor: `${jobColor}40`, background: `${jobColor}15` }}>
            <div className="text-2xl" style={{ color: jobColor }}>⬡</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">{JOBS[job]?.name ?? job}</div>
              <div className="text-[10px] text-slate-400">{t('skilltree.skillsUnlocked')}: {unlocked.length} / {tree.length}</div>
            </div>
            <div className="text-right">
              <div className="text-amber-300 font-bold text-sm">{t('skilltree.skillPoints')}</div>
              <div className="text-amber-100 text-xs">{skillPoints} {t('skilltree.points')}</div>
            </div>
          </div>

          {/* Skill tree grid */}
          <div className="flex-1 overflow-y-auto game-scroll violet pr-1 space-y-4">
            {[1, 2, 3].map((tier) => {
              const nodes = tiers[tier] ?? [];
              if (nodes.length === 0) return null;
              return (
                <div key={tier}>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{TIER_LABELS[tier]}</div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(...nodes.map(n => n.col + 1))}, 1fr)` }}>
                    {nodes.map((node) => {
                      const unlockedHere = isUnlocked(node, unlocked);
                      const canDo = canUnlock(node, unlocked, skillPoints);
                      return (
                        <div
                          key={node.skillId}
                          className={`relative flex flex-col items-center p-2 rounded-xl border-2 transition-all cursor-pointer ${
                            unlockedHere
                              ? "border-emerald-400 bg-emerald-900/30"
                              : canDo
                              ? "border-amber-400 bg-amber-900/20 hover:bg-amber-900/40"
                              : "border-slate-700 bg-slate-900/40 opacity-50 cursor-not-allowed"
                          }`}
                          onClick={() => {
                            if (!unlockedHere && canDo) {
                              room.send("allocateSkill", { skillId: node.skillId });
                            }
                          }}
                          title={node.requires.length > 0 ? t('skilltree.requires', { reqs: node.requires.join(", ") }) : ""}
                        >
                          {/* Node icon */}
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-lg mb-1"
                            style={{
                              background: unlockedHere ? jobColor : "rgba(255,255,255,0.1)",
                              boxShadow: unlockedHere ? `0 0 12px ${jobColor}80` : undefined,
                            }}
                          >
                            {unlockedHere ? "✓" : "?"}
                          </div>
                          <div className="text-[10px] font-bold text-white text-center leading-tight">{node.nameTh}</div>
                          <div className="text-[9px] text-slate-400 text-center">{node.name}</div>
                          {unlockedHere && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center text-white text-[8px] font-bold">✓</div>
                          )}
                          {!unlockedHere && canDo && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center text-white text-[8px] font-bold">!</div>
                          )}
                          {node.requires.length > 0 && (
                            <div className="text-[8px] text-slate-500 mt-0.5">req: {node.requires.join(", ")}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-slate-400 text-center mt-2 pt-2 border-t border-violet-400/20 flex-shrink-0">
            {t('skilltree.hint')}
          </div>
        </GameFrame>
      </div>
    </div>
    </FocusTrap>
  );
}