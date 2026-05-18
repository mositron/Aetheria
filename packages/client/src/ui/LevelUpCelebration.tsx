import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

export function LevelUpCelebration({ room }: { room: Room<WorldState> }) {
  const [show, setShow] = useState<{ level: number } | null>(null);

  useEffect(() => {
    const off = room.onMessage("levelup" as any, (m: any) => {
      if (m.playerId !== room.sessionId) return;
      setShow({ level: m.level });
      setTimeout(() => setShow(null), 2800);
    });
    return () => off?.();
  }, [room]);

  if (!show) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none select-none">
      <div
        className="relative px-12 py-6 rounded-3xl text-center"
        style={{
          background: "linear-gradient(180deg, rgba(255,251,235,0.95) 0%, rgba(253,224,71,0.95) 100%)",
          border: "4px solid #ffffff",
          boxShadow: "0 0 0 4px rgba(251,191,36,0.6), 0 0 60px rgba(251,191,36,0.7), 0 12px 40px rgba(0,0,0,0.5)",
          animation: "lvlBurst 1.6s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
        }}
      >
        <div className="text-amber-700 text-sm font-black tracking-[0.3em] uppercase">Level Up!</div>
        <div className="text-7xl font-black text-amber-900" style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))" }}>
          ⭐ Lv {show.level}
        </div>
        <div className="text-amber-700 text-xs italic mt-1">เก่งขึ้นแล้ว!</div>

        {/* sparkles */}
        {[
          { x: "-1rem", y: "-1rem", emoji: "✨", delay: 0 },
          { x: "calc(100% - 1rem)", y: "-1.5rem", emoji: "⭐", delay: 0.2 },
          { x: "-1.5rem", y: "calc(100% - 1rem)", emoji: "🌟", delay: 0.4 },
          { x: "calc(100% - 1rem)", y: "calc(100% - 1rem)", emoji: "✨", delay: 0.6 },
        ].map((s, i) => (
          <div
            key={i}
            className="absolute text-3xl"
            style={{
              left: s.x, top: s.y,
              transform: "translate(-50%, -50%)",
              animation: `sparkle 1.4s ${s.delay}s infinite`,
            }}
          >
            {s.emoji}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes lvlBurst {
          0%   { transform: scale(0.3) rotate(-12deg); opacity: 0; }
          30%  { transform: scale(1.15) rotate(4deg); opacity: 1; }
          50%  { transform: scale(0.95) rotate(-2deg); }
          70%  { transform: scale(1) rotate(0); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes sparkle {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0); opacity: 1; }
          50%      { transform: translate(-50%, -50%) scale(1.4) rotate(20deg); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
