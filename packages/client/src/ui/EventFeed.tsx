import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

type Entry = { id: number; text: string; color: string; born: number };
let UID = 0;

export function EventFeed({ room }: { room: Room<WorldState> }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const add = (text: string, color: string) => {
      setEntries((arr) => [...arr.slice(-7), { id: ++UID, text, color, born: Date.now() }]);
    };
    const off1 = room.onMessage("levelup" as any, (m: any) => {
      const name = m.name ?? (m.playerId === room.sessionId ? "You" : "Someone");
      add(`⭐ ${name} reached Lv ${m.level}!`, "#fde047");
    });
    const off2 = room.onMessage("questReward" as any, (m: any) => {
      add(`📜 Quest complete! +${m.exp}xp +${m.zeny}z`, "#86efac");
    });
    const off3 = room.onMessage("system" as any, (m: any) => {
      add(m.text ?? "", "#67e8f9");
    });
    return () => { off1?.(); off2?.(); off3?.(); };
  }, [room]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setEntries((arr) => arr.filter((e) => now - e.born < 6000));
    }, 500);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) return null;
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 space-y-0.5 pointer-events-none">
      {entries.map((e) => {
        const age = (Date.now() - e.born) / 6000;
        return (
          <div key={e.id} className="px-2 py-0.5 text-xs font-bold text-center"
            style={{ color: e.color, opacity: Math.max(0, 1 - age * 1.2), textShadow: "0 2px 0 #000, 0 0 8px rgba(0,0,0,0.8)" }}>
            {e.text}
          </div>
        );
      })}
    </div>
  );
}
