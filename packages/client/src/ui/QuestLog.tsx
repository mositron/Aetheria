import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { QUESTS, type WorldState } from "@game/shared";
import { useQuests } from "../hooks/useQuests";
import { useDraggable } from "../hooks/useDraggable";
import { keyEq } from "../utils/keyMatch";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";

export function QuestLog({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const quests = useQuests(room);
  const [open, setOpen] = useState(false);
  useExclusiveModal("questLog", open, setOpen);
  const drag = useDraggable("quest");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "q")) setOpen((o) => !o);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", onKey);
    window.addEventListener("toggle-quest", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("toggle-quest", onToggle);
    };
  }, []);

  const active = Object.entries(quests.active);
  if (active.length === 0 && !open) return null;

  return (
    <div ref={drag.elRef} className="panel absolute right-2 top-44 w-36 sm:w-48 text-[11px] space-y-0.5" style={drag.style}>
      <div className="panel-corners" />
      <div className="panel-title" {...drag.titleProps}>
        <span>{t('questlog.title')}</span>
        <button onClick={() => setOpen(!open)}>{open ? "−" : "+"}</button>
      </div>
      {active.length === 0 && open && <div className="text-slate-500">{t('questlog.noActive')}</div>}
      {active.map(([qid, prog]) => {
        const q = QUESTS[qid];
        if (!q) return null;
        const goal = q.objective.count;
        const pct = Math.min(100, (prog / goal) * 100);
        return (
          <div key={qid} className="bg-slate-800 rounded p-1.5">
            <div className="font-semibold">{q.name}</div>
            <div className="text-slate-400">
              {q.objective.kind === "kill" ? `Kill ${q.objective.monster}` : `Collect ${q.objective.itemId}`}
              {" "}{prog}/{goal}
            </div>
            <div className="h-1 bg-slate-950 rounded mt-0.5">
              <div className="h-full bg-amber-500 rounded" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
