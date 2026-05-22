import { useEffect, useRef, useState, useCallback } from "react";
import type { Room } from "colyseus.js";
import type { WorldState, MapId } from "@game/shared";
import { drawCharacter, drawMonster, drawTile, drawName, type Direction } from "./SpriteRenderer";
import { stringToColor } from "./Sprite2DContext";
import { useStore } from "../store";

/** Ground tile colors per biome */
const BIOME_COLORS: Record<string, [string, number][]> = {
  field: [
    ["#5a8f3e", 0], ["#4a7a32", 1], ["#6a9f4e", 2], ["#3d6b2a", 3],
  ],
  swamp: [
    ["#4a5a2e", 0], ["#3a4a22", 1], ["#5a6a3e", 2], ["#2a3a1a", 3],
  ],
  dungeon: [
    ["#2a2a3a", 0], ["#1a1a2a", 1], ["#3a3a4a", 2], ["#222233", 3],
  ],
  snow: [
    ["#dce8f0", 0], ["#c8d8e8", 1], ["#e8f0f8", 2], ["#b8c8d8", 3],
  ],
  desert: [
    ["#c8a860", 0], ["#b89850", 1], ["#d8b870", 2], ["#a88840", 3],
  ],
  forest: [
    ["#3a6a2e", 0], ["#2a5a22", 1], ["#4a7a3e", 2], ["#1a4a1a", 3],
  ],
};

function getBiomeColors(mapId: string): [string, number][] {
  return BIOME_COLORS[mapId] ?? BIOME_COLORS.field;
}

interface Sprite2DViewProps {
  room: Room<WorldState>;
  mapId: MapId;
}

/**
 * Top-down 2D sprite renderer using HTML5 Canvas.
 * Uses requestAnimationFrame for smooth updates and subscribes directly to
 * Colyseus room state without React re-renders.
 */
