import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { Monster, WorldState } from "@game/shared";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function BossBar({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  const [respawnIn, setRespawnIn] = useState<number | null>(null);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 400); return () => clearInterval(id); }, []);
  useEffect(() => {
    const off = room.onMessage("bossTimer" as any, (m: any) => {
      if (typeof m?.secondsLeft === "number") setRespawnIn(m.secondsLeft);
    });
    // Local countdown — tick down between server broadcasts (every 5s)
    const id = setInterval(() => {
      setRespawnIn((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => { off?.(); clearInterval(id); };
  }, [room]);

  const me = room.state.players.get(room.sessionId);
  if (!me) return null;
  let boss: Monster | null = null;
  for (const [, m] of room.state.monsters) {
    if (m.kind === "darklord" && !m.dead) {
      const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
      if (d < 25) { boss = m; break; }
    }
  }
  if (boss) {
    const pct = (boss.hp / boss.maxHp) * 100;
    return (
      <div className="panel absolute top-2 left-1/2 -translate-x-1/2 w-56 sm:w-72 md:w-96">
        <div className="panel-corners" />
        <div className="panel-title">
          <span>⚜ DARK LORD ⚜</span>
          <span className="normal-case text-[10px] sm:text-xs">{boss.hp} / {boss.maxHp}</span>
        </div>
        <div className="h-2 sm:h-3 bg-black/60 border border-black/60">
          <div className="h-full bg-gradient-to-b from-fuchsia-500 to-purple-800" style={{ width: `${pct}%`, transition: "width 0.15s linear" }} />
        </div>
      </div>
    );
  }
  if (respawnIn !== null && respawnIn > 0) {
    return (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-900/80 border border-purple-500/60 text-[11px] text-purple-200 font-bold tracking-wider pointer-events-none">
        ⚜ Dark Lord respawns in {fmt(respawnIn)}
      </div>
    );
  }
  return null;
}
