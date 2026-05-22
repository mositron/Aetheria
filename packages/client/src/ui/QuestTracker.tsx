import type { Room } from "colyseus.js";
import { QUESTS, MONSTERS, ITEMS, type WorldState } from "@game/shared";
import { useQuests } from "../hooks/useQuests";

/**
 * Persistent quest tracker — top-left below HUD, transparent background.
 * Shows up to 3 active quests with progress. Auto-hidden if no quests.
 */
export function QuestTracker({ room }: { room: Room<WorldState> }) {
  const quests = useQuests(room);
  const active = Object.entries(quests.active);
  if (active.length === 0) return null;

  return (
    <div
      className="absolute z-20 pointer-events-none select-none"
      style={{ top: "11rem", left: "0.5rem", maxWidth: "min(15rem, 50vw)" }}
    >
      <div
        className="px-2.5 py-1.5 rounded-xl"
        style={{
          background: "rgba(0, 0, 0, 0.28)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(125, 211, 252, 0.25)",
        }}
      >
        <div className="text-[10px] text-cyan-100/90 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
          📜 เควสต์
        </div>
        <div className="space-y-1.5">
          {active.slice(0, 3).map(([qid, progress]) => {
            const q = QUESTS[qid];
            if (!q) return null;
            const goal = q.objective.count;
            const done = progress >= goal;
            const objLabel =
              q.objective.kind === "kill"
                ? `${MONSTERS[q.objective.monster]?.name ?? q.objective.monster}`
                : `${ITEMS[q.objective.itemId]?.name ?? q.objective.itemId}`;
            const pct = Math.min(100, (progress / goal) * 100);
            return (
              <div key={qid} className="text-[11px]">
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-bold truncate ${done ? "text-emerald-300" : "text-white"}`}>
                    {done ? "✓ " : "▸ "}{q.name}
                  </span>
                  <span className={`tabular-nums text-[10px] flex-shrink-0 ${done ? "text-emerald-300" : "text-amber-200"}`}>
                    {progress}/{goal}
                  </span>
                </div>
                <div className="text-[9px] text-slate-300/80 truncate">
                  {q.objective.kind === "kill" ? "🗡 " : "📦 "}{objLabel}
                </div>
                <div className="h-0.5 bg-black/40 rounded-full overflow-hidden mt-0.5">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: done
                        ? "linear-gradient(90deg, #34d399, #10b981)"
                        : "linear-gradient(90deg, #22d3ee, #0ea5e9)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          {active.length > 3 && (
            <div className="text-[9px] text-slate-400/70 italic">+{active.length - 3} เควสต์เพิ่มเติม</div>
          )}
        </div>
      </div>
    </div>
  );
}
