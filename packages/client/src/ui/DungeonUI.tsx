import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { type WorldState } from "@game/shared";
import { useT } from "../locales/useT";

export function DungeonUI({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [floor, setFloor] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [monstersTotal, setMonstersTotal] = useState(0);
  const [monstersLeft, setMonstersLeft] = useState(0);

  useEffect(() => {
    const off = room.onMessage("dungeonState" as any, (msg: any) => {
      setFloor(msg.floor ?? 0);
      setCleared(msg.cleared ?? false);
      setMonstersTotal(msg.total ?? 0);
      setMonstersLeft(msg.remaining ?? 0);
    });
    return () => off?.();
  }, [room]);

  // Only show when on an endless floor
  const mapId: string = room.state.mapId as string;
  if (!mapId?.startsWith("endless_")) return null;

  return (
    <div className="absolute top-4 right-4 w-56 pointer-events-auto">
      <div className="bg-slate-900/90 border-2 border-amber-500 rounded-2xl p-3 text-white text-sm">
        <div className="text-center font-bold text-amber-400 text-base mb-2">
          🏰 {t("dungeon.title", { floor })}
        </div>

        <div className="space-y-2">
          {/* Monster counter */}
          <div>
            <div className="text-xs text-slate-400 mb-1">{t("dungeon.monsterRemaining")}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{
                    width: monstersTotal > 0
                      ? `${Math.max(0, ((monstersTotal - monstersLeft) / monstersTotal) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="text-xs text-slate-300">
                {monstersLeft}/{monstersTotal}
              </span>
            </div>
          </div>

          {/* Cleared banner */}
          {cleared && (
            <div className="text-center text-amber-400 font-bold text-xs animate-pulse">
              ✅ {t("dungeon.floorCleared")}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-1">
            {cleared && (
              <button
                onClick={() => room.send("claimDungeonReward", {})}
                className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-white"
                style={{ background: "linear-gradient(180deg, #fde68a 0%, #fbbf24 60%, #d97706 100%)" }}
              >
                💰 {t("dungeon.claimReward")}
              </button>
            )}
            {cleared && (
              <button
                onClick={() => room.send("descendDungeon", {})}
                className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-white"
                style={{ background: "linear-gradient(180deg, #c084fc 0%, #a855f7 60%, #7c3aed 100%)" }}
              >
                ⬇️ {t("dungeon.descend", { floor: floor + 1 })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}