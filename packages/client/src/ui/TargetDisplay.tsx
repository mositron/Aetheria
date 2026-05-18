// Top-center target window. Shows whichever entity the player has selected:
//   • Monster → icon, name, level, HP bar
//   • Other player → name, job, HP
//   • NPC → name + role
// Disappears smoothly when no target.

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { MONSTERS, NPCS, type WorldState, type MapId, type Monster, type Player } from "@game/shared";
import { useStore } from "../store";

type TargetInfo =
  | { kind: "mob"; name: string; level: number; hp: number; maxHp: number; icon: string }
  | { kind: "player"; name: string; level: number; job: string; hp: number; maxHp: number }
  | { kind: "npc"; name: string; role: string; icon: string }
  | null;

export function TargetDisplay({ room }: { room: Room<WorldState> }) {
  const targetMonsterId = useStore((s) => s.targetMonsterId);
  const activeNpcId = useStore((s) => s.activeNpcId);
  const targetPlayerId = useStore((s) => (s as any).targetPlayerId ?? null);
  const [, setTick] = useState(0);

  // Refresh 5×/s so HP bar tracks live damage
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  let info: TargetInfo = null;

  // Mob target → top priority
  if (targetMonsterId) {
    const m = room.state.monsters.get(targetMonsterId) as Monster | undefined;
    if (m && !m.dead) {
      const cfg = (MONSTERS as any)[m.kind];
      info = {
        kind: "mob",
        name: cfg?.name ?? m.kind,
        level: (m as any).level ?? cfg?.level ?? 1,
        hp: m.hp,
        maxHp: m.maxHp,
        icon: cfg?.icon ?? "👾",
      };
    }
  }
  // NPC dialog open → second priority
  if (!info && activeNpcId) {
    const npc = NPCS.find((n) => n.id === activeNpcId && n.mapId === (room.state.mapId as MapId));
    if (npc) {
      info = { kind: "npc", name: npc.name, role: npc.kind, icon: (npc as any).icon ?? "👤" };
    }
  }
  // Targeted player
  if (!info && targetPlayerId) {
    const p = room.state.players.get(targetPlayerId) as Player | undefined;
    if (p) {
      info = {
        kind: "player",
        name: p.name,
        level: p.level,
        job: p.job,
        hp: p.hp, maxHp: p.maxHp,
      };
    }
  }

  if (!info) return null;

  const hpPct = info.kind === "mob" || info.kind === "player"
    ? Math.max(0, Math.min(1, info.hp / info.maxHp)) * 100
    : 0;
  const hpColor = info.kind === "mob" ? "#ef4444"
    : info.kind === "player" ? "#60a5fa"
    : "#a3e635";

  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none select-none z-30"
      style={{ minWidth: 180, maxWidth: 280 }}
    >
      <div
        className="rounded-lg overflow-hidden backdrop-blur-md"
        style={{
          background: "rgba(0, 0, 0, 0.55)",
          border: `1px solid ${info.kind === "mob" ? "rgba(239,68,68,0.5)"
            : info.kind === "player" ? "rgba(96,165,250,0.5)"
            : "rgba(163,230,53,0.5)"}`,
          boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-xl leading-none">
            {info.kind === "mob" || info.kind === "npc" ? info.icon : "🧑"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-white truncate leading-tight">{info.name}</div>
            <div className="text-[9px] text-slate-300 leading-tight">
              {info.kind === "mob" && `Lv${info.level} · มอนสเตอร์`}
              {info.kind === "player" && `Lv${info.level} · ${info.job}`}
              {info.kind === "npc" && (info.role === "shop" ? "🏪 ร้านค้า" : info.role === "questgiver" ? "📜 เควสต์" : info.role)}
            </div>
          </div>
        </div>
        {(info.kind === "mob" || info.kind === "player") && (
          <div className="relative h-[10px] bg-black/65 border-t border-white/10">
            <div
              className="absolute inset-y-0 left-0 transition-all"
              style={{ width: `${hpPct}%`, background: hpColor, boxShadow: `0 0 6px ${hpColor}99` }}
            />
            <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 8 }}>
              <span className="font-bold text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                {Math.floor((info as any).hp)}/{(info as any).maxHp}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
