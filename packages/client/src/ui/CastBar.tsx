import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { JOBS, type JobId, type Player, type WorldState } from "@game/shared";

type Cast = { skillId: string; name: string; until: number };

export function CastBar({ room }: { room: Room<WorldState> }) {
  const [cast, setCast] = useState<Cast | null>(null);

  useEffect(() => {
    const onMsg = room.onMessage("skillUsed" as any, (m: any) => {
      const me = room.state.players.get(room.sessionId);
      if (!me) return;
      if (m.playerId !== room.sessionId) return;
      const job = JOBS[me.job as JobId];
      const skill = job?.skills.find((s) => s.id === m.skillId);
      if (!skill) return;
      // show a brief "skill activated" bar matching the cooldown
      setCast({ skillId: m.skillId, name: skill.name, until: Date.now() + Math.min(800, skill.cooldownMs) });
    });
    return () => onMsg?.();
  }, [room]);

  useEffect(() => {
    if (!cast) return;
    const id = setInterval(() => {
      if (Date.now() > cast.until) setCast(null);
    }, 50);
    return () => clearInterval(id);
  }, [cast]);

  if (!cast) return null;
  const total = 800;
  const remain = Math.max(0, cast.until - Date.now());
  const pct = 100 - (remain / total) * 100;

  return (
    <div className="absolute left-1/2 bottom-24 -translate-x-1/2 w-48 sm:w-64 bg-slate-900/80 rounded p-2">
      <div className="text-[10px] sm:text-xs text-amber-300 text-center mb-1">{cast.name}</div>
      <div className="h-1.5 sm:h-2 bg-slate-800 rounded overflow-hidden">
        <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
