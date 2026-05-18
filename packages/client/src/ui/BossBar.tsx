import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { Monster, WorldState } from "@game/shared";

export function BossBar({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 400); return () => clearInterval(id); }, []);

  const me = room.state.players.get(room.sessionId);
  if (!me) return null;
  let boss: Monster | null = null;
  for (const [, m] of room.state.monsters) {
    if (m.kind === "darklord" && !m.dead) {
      const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
      if (d < 25) { boss = m; break; }
    }
  }
  if (!boss) return null;
  const pct = (boss.hp / boss.maxHp) * 100;
  return (
    <div className="panel absolute top-2 left-1/2 -translate-x-1/2 w-96">
      <div className="panel-corners" />
      <div className="panel-title">
        <span>⚜ DARK LORD ⚜</span>
        <span className="normal-case">{boss.hp} / {boss.maxHp}</span>
      </div>
      <div className="h-3 bg-black/60 border border-black/60">
        <div className="h-full bg-gradient-to-b from-fuchsia-500 to-purple-800" style={{ width: `${pct}%`, transition: "width 0.15s linear" }} />
      </div>
    </div>
  );
}
