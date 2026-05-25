import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useT } from "../locales/useT";

type Entry = { id: number; text: string; color: string; born: number; severity: "info" | "warn" | "error" };
let UID = 0;

export function EventFeed({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const add = (text: string, color: string, severity: Entry["severity"] = "info") => {
      setEntries((arr) => [...arr.slice(-7), { id: ++UID, text, color, born: Date.now(), severity }]);
    };
    const off1 = room.onMessage("levelup" as any, (m: any) => {
      const name = m.name ?? (m.playerId === room.sessionId ? t("eventfeed.you") : t("eventfeed.someone"));
      add(t("eventfeed.levelUp", { name, level: m.level }), "#fde047", "info");
    });
    const off2 = room.onMessage("questReward" as any, (m: any) => {
      add(t("eventfeed.questComplete", { exp: m.exp, zeny: m.zeny }), "#86efac", "info");
    });
    const off3 = room.onMessage("system" as any, (m: any) => {
      const sev = m.severity ?? "info";
      const color = sev === "error" ? "#f87171" : sev === "warn" ? "#fbbf24" : "#67e8f9";
      add(m.text ?? "", color, sev);
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
    <div aria-live="polite" className="absolute top-28 left-1/2 -translate-x-1/2 space-y-0.5 pointer-events-none z-20">
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
