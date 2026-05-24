// Combat log — small side panel showing recent damage events.
// Subscribes to "damage" room messages (server broadcasts on every hit).
// Toggle via "toggle-combat-log" window event.

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState, Player, Monster } from "@game/shared";
import { useStore } from "../store";
import { useExclusiveModal } from "../hooks/useExclusiveModal";

type Entry = {
  id: number;
  text: string;
  color: string;
  ts: number;
};

const MAX_ENTRIES = 20;

export function CombatLog({ room }: { room: Room<WorldState> }) {
  const sessionId = useStore((s) => s.sessionId);
  const [open, setOpen] = useState(false);
  useExclusiveModal("autoPotion" /* borrow slot — exclusive with modals but visible alongside */, false, () => {});
  const [entries, setEntries] = useState<Entry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-combat-log", onToggle);
    return () => window.removeEventListener("toggle-combat-log", onToggle);
  }, []);

  useEffect(() => {
    const off = room.onMessage("damage" as any, (m: any) => {
      // damage shape: { targetId, amount, from, crit?, heal? }
      const me = sessionId ? room.state.players.get(sessionId) : null;
      if (!me) return;

      const targetId = String(m?.targetId ?? "");
      const fromId   = String(m?.from ?? "");
      const amount   = Number(m?.amount ?? 0);
      const crit     = !!m?.crit;
      const heal     = !!m?.heal;
      const involvesMe = targetId === me.id || fromId === me.id;
      if (!involvesMe) return; // only log events we're part of

      const nameFor = (id: string): string => {
        if (id === me.id) return "You";
        for (const [, p] of room.state.players as Map<string, Player>) if (p.id === id) return p.name;
        for (const [, mn] of room.state.monsters as Map<string, Monster>) if (mn.id === id) return mn.kind;
        return id.startsWith("d_") ? "?" : id;
      };

      const tName = nameFor(targetId);
      const sName = nameFor(fromId);
      let text: string, color: string;
      if (heal) {
        text = `${sName} heals ${tName} +${Math.abs(amount)}`;
        color = "text-emerald-300";
      } else if (fromId === me.id) {
        text = `You hit ${tName} for ${amount}${crit ? " ⚡crit" : ""}`;
        color = crit ? "text-amber-300" : "text-slate-200";
      } else {
        text = `${sName} hit you for ${amount}${crit ? " ⚡crit" : ""}`;
        color = "text-rose-300";
      }
      setEntries((prev) => {
        const next = [...prev, { id: counter.current++, text, color, ts: Date.now() }];
        return next.slice(-MAX_ENTRIES);
      });
    });
    return () => { off?.(); };
  }, [room, sessionId]);

  if (!open) return null;
  return (
    <div
      data-no-screen-joy
      className="absolute z-30 pointer-events-auto"
      style={{
        right: "var(--hud-side)",
        bottom: "calc(var(--bottom-safe) + 0.5rem)",
        maxWidth: "min(18rem, 60vw)",
        width: "18rem",
      }}
    >
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(125,211,252,0.3)",
        }}
      >
        <div className="flex items-center justify-between px-2 py-1 border-b border-cyan-400/20">
          <span className="text-[10px] text-cyan-100 font-bold uppercase tracking-widest">⚔ Combat Log</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-rose-300 hover:text-rose-100 text-xs"
          >✕</button>
        </div>
        <div className="px-2 py-1 max-h-48 overflow-y-auto game-scroll text-[11px] space-y-0.5">
          {entries.length === 0 ? (
            <div className="text-slate-400 italic text-center py-2">No combat yet</div>
          ) : (
            entries.slice().reverse().map((e) => (
              <div key={e.id} className={e.color}>{e.text}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
