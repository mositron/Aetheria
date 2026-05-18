import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { GAME_CONFIG, type Player, type WorldState } from "@game/shared";

/**
 * Bottom bar = item hotbar (auto from inventory) + ultra-thin EXP strip at the very edge.
 * Items show their qty as a badge. Tap = use/equip.
 */
export function BottomBar({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, []);

  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;
  const expNeed = GAME_CONFIG.EXP_PER_LEVEL(me.level);
  const expPct = Math.max(0, Math.min(1, me.exp / expNeed)) * 100;

  return (
    <>
      {/* Item hotbar (1-8) deprecated — items accessible via Inventory panel.
          Only the EXP strip remains here. */}

      {/* EXP strip — full width, ultra-thin at the very bottom edge.
          Numeric readout sits ON the right edge (out of the way of the centered item bar). */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none select-none">
        <div className="relative h-2 bg-black/75 border-t border-amber-500/30">
          <div
            className="h-full transition-all"
            style={{
              width: `${expPct}%`,
              background: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #fcd34d 100%)",
              boxShadow: "0 0 12px rgba(251,191,36,0.7)",
            }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
            style={{ fontSize: 7, lineHeight: 1 }}
          >
            {Math.floor(me.exp)}/{expNeed}
          </div>
        </div>
      </div>
    </>
  );
}
