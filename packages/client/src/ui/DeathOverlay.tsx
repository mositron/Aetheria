import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

const RESPAWN_MS = 5000;

export function DeathOverlay({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  const [deathAt, setDeathAt] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const me = room.state.players.get(room.sessionId);
      if (me?.dead) {
        if (deathAt === null) setDeathAt(performance.now());
      } else if (deathAt !== null) {
        setDeathAt(null);
      }
    }, 100);
    return () => clearInterval(id);
  }, [room, deathAt]);

  const me = room.state.players.get(room.sessionId);
  if (!me?.dead || deathAt === null) return null;

  const elapsed = performance.now() - deathAt;
  const remaining = Math.max(0, RESPAWN_MS - elapsed);
  const remainingSec = Math.ceil(remaining / 1000);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        background: "radial-gradient(ellipse at center, rgba(127, 29, 29, 0.55) 0%, rgba(0,0,0,0.85) 70%)",
        animation: "fadeIn 0.4s ease-out",
      }}
    >
      {/* red vignette pulse */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: "inset 0 0 200px rgba(220, 38, 38, 0.6)",
          animation: "pulse 2s infinite",
        }}
      />
      <div className="text-center space-y-4 pointer-events-auto">
        <div
          className="text-7xl font-black tracking-[0.2em] bg-gradient-to-b from-rose-200 via-rose-400 to-rose-700 text-transparent bg-clip-text drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]"
          style={{ animation: "deathDrop 0.6s ease-out" }}
        >
          คุณตายแล้ว
        </div>
        <div className="text-rose-300/80 text-sm italic">"ทุกผู้กล้าล้วนล้มเหลว... แต่ลุกขึ้นมาใหม่ได้เสมอ"</div>
        <div className="text-cyan-300 text-lg mt-6">
          ฟื้นใน <span className="text-5xl font-black text-white">{remainingSec}</span>
        </div>
        <div className="w-64 h-1.5 mx-auto bg-black/60 border border-rose-500/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
            style={{ width: `${(1 - remaining / RESPAWN_MS) * 100}%` }}
          />
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes deathDrop {
          from { transform: translateY(-40px) scale(0.8); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
