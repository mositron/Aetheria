import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { MAPS, NPCS, CAVES, type MapId, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { useT } from "../locales/useT";

// Friend list cache: keeps a Set of friend names refreshed from server.
function useFriendNames(room: Room<WorldState>) {
  const [friends, setFriends] = useState<Set<string>>(new Set());
  useEffect(() => {
    const off = room.onMessage("friend:list" as any, (m: any) => {
      setFriends(new Set((m.friends ?? []).map((f: any) => f.name)));
    });
    // Refresh every 20s
    const id = setInterval(() => room.send("friend:list" as any, {}), 20000);
    room.send("friend:list" as any, {});
    return () => { off?.(); clearInterval(id); };
  }, [room]);
  return friends;
}

// Mobile-style size for all screens (110px).
const SIZE = 110;

/**
 * Pinned top-right minimap (mirror of HP/SP card on top-left).
 * No drag — symmetric and predictable.
 */
export function Minimap({ room, mapId }: { room: Room<WorldState>; mapId: MapId }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapDef = MAPS[mapId];
  const waypoint = useStore((s) => s.waypoint);
  const setWaypoint = useStore((s) => s.setWaypoint);
  const friends = useFriendNames(room);

  function onMapClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = (px / SIZE) * mapDef.size - mapDef.size / 2;
    const wz = (py / SIZE) * mapDef.size - mapDef.size / 2;
    setWaypoint({ x: wx, z: wz, label: t("minimap.pinLocation"), icon: "📍" });
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
      // caves (only on field map) — dark squares with rocky tint
      if (mapId === "field") {
        for (const c of CAVES) {
          const x = (c.x + mapDef.size / 2) * scale;
          const y = (c.z + mapDef.size / 2) * scale;
          const rPx = c.r * scale;
          // dark filled circle for cave area
          ctx.fillStyle = "rgba(60,30,20,0.55)";
          ctx.beginPath(); ctx.arc(x, y, rPx, 0, Math.PI * 2); ctx.fill();
          // outline
          ctx.strokeStyle = "#7c2d12";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, rPx, 0, Math.PI * 2); ctx.stroke();
          // center cave-mouth icon
          ctx.fillStyle = "#fbbf24";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🕳", x, y);
        }
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
      // other players (friends shown in cyan/larger)
      for (const [sid, p] of room.state.players) {
        if (p.dead) continue;
        const x = (p.pos.x + mapDef.size / 2) * scale;
        const y = (p.pos.z + mapDef.size / 2) * scale;
        const isSelf = sid === room.sessionId;
        const isFriend = !isSelf && friends.has(p.name);
        const mountEmoji = p.mounted && p.petKind
          ? (p.petKind === "chicken" ? "🐔" : p.petKind === "pig" ? "🐷" : p.petKind === "cow" ? "🐮" : "")
          : "";
        if (mountEmoji) {
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(mountEmoji, x, y);
        } else {
          ctx.fillStyle = isSelf ? "#22c55e" : isFriend ? "#22d3ee" : "#60a5fa";
          ctx.beginPath(); ctx.arc(x, y, isSelf ? 3.5 : isFriend ? 3 : 2.5, 0, Math.PI * 2); ctx.fill();
        }
        if (isFriend) {
          // Friendly halo
          ctx.strokeStyle = "rgba(34,211,238,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
        }
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
  }, [room, mapId, mapDef, waypoint, friends]);

  // Clear any stale dragged position from localStorage (one-time migration).
  useEffect(() => {
    try { localStorage.removeItem("drag:minimap"); } catch {}
  }, []);

  return (
    <div className="pointer-events-auto select-none" style={{ width: SIZE }}>
      {/* Header sits on top of map (same dark navy bg as canvas) for legibility */}
      <div
        className="flex items-center justify-between px-1.5 py-0.5"
        style={{
          fontSize: 8,
          background: "#0f172a",
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          marginBottom: -1, // tuck into canvas top edge
        }}
      >
        <span className="text-cyan-100 font-semibold tracking-wider truncate">📍 {mapDef.name}</span>
        {waypoint && (
          <button
            onClick={() => setWaypoint(null)}
            className="text-rose-300 hover:text-rose-200"
            style={{ fontSize: 9 }}
            title={t("minimap.cancelRoute")}
          >✕</button>
        )}
      </div>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onClick={onMapClick}
          style={{
            display: "block",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5), inset 0 0 8px rgba(0,0,0,0.4)",
            cursor: "crosshair",
          }}
        />
        {/* Compass labels — N/E/S/W in the corners of the map */}
        <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-cyan-300 font-bold pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" style={{ fontSize: 8 }}>N</span>
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-cyan-300 font-bold pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" style={{ fontSize: 8 }}>S</span>
        <span className="absolute top-1/2 left-0.5 -translate-y-1/2 text-cyan-300 font-bold pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" style={{ fontSize: 8 }}>W</span>
        <span className="absolute top-1/2 right-0.5 -translate-y-1/2 text-cyan-300 font-bold pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" style={{ fontSize: 8 }}>E</span>
      </div>
    </div>
  );
}