import { useEffect, useRef } from "react";
import type { Room } from "colyseus.js";
import { MAPS, NPCS, type MapId, type WorldState } from "@game/shared";
import { useStore } from "../store";

const SIZE = 130;

/**
 * Pinned top-right minimap (mirror of HP/SP card on top-left).
 * No drag — symmetric and predictable.
 */
export function Minimap({ room, mapId }: { room: Room<WorldState>; mapId: MapId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapDef = MAPS[mapId];
  const waypoint = useStore((s) => s.waypoint);
  const setWaypoint = useStore((s) => s.setWaypoint);

  function onMapClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = (px / SIZE) * mapDef.size - mapDef.size / 2;
    const wz = (py / SIZE) * mapDef.size - mapDef.size / 2;
    setWaypoint({ x: wx, z: wz, label: "ปักหมุด", icon: "📍" });
  }

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    let timer: any = 0;
    const draw = () => {
      const me = room.state.players.get(room.sessionId);
      if (!me) { timer = setTimeout(draw, 200); return; }
      const scale = SIZE / mapDef.size;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, SIZE, SIZE);
      // ground tint
      ctx.fillStyle = mapDef.groundColor;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;
      // portals
      for (const p of mapDef.portals) {
        const x = (p.x + mapDef.size / 2) * scale;
        const y = (p.z + mapDef.size / 2) * scale;
        ctx.fillStyle = "#a855f7";
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
      // NPCs
      for (const n of NPCS) {
        if (n.mapId !== mapId) continue;
        const x = (n.x + mapDef.size / 2) * scale;
        const y = (n.z + mapDef.size / 2) * scale;
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
      // monsters
      for (const [, m] of room.state.monsters) {
        if (m.dead) continue;
        const x = (m.pos.x + mapDef.size / 2) * scale;
        const y = (m.pos.z + mapDef.size / 2) * scale;
        ctx.fillStyle = m.kind === "wolf" ? "#9ca3af" : "#a3e635";
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      // other players
      for (const [sid, p] of room.state.players) {
        if (p.dead) continue;
        const x = (p.pos.x + mapDef.size / 2) * scale;
        const y = (p.pos.z + mapDef.size / 2) * scale;
        ctx.fillStyle = sid === room.sessionId ? "#22c55e" : "#60a5fa";
        ctx.beginPath(); ctx.arc(x, y, sid === room.sessionId ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // self direction arrow
      const sx = (me.pos.x + mapDef.size / 2) * scale;
      const sy = (me.pos.z + mapDef.size / 2) * scale;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.sin(me.rotY) * 8, sy + Math.cos(me.rotY) * 8);
      ctx.stroke();
      // waypoint marker + dashed path
      if (waypoint) {
        const wx = (waypoint.x + mapDef.size / 2) * scale;
        const wy = (waypoint.z + mapDef.size / 2) * scale;
        ctx.strokeStyle = "#f472b6";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(wx, wy);
        ctx.stroke();
        ctx.setLineDash([]);
        const pulse = (Date.now() % 1000) / 1000;
        ctx.fillStyle = "#f472b6";
        ctx.globalAlpha = 0.6 + pulse * 0.4;
        ctx.beginPath(); ctx.arc(wx, wy, 4 + pulse * 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      timer = setTimeout(draw, 200);
    };
    draw();
    return () => clearTimeout(timer);
  }, [room, mapId, mapDef, waypoint]);

  // Clear any stale dragged position from localStorage (one-time migration).
  useEffect(() => {
    try { localStorage.removeItem("drag:minimap"); } catch {}
  }, []);

  return (
    <div className="pointer-events-auto select-none">
      <div
        className="bg-black/55 backdrop-blur-md border border-cyan-400/30 rounded p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        style={{ width: SIZE + 12 }}
      >
        <div className="text-[10px] text-cyan-200 uppercase tracking-wider font-semibold flex items-center justify-between px-0.5 mb-1">
          <span className="truncate">📍 {mapDef.name}</span>
          {waypoint && (
            <button
              onClick={() => setWaypoint(null)}
              className="text-rose-300 hover:text-rose-200 text-[10px] px-1"
              title="ยกเลิกเส้นทาง"
            >✕</button>
          )}
        </div>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onClick={onMapClick}
          style={{
            display: "block",
            borderRadius: 2,
            border: "1px solid rgba(34, 211, 238, 0.25)",
            boxShadow: "inset 0 0 8px rgba(0,0,0,0.5)",
            cursor: "crosshair",
          }}
        />
        <div className="text-[9px] text-cyan-300/70 text-center mt-0.5">
          แตะเพื่อปักหมุด
        </div>
      </div>
    </div>
  );
}
