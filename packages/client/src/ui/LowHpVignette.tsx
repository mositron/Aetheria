import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

export function LowHpVignette({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 400); return () => clearInterval(id); }, []);
  const me = room.state.players.get(room.sessionId);
  if (!me) return null;
  const ratio = me.hp / me.maxHp;
  if (ratio > 0.3 && !me.dead) return null;
  const pulse = me.dead ? 0.55 : 0.25 + Math.abs(Math.sin(Date.now() * 0.005)) * 0.35;
  return (
    <div className="absolute inset-0 pointer-events-none"
      style={{ boxShadow: `inset 0 0 200px rgba(239, 68, 68, ${pulse})`, transition: "opacity 0.2s" }}
    />
  );
}
