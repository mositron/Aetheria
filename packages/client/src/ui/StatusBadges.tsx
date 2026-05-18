import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { STATUS_DEFS, type Player, type WorldState, type StatusKind } from "@game/shared";

export function StatusBadges({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me || me.statuses.length === 0) return null;
  const now = Date.now();
  const active = Array.from(me.statuses.values()).filter((s) => s.endAt > now);
  if (active.length === 0) return null;

  return (
    <div className="absolute top-20 left-2 flex gap-0.5">
      {active.map((s, i) => {
        const def = STATUS_DEFS[s.kind as StatusKind];
        if (!def) return null;
        const remain = Math.max(0, (s.endAt - now) / 1000).toFixed(0);
        return (
          <div key={i} title={def.name} className="bg-slate-900/85 px-1 text-center border border-black/50" style={{ borderBottomWidth: 2, borderBottomColor: def.color }}>
            <div className="text-sm leading-none">{def.icon}</div>
            <div className="text-[9px] text-slate-400">{remain}</div>
          </div>
        );
      })}
    </div>
  );
}
