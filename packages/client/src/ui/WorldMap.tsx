// Full-screen world map — shows biomes, caves, NPCs, lake, village, and
// the player's position. Click to set a waypoint. Toggle via "M" key or
// "toggle-world-map" event.

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { MAPS, NPCS, CAVES, BIOMES, biomeAt, QUESTS, MONSTER_DROPS, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";
import { useQuests } from "../hooks/useQuests";
import { keyEq } from "../utils/keyMatch";

const CANVAS_SIZE = 560; // logical px; CSS scales it

export function WorldMap({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useExclusiveModal("worldMap", open, setOpen);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setWaypoint = useStore((s) => s.setWaypoint);
  const quests = useQuests(room);
  const [showQuestMarkers, setShowQuestMarkers] = useState(true);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "m")) setOpen((o) => !o);
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("toggle-world-map", onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("toggle-world-map", onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Draw the map. Re-draw on open + every 600ms while open (for player dot).
  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const mapDef = MAPS.field;
    const size = mapDef.size;
    const half = size / 2;
    const scale = CANVAS_SIZE / size;
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // ── 1) Biome heatmap (sampled grid) ──
      const cells = 80;
      const cellSize = CANVAS_SIZE / cells;
      for (let iy = 0; iy < cells; iy++) {
        for (let ix = 0; ix < cells; ix++) {
          const wx = (ix / cells) * size - half;
          const wz = (iy / cells) * size - half;
          const biome = biomeAt(wx, wz, half);
          ctx.fillStyle = BIOMES[biome].ground;
          ctx.fillRect(ix * cellSize, iy * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }

      // ── 2) Lake circle ──
      for (const w of (mapDef.waters ?? [])) {
        const x = (w.x + half) * scale;
        const y = (w.z + half) * scale;
        ctx.fillStyle = "rgba(56,189,248,0.55)";
        ctx.beginPath(); ctx.arc(x, y, w.radius * scale, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#0c4a6e";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#0c4a6e";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🏞 ทะเลสาบใส", x, y + 4);
      }

      // ── 3) Village marker at center ──
      const vx = half * scale;
      const vy = half * scale;
      ctx.fillStyle = "rgba(251,191,36,0.45)";
      ctx.beginPath(); ctx.arc(vx, vy, 10 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#451a03";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🏘 หมู่บ้าน Aetheria", vx, vy - 12);

      // ── 4) Caves with names ──
      for (const cave of CAVES) {
        const cx = (cave.x + half) * scale;
        const cy = (cave.z + half) * scale;
        const rPx = cave.r * scale;
        // Mouth direction = toward village (origin). atan2 in canvas space:
        //   world x = canvas x; world z = canvas y; village is at (vx, vy).
        const mouthAngle = Math.atan2(vy - cy, vx - cx);
        const gapHalf = Math.PI / 7; // ~26° opening
        // dark filled disc
        ctx.fillStyle = "rgba(40,20,12,0.78)";
        ctx.beginPath(); ctx.arc(cx, cy, rPx, 0, Math.PI * 2); ctx.fill();
        // outline as an arc with a gap at the mouth
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, mouthAngle + gapHalf, mouthAngle - gapHalf + Math.PI * 2);
        ctx.stroke();
        // Mouth markers — two arch boulders at the gap edges + gold line across
        const mx1 = cx + Math.cos(mouthAngle + gapHalf) * rPx;
        const my1 = cy + Math.sin(mouthAngle + gapHalf) * rPx;
        const mx2 = cx + Math.cos(mouthAngle - gapHalf) * rPx;
        const my2 = cy + Math.sin(mouthAngle - gapHalf) * rPx;
        // gold "entry" line across the opening
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(mx1, my1);
        ctx.lineTo(mx2, my2);
        ctx.stroke();
        // two boulder dots at the arch pillars
        ctx.fillStyle = "#78350f";
        ctx.beginPath(); ctx.arc(mx1, my1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx2, my2, 3, 0, Math.PI * 2); ctx.fill();
        // arrow from mouth pointing outward (the way you'd walk to enter)
        const entryX = cx + Math.cos(mouthAngle) * (rPx + 6);
        const entryY = cy + Math.sin(mouthAngle) * (rPx + 6);
        const midX = cx + Math.cos(mouthAngle) * rPx;
        const midY = cy + Math.sin(mouthAngle) * rPx;
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(entryX, entryY);
        ctx.stroke();
        // small arrowhead
        const ah = 4;
        const perpX = -Math.sin(mouthAngle);
        const perpY = Math.cos(mouthAngle);
        ctx.fillStyle = "#fde047";
        ctx.beginPath();
        ctx.moveTo(entryX, entryY);
        ctx.lineTo(entryX - Math.cos(mouthAngle) * ah + perpX * ah * 0.6, entryY - Math.sin(mouthAngle) * ah + perpY * ah * 0.6);
        ctx.lineTo(entryX - Math.cos(mouthAngle) * ah - perpX * ah * 0.6, entryY - Math.sin(mouthAngle) * ah - perpY * ah * 0.6);
        ctx.closePath();
        ctx.fill();
        // cave icon
        ctx.font = `${Math.max(14, rPx * 0.5)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fde047";
        ctx.fillText("🕳", cx, cy + 2);
        // name label below
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#0a0a0a";
        ctx.fillText(cave.name, cx + 1, cy + rPx + 13);
        ctx.fillStyle = "#fef3c7";
        ctx.fillText(cave.name, cx, cy + rPx + 12);
      }

      // ── 5) NPCs ──
      ctx.font = "bold 10px sans-serif";
      for (const n of NPCS) {
        if (n.mapId !== "field") continue;
        const x = (n.x + half) * scale;
        const y = (n.z + half) * scale;
        ctx.fillStyle = n.kind === "shop" ? "#fbbf24" : "#a855f7";
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Label slightly offset right so it doesn't sit on top of the dot
        ctx.fillStyle = "#0a0a0a";
        ctx.textAlign = "left";
        ctx.fillText(`${n.icon} ${n.name}`, x + 8, y + 4);
      }

      // ── 5.5) Quest markers (active objectives) ──
      let nearestObj: { x: number; y: number; dist: number } | null = null;
      if (showQuestMarkers) {
        const me0 = room.state.players.get(room.sessionId);
        const meWx = me0 ? me0.pos.x : 0;
        const meWz = me0 ? me0.pos.z : 0;
        const MAX_DOTS_PER_QUEST = 5;
        const targetCoords: Array<{ wx: number; wz: number }> = [];
        for (const qid of Object.keys(quests.active)) {
          const def = QUESTS[qid];
          if (!def) continue;
          const obj = def.objective;
          const perQuest: Array<{ wx: number; wz: number; d: number }> = [];
          if (obj.kind === "kill") {
            for (const s of mapDef.spawns) {
              if (s.kind === obj.monster) perQuest.push({ wx: s.x, wz: s.z, d: Math.hypot(s.x - meWx, s.z - meWz) });
            }
          } else if (obj.kind === "collect") {
            const sources = new Set<string>();
            for (const [mk, drops] of Object.entries(MONSTER_DROPS)) {
              if (drops.some((d) => d.itemId === obj.itemId)) sources.add(mk);
            }
            for (const s of mapDef.spawns) {
              if (sources.has(s.kind)) perQuest.push({ wx: s.x, wz: s.z, d: Math.hypot(s.x - meWx, s.z - meWz) });
            }
          }
          // Keep only the N nearest spawns per quest — keeps map readable.
          perQuest.sort((a, b) => a.d - b.d);
          for (const p of perQuest.slice(0, MAX_DOTS_PER_QUEST)) {
            targetCoords.push({ wx: p.wx, wz: p.wz });
          }
        }
        // Draw red dots
        for (const t of targetCoords) {
          const x = (t.wx + half) * scale;
          const y = (t.wz + half) * scale;
          // pulsing red
          const pulse = (Date.now() % 1000) / 1000;
          ctx.fillStyle = "rgba(239,68,68,0.85)";
          ctx.beginPath(); ctx.arc(x, y, 4 + pulse * 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#7f1d1d";
          ctx.lineWidth = 1;
          ctx.stroke();
          const d = Math.hypot(t.wx - meWx, t.wz - meWz);
          if (!nearestObj || d < nearestObj.dist) nearestObj = { x, y, dist: d };
        }
      }

      // ── 6) Other players ──
      for (const [sid, p] of room.state.players) {
        if (p.dead) continue;
        if (sid === room.sessionId) continue;
        const x = (p.pos.x + half) * scale;
        const y = (p.pos.z + half) * scale;
        const mountEmoji = p.mounted && p.petKind
          ? (p.petKind === "chicken" ? "🐔" : p.petKind === "pig" ? "🐷" : p.petKind === "cow" ? "🐮" : "")
          : "";
        if (mountEmoji) {
          ctx.font = "14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(mountEmoji, x, y);
        } else {
          ctx.fillStyle = "#60a5fa";
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // ── 7) Self (green arrow showing facing) ──
      const me = room.state.players.get(room.sessionId);
      if (me) {
        const sx = (me.pos.x + half) * scale;
        const sy = (me.pos.z + half) * scale;
        const meMount = me.mounted && me.petKind
          ? (me.petKind === "chicken" ? "🐔" : me.petKind === "pig" ? "🐷" : me.petKind === "cow" ? "🐮" : "")
          : "";
        if (meMount) {
          ctx.font = "16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(meMount, sx, sy);
        } else {
          ctx.fillStyle = "#22c55e";
          ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#052e1a";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // direction arrow
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.sin(me.rotY) * 14, sy + Math.cos(me.rotY) * 14);
        ctx.stroke();
        // "You are here" label
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#052e1a";
        ctx.textAlign = "center";
        ctx.fillText("← คุณอยู่ตรงนี้", sx + 22, sy - 4);
        // Dashed line to nearest quest objective
        if (nearestObj) {
          ctx.strokeStyle = "#f472b6";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(nearestObj.x, nearestObj.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── 8) Compass ──
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.textAlign = "center";
      ctx.fillText("N", CANVAS_SIZE / 2, 18);
      ctx.fillText("S", CANVAS_SIZE / 2, CANVAS_SIZE - 6);
      ctx.fillText("W", 12, CANVAS_SIZE / 2 + 6);
      ctx.fillText("E", CANVAS_SIZE - 12, CANVAS_SIZE / 2 + 6);

      raf = window.setTimeout(draw, 600) as unknown as number;
    };
    draw();
    return () => clearTimeout(raf);
  }, [open, room, quests, showQuestMarkers]);

  if (!open) return null;

  return (
    <div
      data-no-screen-joy
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{
        paddingTop: "calc(var(--hud-top) + 0.5rem)",
        paddingBottom: "calc(var(--bottom-safe) + 0.5rem)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        className="bg-slate-900 border-2 border-cyan-400/60 rounded-2xl p-3 flex flex-col items-center gap-2"
        style={{ maxWidth: "min(92vw, 620px)", maxHeight: "100%" }}
      >
        <div className="w-full flex items-center justify-between gap-2">
          <span className="text-cyan-100 font-bold text-sm tracking-widest">🗺 {t("worldMap.title") || "แผนที่โลก"} — Aetheria</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuestMarkers((v) => !v)}
              className={`text-[10px] px-2 py-1 rounded-full border ${showQuestMarkers ? "bg-rose-600/30 border-rose-400 text-rose-100" : "bg-slate-800 border-slate-600 text-slate-400"}`}
              title="Toggle quest markers"
            >🔴 เควสต์</button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="w-7 h-7 rounded-full bg-rose-700 hover:bg-rose-600 text-white font-bold flex items-center justify-center"
            >✕</button>
          </div>
        </div>
        <div className="relative" style={{ width: "min(88vw, 560px)", aspectRatio: "1" }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            onClick={(e) => {
              const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
              const px = (e.clientX - rect.left) / rect.width * CANVAS_SIZE;
              const py = (e.clientY - rect.top)  / rect.height * CANVAS_SIZE;
              const half = MAPS.field.size / 2;
              const scale = CANVAS_SIZE / MAPS.field.size;
              const wx = px / scale - half;
              const wz = py / scale - half;
              setWaypoint({ x: wx, z: wz, label: t("worldMap.pinHere") || "หมุดบนแผนที่", icon: "📍" });
              setOpen(false);
            }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "0.75rem",
              cursor: "crosshair",
              boxShadow: "0 4px 20px rgba(0,0,0,0.6), inset 0 0 16px rgba(0,0,0,0.5)",
            }}
          />
        </div>
        <div className="text-[10px] text-slate-400 text-center">
          {t("worldMap.hint") || "คลิกเพื่อตั้งหมุด · กด M ปิด/เปิด · 🕳 = ถ้ำ · 🏘 = หมู่บ้าน"}
        </div>
      </div>
    </div>
  );
}
