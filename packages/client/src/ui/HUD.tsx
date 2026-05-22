import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { type Player, type WorldState, type MapId } from "@game/shared";
import { useStore } from "../store";
import { Minimap } from "./Minimap";

/**
 * Minimal top-left vitals: HP + SP only (per user spec).
 * Hunger/thirst/stamina as tiny icon badges below.
 * EXP moved to BottomBar.
 */
export function HUD({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  // Mobile: shrink HUD card (still show all bars + pills — user expects to see them)
  const isMobile = true; // mobile sizing used on all screens

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
      {/* ── TOP-LEFT: HP / SP card (full info, smaller on mobile) ── */}
      <div className="absolute top-2 left-2 pointer-events-none select-none" style={{ width: isMobile ? "10rem" : "15rem", maxWidth: "44vw" }}>
        <div
          className="bg-black/55 backdrop-blur-md border border-cyan-400/30 rounded shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          style={{ padding: isMobile ? "5px 6px" : "8px" }}
        >
          <div className="space-y-1">
            <div className="flex items-baseline justify-between" style={{ fontSize: isMobile ? 10 : 11 }}>
              <span className="text-white font-bold truncate">{me.name}</span>
              <span className="text-cyan-100" style={{ fontSize: isMobile ? 9 : 10 }}>
                Lv{me.level} · <span className="text-amber-300">{me.job}</span>
              </span>
            </div>
            <Bar icon="❤" value={me.hp} max={me.maxHp} color="#ef4444" />
            <Bar icon="✦" value={me.mp} max={me.maxMp} color="#0ea5e9" />
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          <Pill icon="🍗" value={me.hunger} warn={hungerWarn} color="#a3e635" warnColor="#fb923c" />
          <Pill icon="💧" value={me.thirst} warn={thirstWarn} color="#38bdf8" warnColor="#fb923c" />
          <Pill icon="⚡" value={me.stamina} max={me.maxStamina} color="#fde047" />
        </div>
        {/* Gold + unspent stat points — sit directly under the HUD card */}
        <div className="mt-1 flex items-center gap-1">
          <div className="bg-black/55 backdrop-blur-md border border-amber-400/30 rounded px-1.5 py-0.5 flex items-center" style={{ fontSize: 9 }}>
            <span className="text-yellow-300 font-bold">💰{me.zeny}</span>
          </div>
          {(me.statPoints > 0) && (
            <div className="bg-amber-500/20 border border-amber-400 rounded px-1.5 py-0.5 text-amber-200 animate-pulse" style={{ fontSize: 9 }}>
              ⚡{me.statPoints} stat
            </div>
          )}
        </div>
        {/* Build mode toggle */}
        <BuildModeButton />
      </div>

      {/* ── TOP-RIGHT: Minimap + icon-only status chips (tooltip on hover) ── */}
      <div className="absolute top-2 right-2 pointer-events-auto select-none flex flex-col items-end gap-1">
        <Minimap room={room} mapId={room.state.mapId as MapId} />
        <div className="flex gap-1 flex-wrap justify-end max-w-[8rem]">
          {room.state.isNight && (
            <StatusChip icon="🌙" color="#a855f7" title="กลางคืน · มอนแรง" pulse />
          )}
          {room.state.season && room.state.season !== "none" && (
            <StatusChip
              icon={room.state.season === "christmas" ? "🎄" : room.state.season === "halloween" ? "🎃" : "💦"}
              color="#ec4899"
              title={room.state.season === "christmas" ? "เทศกาลคริสต์มาส" : room.state.season === "halloween" ? "ฮาโลวีน" : "สงกรานต์"}
              pulse
            />
          )}
          {room.state.weather === "rainy" && <StatusChip icon="🌧" color="#38bdf8" title="ฝนตก · stamina ฟื้นเร็ว" />}
          {hungerWarn && <StatusChip icon="🍗" color="#fb923c" title="หิวจัด!" pulse />}
          {thirstWarn && <StatusChip icon="💧" color="#60a5fa" title="กระหายน้ำ!" pulse />}
        </div>
      </div>
    </>
  );
}

