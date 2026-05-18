import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

/** Client-side full-screen overlays that reflect survival debuffs. */
export function SurvivalEffects({ room }: { room: Room<WorldState> }) {
  const [hunger, setHunger] = useState(100);
  const [thirst, setThirst] = useState(100);

  useEffect(() => {
    const id = setInterval(() => {
      const me = room.state.players.get(room.sessionId);
      if (!me) return;
      setHunger(me.hunger);
      setThirst(me.thirst);
    }, 400);
    return () => clearInterval(id);
  }, [room]);

  // Hunger: grayscale + slight desaturation when hungry
  const hungerOpacity = Math.max(0, (25 - hunger) / 25); // 0..1 as hunger drops below 25
  // Thirst: wavy hallucination border + tint when thirsty
  const thirstSeverity = Math.max(0, (25 - thirst) / 25); // 0..1

  return (
    <>
      {hungerOpacity > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
            filter: `grayscale(${hungerOpacity * 0.4})`,
            opacity: hungerOpacity * 0.6,
            transition: "opacity 0.6s, filter 0.6s",
          }}
        />
      )}
      {thirstSeverity > 0 && (
        <>
          <div
            className="absolute inset-0 pointer-events-none z-30"
            style={{
              background: "radial-gradient(ellipse at center, transparent 30%, rgba(168, 85, 247, 0.18) 100%)",
              boxShadow: "inset 0 0 80px rgba(168, 85, 247, 0.35)",
              opacity: thirstSeverity,
              animation: thirst <= 0 ? "thirstPulse 2.4s infinite" : undefined,
              transition: "opacity 0.6s",
            }}
          />
          {thirst <= 0 && (
            <div
              className="absolute inset-0 pointer-events-none z-30"
              style={{
                animation: "thirstWobble 4s infinite ease-in-out",
                backdropFilter: "blur(0.5px) hue-rotate(15deg)",
              }}
            />
          )}
        </>
      )}
      <style>{`
        @keyframes thirstPulse {
          0%, 100% { opacity: ${thirstSeverity}; }
          50% { opacity: ${Math.min(1, thirstSeverity * 1.5)}; }
        }
        @keyframes thirstWobble {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(1px, -1px); }
          50% { transform: translate(-1px, 1px); }
          75% { transform: translate(0, 2px); }
        }
      `}</style>
    </>
  );
}
