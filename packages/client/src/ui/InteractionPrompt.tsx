import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { MAPS, type WorldState, type MapId } from "@game/shared";
import { keyEq } from "../utils/keyMatch";

type FishingState = "idle" | "casting" | "done";

/** Floating contextual prompts: drink water + cast fishing line when near water. */
export function InteractionPrompt({ room }: { room: Room<WorldState> }) {
  const [near, setNear] = useState<"water" | null>(null);
  const [fishing, setFishing] = useState<FishingState>("idle");
  const [castEnd, setCastEnd] = useState<number>(0);
  const tickRef = useRef<number | null>(null);

  // proximity polling
  useEffect(() => {
    const id = setInterval(() => {
      const me = room.state.players.get(room.sessionId);
      if (!me) return setNear(null);
      const mapDef = MAPS[room.state.mapId as MapId];
      const waters = mapDef.waters ?? [];
      for (const w of waters) {
        if (Math.hypot(me.pos.x - w.x, me.pos.z - w.z) < w.radius + 1) {
          return setNear("water");
        }
      }
      setNear(null);
    }, 250);
    return () => clearInterval(id);
  }, [room]);

  // server fishing events
  useEffect(() => {
    const off = room.onMessage("fishing" as any, (m: any) => {
      if (m.state === "casting") {
        setFishing("casting");
        setCastEnd(performance.now() + (m.remainingMs ?? 5000));
      } else if (m.state === "done") {
        setFishing("done");
        setTimeout(() => setFishing("idle"), 1200);
      } else if (m.state === "cancelled") {
        setFishing("idle");
      }
    });
    return () => off?.();
  }, [room]);

  // re-render during cast for progress
  useEffect(() => {
    if (fishing !== "casting") return;
    const id = setInterval(() => { if (tickRef.current !== null) tickRef.current++; setCastEnd((v) => v); }, 250);
    return () => clearInterval(id);
  }, [fishing]);

  // hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (near !== "water") return;
      if (keyEq(e, "e")) room.send("drink", {});
      if (keyEq(e, "f") && fishing === "idle") room.send("startFishing", {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [near, room, fishing]);

  if (!near && fishing === "idle") return null;

  const remaining = Math.max(0, castEnd - performance.now());
  const totalMs = 8000;
  const progress = fishing === "casting" ? Math.min(1, 1 - remaining / totalMs) : 0;

  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 pointer-events-none select-none flex flex-col items-center gap-2">
      {fishing === "casting" ? (
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <div className="text-cyan-100 text-xs uppercase tracking-widest animate-pulse">🎣 รอปลากัดเบ็ด...</div>
          <div className="w-48 h-2 bg-black/70 border border-cyan-400/40 rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress * 100}%`,
                background: "linear-gradient(90deg, #22d3ee 0%, #0ea5e9 50%, #0284c7 100%)",
                boxShadow: "0 0 12px rgba(34, 211, 238, 0.6)",
              }}
            />
          </div>
          <button
            onClick={() => room.send("stopFishing", {})}
            onTouchStart={(e) => { e.preventDefault(); room.send("stopFishing", {}); }}
            className="px-4 py-2 rounded bg-rose-700/80 hover:bg-rose-600 border-2 border-rose-400 text-white font-bold text-sm"
          >
            ✕ ยกเลิก
          </button>
        </div>
      ) : fishing === "done" ? (
        <div className="text-amber-300 font-bold text-lg animate-bounce">🎉 ตกได้แล้ว!</div>
      ) : near === "water" && (
        <div className="pointer-events-auto flex flex-col items-center gap-1.5">
          <div className="text-cyan-100 text-xs uppercase tracking-widest animate-pulse">น้ำใสสะอาด</div>
          <div className="flex gap-2">
            <button
              onClick={() => room.send("drink", {})}
              onTouchStart={(e) => { e.preventDefault(); room.send("drink", {}); }}
              className="relative active:scale-95 transition-transform"
              style={{
                padding: "10px 22px",
                borderRadius: 8,
                background: "radial-gradient(circle at 30% 30%, #67e8f9 0%, #0891b2 60%, #164e63 100%)",
                border: "2px solid #22d3ee",
                color: "#fff", fontWeight: 700, fontSize: 16,
                textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                boxShadow: "0 0 16px rgba(34,211,238,0.6), inset 0 2px 4px rgba(255,255,255,0.3)",
              }}
            >
              💧 ดื่ม <span className="text-[10px] opacity-70">(E)</span>
            </button>
            <button
              onClick={() => room.send("startFishing", {})}
              onTouchStart={(e) => { e.preventDefault(); room.send("startFishing", {}); }}
              className="relative active:scale-95 transition-transform"
              style={{
                padding: "10px 22px",
                borderRadius: 8,
                background: "radial-gradient(circle at 30% 30%, #34d399 0%, #047857 60%, #064e3b 100%)",
                border: "2px solid #34d399",
                color: "#fff", fontWeight: 700, fontSize: 16,
                textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                boxShadow: "0 0 16px rgba(52,211,153,0.6), inset 0 2px 4px rgba(255,255,255,0.3)",
              }}
            >
              🎣 ตกปลา <span className="text-[10px] opacity-70">(F)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