function StatusChip({ icon, color, title, pulse }: { icon: string; color: string; title: string; pulse?: boolean }) {
  return (
    <div
      title={title}
      className={`flex items-center justify-center rounded-full backdrop-blur-md ${pulse ? "animate-pulse" : ""}`}
      style={{
        width: 22, height: 22, fontSize: 12,
        background: `${color}20`,
        border: `1px solid ${color}80`,
        boxShadow: `0 0 6px ${color}40`,
      }}
    >{icon}</div>
  );
}

function Bar({ icon, value, max, color }: { icon: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  // Compact full-width bar: 9px tall, 7px text overlaid.
  return (
    <div className="relative w-full h-[9px] bg-black/65 rounded-sm overflow-hidden border border-black">
      <div
        className="absolute inset-y-0 left-0 transition-all"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}99` }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none leading-none">
        <span style={{ fontSize: 7 }} className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{icon}</span>
        <span style={{ fontSize: 7 }} className="font-bold text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {Math.floor(value)}/{max}
        </span>
      </div>
    </div>
  );
}

function Pill({ icon, value, max = 100, color, warn, warnColor }: { icon: string; value: number; max?: number; color: string; warn?: boolean; warnColor?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const fill = warn && warnColor ? warnColor : color;
  // Compact pill: 8px tall, 7px text overlaid.
  return (
    <div
      className={`relative flex-1 h-[8px] bg-black/65 border border-black rounded overflow-hidden ${warn ? "animate-pulse" : ""}`}
      style={{ borderColor: warn && warnColor ? `${warnColor}80` : undefined }}
    >
      <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: fill }} />
      <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none leading-none">
        <span style={{ fontSize: 6 }} className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{icon}</span>
        <span style={{ fontSize: 7 }} className="font-bold text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{Math.floor(value)}</span>
      </div>
    </div>
  );
}

function BuildModeButton() {
  const buildMode = useStore((s) => s.buildMode);
  const selectedStructItemId = useStore((s) => s.selectedStructItemId);
  const toggleBuildMode = useStore((s) => s.toggleBuildMode);
  const setSelectedStructItem = useStore((s) => s.setSelectedStructItem);

  return (
    <div className="mt-1 flex flex-col gap-1">
      {/* Toggle build mode on/off */}
      <button
        onClick={toggleBuildMode}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border transition-all ${
          buildMode
            ? "bg-cyan-500/30 border-cyan-400 text-cyan-300 shadow-[0_0_8px_cyan]"
            : "bg-black/55 border-amber-400/40 text-amber-300 hover:border-amber-400/80"
        }`}
      >
        🏠 {buildMode ? "ออกจากโหมดสร้าง" : "สร้างฐาน"}
      </button>
      {buildMode && (
        <div className="flex gap-1">
          <button
            onClick={() => setSelectedStructItem(null)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-bold border transition-all ${
              selectedStructItemId === null
                ? "bg-rose-500/30 border-rose-400 text-rose-300"
                : "bg-black/55 border-slate-600 text-slate-300 hover:border-rose-400/60"
            }`}
          >
            🔨 สร้าง
          </button>
          <button
            onClick={() => setSelectedStructItem("__destroy__")}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-bold border transition-all ${
              selectedStructItemId === "__destroy__"
                ? "bg-rose-500/30 border-rose-400 text-rose-300"
                : "bg-black/55 border-slate-600 text-slate-300 hover:border-rose-400/60"
            }`}
          >
            💥 ทำลาย
          </button>
        </div>
      )}
      {buildMode && selectedStructItemId && selectedStructItemId !== "__destroy__" && (
        <div className="text-[9px] text-cyan-300/70 px-1">
          คลิกซ้ายพื้นเพื่อวาง · คลิกขวาบนสิ่งก่อสร้างเพื่อทำลาย
        </div>
      )}
      {buildMode && selectedStructItemId === "__destroy__" && (
        <div className="text-[9px] text-rose-300/70 px-1">
          คลิกขวาบนสิ่งก่อสร้างเพื่อทำลาย
        </div>
      )}
    </div>
  );
}