export function Sprite2DRenderer({ room, mapId }: Sprite2DViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<0 | 1>(0);
  const entitiesRef = useRef<Map<string, any>>(new Map());
  const cameraRef = useRef({ x: 0, z: 0 });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const lastAnimRef = useRef(0);

  const sessionId = useStore((s) => s.sessionId);

  // Walk animation timer — toggle frame every 150ms
  useEffect(() => {
    const interval = setInterval(() => {
      animFrameRef.current = animFrameRef.current === 0 ? 1 : 0;
    }, 150);
    return () => clearInterval(interval);
  }, []);

  // Track container size
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  const updateDims = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    }
  }, []);

  useEffect(() => {
    updateDims();
    const ro = new ResizeObserver(updateDims);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", updateDims);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDims);
    };
  }, [updateDims]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    const TILE = 32;
    const biomeColors = getBiomeColors(mapId);
    const tileColorCount = biomeColors.length;

    // Sync entities from room state
    const syncEntities = () => {
      const me = room.state.players.get(sessionId);
      if (me) {
        cameraRef.current.x = me.x ?? 0;
        cameraRef.current.z = me.z ?? 0;
      }

      const newEntities = new Map<string, any>();
      room.state.players.forEach((p, sid) => {
        if (sid === sessionId) return;
        newEntities.set(sid, {
          x: p.x ?? 0,
          z: p.z ?? 0,
          name: p.name ?? "???",
          isPlayer: true,
          color: stringToColor(p.name ?? sid),
          dir: ((p as any).direction as Direction) ?? "down",
        });
      });

      const monsters = (room.state as any).monsters as Map<string, any> | undefined;
      monsters?.forEach?.((m: any, mid: string) => {
        newEntities.set(mid, {
          x: m.x ?? 0,
          z: m.z ?? 0,
          name: m.name ?? "Monster",
          isPlayer: false,
          color: stringToColor(mid),
          type: (m as any).type ?? 0,
          dir: "down" as Direction,
        });
      });

      entitiesRef.current = newEntities;
    };

    syncEntities();
    room.onStateChange(syncEntities);

    let playerDir: Direction = "down";

    function render(ts: number) {
      const { w, h } = dims;
      canvas.width = w;
      canvas.height = h;

      // Throttle to ~60fps
      if (ts - lastTimeRef.current < 14) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastTimeRef.current = ts;

      const cameraX = cameraRef.current.x;
      const cameraZ = cameraRef.current.z;

      // Get player direction from latest state
      const me = room.state.players.get(sessionId);
      if (me) {
        playerDir = ((me as any).direction as Direction) ?? "down";
      }

      // Clear with dark background
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, 0, w, h);

      const tilesX = Math.ceil(w / TILE) + 2;
      const tilesY = Math.ceil(h / TILE) + 2;
      const worldMinX = cameraX - w / 2;
      const worldMinZ = cameraZ - h / 2;

      // Draw ground tiles
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const wx = worldMinX + tx * TILE;
          const wz = worldMinZ + ty * TILE;
          const variant = Math.abs(Math.floor(wx * 0.13 + wz * 0.47)) % tileColorCount;
          const [color] = biomeColors[variant];
          const sx = Math.round(wx - cameraX + w / 2);
          const sy = Math.round(wz - cameraZ + h / 2);
          drawTile(ctx, sx, sy, color, variant, TILE);
        }
      }

      // Collect + sort entities by Z for depth
      const entities = entitiesRef.current;
      const sorted = Array.from(entities.entries()).sort(([, a], [, b]) => a.z - b.z);

      const frame = animFrameRef.current;

      for (const [, entity] of sorted) {
        const sx = Math.round(entity.x - cameraX + w / 2);
        const sy = Math.round(entity.z - cameraZ + h / 2);

        if (entity.isPlayer) {
          drawCharacter(ctx, sx, sy, entity.dir ?? "down", frame, entity.color, 1.2);
          drawName(ctx, sx, sy, entity.name, true, 1.2);
        } else {
          drawMonster(ctx, sx, sy, entity.type ?? 0, frame, 1.2);
          drawName(ctx, sx, sy, entity.name, false, 1.2);
        }
      }

      // Draw player centered
      const px = w / 2;
      const py = h / 2;
      const playerColor = me ? stringToColor(me.name ?? sessionId) : "#60a5fa";
      drawCharacter(ctx, px, py, playerDir, frame, playerColor, 1.2);
      if (me?.name) {
        drawName(ctx, px, py, me.name, true, 1.2);
      }

      // Minimap overlay — bottom-right
      drawMinimap(ctx, w, h, cameraX, cameraZ, room, sessionId);

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      room.onStateChange.remove(syncEntities);
    };
  }, [room, sessionId, mapId, dims]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

/** Simple minimap in the bottom-right corner */
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  camX: number,
  camZ: number,
  room: Room<WorldState>,
  sessionId: string | null
) {
  const size = 120;
  const mx = canvasWidth - size - 12;
  const my = canvasHeight - size - 12;

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(mx, my, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, size, size);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("MAP", mx + size / 2, my + 10);

  const mapSize = 200;
  const half = mapSize / 2;

  const toMinimap = (wx: number, wz: number) => ({
    px: mx + ((wx + half) / mapSize) * size,
    py: my + ((wz + half) / mapSize) * size,
  });

  room.state.players.forEach((p, sid) => {
    const { px, py } = toMinimap(p.x ?? 0, p.z ?? 0);
    ctx.fillStyle = sid === sessionId ? "#60a5fa" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(px, py, sid === sessionId ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const monsters = (room.state as any).monsters as Map<string, any> | undefined;
  monsters?.forEach?.((m: any) => {
    const { px, py } = toMinimap(m.x ?? 0, m.z ?? 0);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  const { px: ccx, py: ccy } = toMinimap(camX, camZ);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ccx - 4, ccy);
  ctx.lineTo(ccx + 4, ccy);
  ctx.moveTo(ccx, ccy - 4);
  ctx.lineTo(ccx, ccy + 4);
  ctx.stroke();
}