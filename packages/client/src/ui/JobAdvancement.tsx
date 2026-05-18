// Job-advancement dialog: choose a 2nd-class job at Lv30.
// Opens via toggle-job-advance event from StatPanel.

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { JOBS, JOB_ADVANCEMENT, type Player, type WorldState, type JobId } from "@game/shared";
import { GameFrame } from "./GameFrame";

export function JobAdvancement({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-job-advance", onToggle);
    return () => window.removeEventListener("toggle-job-advance", onToggle);
  }, []);

  // Auto-prompt the first time a player hits Lv30
  useEffect(() => {
    const onLevel = (e: any) => {
      const me = room.state.players.get(room.sessionId);
      if (me && me.level === 30 && (JOB_ADVANCEMENT as any)[me.job]?.length > 0) {
        if (localStorage.getItem("advance-shown-" + me.job) !== "1") {
          setOpen(true);
          localStorage.setItem("advance-shown-" + me.job, "1");
        }
      }
    };
    room.onMessage("levelup" as any, onLevel);
    return () => {};
  }, [room]);

  if (!open) return null;
  const me = room.state.players.get(room.sessionId) as Player | undefined;
  if (!me) return null;
  const options = ((JOB_ADVANCEMENT as any)[me.job] ?? []) as JobId[];
  return (
    <div data-no-screen-joy className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[24rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title="✨ เปลี่ยนอาชีพ">
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="text-xs text-slate-300 mb-3">
            เลเวล {me.level} — เปลี่ยนอาชีพจาก <span className="text-amber-300 font-bold">{(JOBS as any)[me.job]?.name ?? me.job}</span> เป็น:
          </div>

          {options.length === 0 ? (
            <div className="text-slate-400 italic text-xs text-center py-4">อาชีพนี้ยังไม่มี 2nd-class</div>
          ) : (
            <div className="space-y-1.5">
              {options.map((j) => {
                const job = (JOBS as any)[j];
                if (!job) return null;
                return (
                  <button
                    key={j}
                    onClick={() => {
                      if (confirm(`เปลี่ยนเป็น ${job.name}? เปลี่ยนแล้วย้อนกลับไม่ได้`)) {
                        room.send("advanceJob" as any, { job: j });
                        setOpen(false);
                      }
                    }}
                    className="w-full bg-amber-900/50 hover:bg-amber-800/70 border border-amber-400/40 rounded p-3 text-left transition"
                  >
                    <div className="text-sm font-bold text-amber-200">⚔ {job.name}</div>
                    <div className="text-[10px] text-slate-300 mt-0.5">
                      HP/lv: {job.hpPerLevel} · MP/lv: {job.mpPerLevel ?? "-"} · ATK/lv: {job.atkPerLevel ?? "-"}
                    </div>
                    <div className="text-[10px] text-cyan-300 mt-0.5">
                      สกิล: {job.skills?.map((s: any) => s.icon ?? s.name).join(" ") ?? "-"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </GameFrame>
      </div>
    </div>
  );
}
