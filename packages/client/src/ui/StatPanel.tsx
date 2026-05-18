import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { STAT_KEYS, STAT_NAMES, type Player, type StatKey, type WorldState, derived } from "@game/shared";
import { keyEq } from "../utils/keyMatch";

export function StatPanel({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "c")) setOpen((o) => !o);
      if (e.key === "Escape" && open) setOpen(false);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", onKey);
    window.addEventListener("toggle-stats", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("toggle-stats", onToggle);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [open]);

  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  const d = derived({ str: me.str, agi: me.agi, vit: me.vit, int: me.int, dex: me.dex, luk: me.luk }, me.level);

  return (
    <>
      {open && (
        <div data-no-screen-joy className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
          <div className="panel w-72 space-y-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div className="panel-corners" />
            <div className="panel-title">
              <span>📊 Character</span>
              <button onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="text-sm text-amber-300">
              Stat points available: <span className="font-bold">{me.statPoints}</span>
            </div>

            <div className="space-y-1">
              {STAT_KEYS.map((k) => (
                <StatRow
                  key={k}
                  k={k}
                  value={(me as any)[k]}
                  points={me.statPoints}
                  onAdd={() => room.send("allocStat", { stat: k })}
                />
              ))}
            </div>

            <div className="border-t border-slate-700 pt-2 text-xs space-y-0.5 text-slate-300">
              <div>Max HP: <b>{me.maxHp}</b> • Max MP: <b>{me.maxMp}</b></div>
              <div>ATK: <b>{me.atk}</b> • DEF: <b>{me.def}</b></div>
              <div>Hit: <b>{d.hit}</b> • Crit: <b>{d.crit.toFixed(1)}%</b></div>
              <div>ASPD mult: <b>{d.aspdMult.toFixed(2)}x</b> (lower = faster)</div>
              <div>Zeny: <b className="text-yellow-300">{me.zeny}z</b></div>
            </div>

            <button
              onClick={() => room.send("togglePvp" as any, {})}
              className={`w-full rounded px-3 py-1.5 text-xs font-bold border-2 transition ${
                me.pvpFlag
                  ? "bg-rose-700 hover:bg-rose-600 border-rose-300 text-white"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-500 text-slate-300"
              }`}
            >
              {me.pvpFlag ? "⚔ PvP เปิดอยู่ (กดปิด)" : "🕊 PvP ปิดอยู่ — กดเปิด"}
            </button>
            {me.level >= 30 && (
              <button
                onClick={() => window.dispatchEvent(new Event("toggle-job-advance"))}
                className="w-full rounded px-3 py-1.5 text-xs font-bold border-2 bg-amber-700 hover:bg-amber-600 border-amber-300 text-white"
              >
                ✨ เปลี่ยนอาชีพ 2nd-class
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatRow({ k, value, points, onAdd }: { k: StatKey; value: number; points: number; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-1.5 border border-white/5">
      <div className="text-xs uppercase text-slate-300">{STAT_NAMES[k]}</div>
      <div className="flex items-center gap-2">
        <span className="font-bold w-6 text-right text-amber-100">{value}</span>
        <button
          disabled={points <= 0 || value >= 99}
          onClick={onAdd}
          className="btn-3d btn-amber w-7 h-7 !p-0 disabled:opacity-40 disabled:!bg-slate-700"
        >+</button>
      </div>
    </div>
  );
}
