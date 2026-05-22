import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import FocusTrap from "focus-trap-react";
import { ACHIEVEMENTS, type WorldState, type Player } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { ConfirmDialog } from "./ConfirmDialog";
import { useT } from "../locales/useT";

export function AchievementsPanel({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [bannerAchievement, setBannerAchievement] = useState<typeof ACHIEVEMENTS[number] | null>(null);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-achievements", onToggle);
    return () => window.removeEventListener("toggle-achievements", onToggle);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.achievementUnlocked) {
        const ach = ACHIEVEMENTS.find((a) => a.id === msg.achievementUnlocked);
        if (ach) {
          setBannerAchievement(ach);
          setTimeout(() => setBannerAchievement(null), 5000);
        }
      }
    };
    room.onMessage("system", handler);
    return () => { room.onMessage("system", handler); };
  }, [room]);

  if (!open) return null;
  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  let prog: { counters: Record<string, number>; unlocked: string[] };
  try { prog = JSON.parse(me.achievementsJson || "{}"); } catch { prog = { counters: {}, unlocked: [] }; }
  prog.counters ??= {};
  prog.unlocked ??= [];

  const unlockedCount = prog.unlocked.length;
  const total = ACHIEVEMENTS.length;
  const titles = ACHIEVEMENTS.filter((a) => a.title && prog.unlocked.includes(a.id)).map((a) => a.title!);

  return (
    <>
      {bannerAchievement && (
        <div role="status" aria-live="polite" aria-atomic="true" className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] animate-slide-down pointer-events-none">
          <div className="bg-gradient-to-r from-amber-900 via-amber-700 to-amber-900 border-2 border-amber-400 rounded-2xl px-6 py-3 shadow-2xl text-center max-w-sm">
            <div className="text-amber-200 text-[10px] uppercase tracking-widest mb-1">{t("ach.unlocked")}</div>
            <div className="text-white font-bold text-base">{bannerAchievement.name}</div>
            <div className="text-amber-200 text-xs mt-0.5">{bannerAchievement.desc}</div>
            <div className="text-amber-300 text-[10px] mt-1">+{bannerAchievement.reward?.zeny ?? 0} Zeny</div>
          </div>
        </div>
      )}

      <div onClick={() => setOpen(false)}>
        <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
          <div
            data-no-screen-joy
            role="dialog"
            aria-modal="true"
            aria-label={t("ach.title")}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-[28rem] max-w-[94vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }}>
              <GameFrame
                title={`${t("ach.title")} ${unlockedCount}/${total}`}
                className="flex flex-col min-h-0"
                innerClassName="flex flex-col flex-1 min-h-0"
              >
                <button
                  onClick={() => setOpen(false)}
                  aria-label={t("common.close")}
                  className="absolute -top-3 -right-3 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10 flex items-center justify-center"
                >
                  ✕
                </button>

                {titles.length > 0 && (
                  <div className="mb-2 p-2 rounded-xl bg-amber-900/30 border border-amber-400/40">
                    <div className="text-[10px] text-amber-300 uppercase tracking-wider font-bold mb-1.5">{t("ach.myTitles")}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setPendingTitle("")}
                        className={`text-[10px] px-2 py-1 rounded-full border-2 transition ${me.title === "" ? "border-amber-300 bg-amber-500/30" : "border-amber-700/50 bg-slate-900/40 hover:border-amber-400"}`}
                      >
                        {t("ach.none")}
                      </button>
                      {titles.map((t) => (
                        <button
                          key={t}
                          onClick={() => setPendingTitle(t)}
                          className={`text-[10px] px-2 py-1 rounded-full border-2 transition ${me.title === t ? "border-amber-300 bg-amber-500/30" : "border-amber-700/50 bg-slate-900/40 hover:border-amber-400"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 overflow-y-auto game-scroll flex-1 pr-1 pt-1" style={{ minHeight: 0 }}>
                  {ACHIEVEMENTS.map((a) => {
                    const have = prog.counters[a.counter] ?? 0;
                    const done = prog.unlocked.includes(a.id);
                    const pct = Math.min(100, (have / a.goal) * 100);
                    return (
                      <div
                        key={a.id}
                        className={`border-2 p-2.5 rounded transition ${done ? "border-amber-400 bg-amber-900/20" : "border-slate-700 bg-slate-900/60"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl ${done ? "" : "grayscale opacity-50"}`}>{a.icon}</span>
                          <div className="flex-1">
                            <div className={`text-sm font-bold ${done ? "text-amber-200" : "text-white"}`}>
                              {a.name} {done && "✓"}
                            </div>
                            <div className="text-[10px] text-slate-400">{a.desc}</div>
                          </div>
                          <span className="text-xs tabular-nums">{have}/{a.goal}</span>
                        </div>
                        <div className="h-1 bg-black/60 mt-2 overflow-hidden rounded-sm">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: done ? "linear-gradient(90deg, #fbbf24, #f59e0b)" : "linear-gradient(90deg, #22d3ee, #0ea5e9)",
                            }}
                          />
                        </div>
                        {a.reward && (
                          <div className="text-[10px] text-amber-300/80 mt-1.5">
                            {a.reward.zeny ? `${a.reward.zeny}z ` : ""}{a.reward.itemId ? `+${a.reward.qty ?? 1} ${a.reward.itemId}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </GameFrame>
            </div>
          </div>
        </FocusTrap>
      </div>

      <ConfirmDialog
        open={pendingTitle !== null}
        title={t("ach.changeTitle")}
        message={pendingTitle !== null && pendingTitle !== ""
          ? t("ach.confirmChangeTitle", { title: pendingTitle })
          : t("ach.confirmClearTitle")}
        confirmLabel={t("ach.change")}
        onConfirm={() => {
          if (pendingTitle !== null) room.send("setTitle", { title: pendingTitle });
          setPendingTitle(null);
        }}
        onCancel={() => setPendingTitle(null)}
      />
    </>
  );
}