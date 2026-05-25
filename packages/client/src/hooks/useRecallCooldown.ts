import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

/**
 * Tracks the server-issued recall-stone cooldown for the active player.
 * Returns seconds remaining (0 if ready). Updates 1×/sec.
 */
export function useRecallCooldown(room: Room<WorldState>): number {
  const [until, setUntil] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const off = room.onMessage("recallCooldown" as any, (m: any) => {
      if (typeof m?.until === "number") setUntil(m.until);
    });
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { off?.(); clearInterval(id); };
  }, [room]);

  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}
