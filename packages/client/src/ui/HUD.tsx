import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { type Player, type WorldState, type MapId } from "@game/shared";
import { Minimap } from "./Minimap";

/**
 * Minimal top-left vitals: HP + SP only (per user spec).
 * Hunger/thirst/stamina as tiny icon badges below.
 * EXP moved to BottomBar.
 */
export function HUD({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, []);

  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  const hungerWarn = me.hunger < 25;
  const thirstWarn = me.thirst < 25;

  return (
    <>
      {/* ── TOP-LEFT: HP / SP card ── */}
      <div className="absolute top-2 left-2 w-[15rem] max-w-[44vw] pointer-events-none select-none">
        <div className="bg-black/55 backdrop-blur-md border border-cyan-400/30 rounded p-2 space-y-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-white font-bold truncate">{me.name}</span>
            <span className="text-cyan-200 text-[10px]">
              Lv{me.level} · <span className="text-amber-300">{me.job}</span>
            </span>
          </div>
          <Bar icon="❤" value={me.hp} max={me.maxHp} color="#ef4444" />
          <Bar icon="✦" value={me.mp} max={me.maxMp} color="#0ea5e9" />
        </div>
        {/* Tiny survival pills below the card */}
        <div className="mt-1.5 flex gap-1">
          <Pill icon="🍗" value={me.hunger} warn={hungerWarn} color="#a3e635" warnColor="#fb923c" />
          <Pill icon="💧" value={me.thirst} warn={thirstWarn} color="#38bdf8" warnColor="#fb923c" />
          <Pill icon="⚡" value={me.stamina} max={me.maxStamina} color="#fde047" />
        </div>
      </div>

      {/* ── TOP-RIGHT: Minimap → gold/zeny → status badges (all in one column, no overlap) ── */}
      <div className="absolute top-2 right-2 pointer-events-none select-none flex flex-col items-end gap-1">
        <Minimap room={room} mapId={room.state.mapId as MapId} />
        <div className="bg-black/55 backdrop-blur-md border border-amber-400/30 rounded px-2 py-1 text-[11px] flex items-center gap-2">
          <span className="text-yellow-300 font-bold">💰{me.zeny}</span>
        </div>
        {room.state.isNight && (
          <div className="bg-violet-900/60 border border-violet-400/60 rounded px-2 py-0.5 text-[10px] text-violet-200 flex items-center gap-1">
            <span className="animate-pulse">🌙</span>
            <span>กลางคืน · มอนแรง</span>
          </div>
        )}
        {room.state.season && room.state.season !== "none" && (
          <div className="bg-pink-900/60 border border-pink-400/60 rounded px-2 py-0.5 text-[10px] text-pink-100 flex items-center gap-1">
            <span className="animate-pulse">
              {room.state.season === "christmas" ? "🎄" : room.state.season === "halloween" ? "🎃" : "💦"}
            </span>
            <span>
              {room.state.season === "christmas" ? "เทศกาลคริสต์มาส" :
               room.state.season === "halloween" ? "ฮาโลวีน" : "สงกรานต์"}
            </span>
          </div>
        )}
        {room.state.weather === "rainy" && (
          <div className="bg-sky-900/60 border border-sky-400/60 rounded px-2 py-0.5 text-[10px] text-sky-100 flex items-center gap-1">
            <span>🌧</span>
            <span>ฝนตก · stamina ฟื้นเร็ว</span>
          </div>
        )}
        {(me.statPoints > 0) && (
          <div className="bg-amber-500/20 border border-amber-400 rounded px-2 py-0.5 text-[10px] text-amber-200 animate-pulse">
            ⚡ {me.statPoints} stat
          </div>
        )}
        {hungerWarn && (
          <div className="bg-orange-900/60 border border-orange-400/60 rounded px-2 py-0.5 text-[10px] text-orange-200">
            🍗 หิวจัด!
          </div>
        )}
        {thirstWarn && (
          <div className="bg-blue-900/60 border border-blue-400/60 rounded px-2 py-0.5 text-[10px] text-blue-200">
            💧 กระหายน้ำ!
          </div>
        )}
      </div>
    </>
  );
}

function Bar({ icon, value, max, color }: { icon: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] w-4 text-center">{icon}</span>
      <div className="flex-1 h-2 bg-black/60 rounded-sm overflow-hidden border border-black/40">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}99` }}
        />
      </div>
      <span className="text-[10px] text-slate-300 tabular-nums w-14 text-right">
        {Math.floor(value)}/{max}
      </span>
    </div>
  );
}

function Pill({ icon, value, max = 100, color, warn, warnColor }: { icon: string; value: number; max?: number; color: string; warn?: boolean; warnColor?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const fill = warn && warnColor ? warnColor : color;
  return (
    <div
      className={`flex-1 flex items-center gap-1 bg-black/55 backdrop-blur-md border border-white/10 rounded px-1.5 py-0.5 ${warn ? "animate-pulse" : ""}`}
      style={{ borderColor: warn ? `${warnColor}80` : undefined }}
    >
      <span className="text-[10px]">{icon}</span>
      <div className="flex-1 h-1 bg-black/60 overflow-hidden rounded-sm">
        <div className="h-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
      <span className="text-[9px] text-slate-300 tabular-nums">{Math.floor(value)}</span>
    </div>
  );
}
