import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { GAME_CONFIG, ITEMS, type Player, type WorldState } from "@game/shared";

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

  // top 8 stacks for the bar (excluding equipped weapon/armor — those have their own slots)
  const slots = me.inventory.slice(0, 8);

  return (
    <>
      {/* Item hotbar — sits just above the EXP strip, centered */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 select-none touch-none flex gap-1.5 z-20">
        {Array.from({ length: 8 }).map((_, i) => {
          const stack = slots[i];
          const def = stack ? ITEMS[stack.itemId] : null;
          const isResource = def && def.slot === "material";
          const usable = def && (def.slot === "consumable" || def.slot === "weapon" || def.slot === "armor");
          const activate = () => {
            if (!stack || !def) return;
            if (def.slot === "weapon" || def.slot === "armor") room.send("equip", { invIndex: i });
            else if (def.slot === "consumable") room.send("useItem", { invIndex: i });
            else if (stack.itemId === "berry_seed") room.send("plantSeed", {});
            else if (stack.itemId.startsWith("furniture_")) room.send("placeFurniture", { itemId: stack.itemId });
          };
          return (
            <button
              key={i}
              onClick={activate}
              onTouchStart={(e) => { if (!stack || !def) return; e.preventDefault(); activate(); }}
              disabled={!stack}
              className="relative active:scale-95 transition-transform"
              style={{
                width: 50, height: 50,
                background: stack
                  ? (isResource
                      ? "linear-gradient(180deg, #4b3b27 0%, #2a1f14 100%)"
                      : "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)")
                  : "rgba(15, 23, 42, 0.6)",
                border: `2px solid ${stack ? (isResource ? "#a16207" : "#22d3ee99") : "rgba(148,163,184,0.18)"}`,
                borderRadius: 6,
                boxShadow: stack
                  ? `0 0 10px ${isResource ? "rgba(161,98,7,0.3)" : "rgba(34,211,238,0.2)"}, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
              title={def?.name ?? ""}
            >
              {def ? (
                <>
                  <div className="text-2xl leading-none" style={{ marginTop: 2 }}>{def.icon}</div>
                  {stack && stack.qty > 1 && (
                    <span
                      className="absolute -bottom-1 -right-1 bg-black/85 border border-amber-400/60 text-amber-200 rounded px-1 text-[10px] font-bold tabular-nums"
                      style={{ minWidth: 18, textAlign: "center" }}
                    >
                      {stack.qty}
                    </span>
                  )}
                  {usable && !isResource && (
                    <span className="absolute top-0 left-0.5 text-[8px] text-cyan-300/80">{i + 1}</span>
                  )}
                </>
              ) : null}
            </button>
          );
        })}
      </div>

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
          <div className="absolute inset-y-0 right-2 flex items-center text-[9px] text-amber-200 tabular-nums tracking-wider font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
            EXP {Math.floor(me.exp)}/{expNeed}
          </div>
        </div>
      </div>
    </>
  );
}
