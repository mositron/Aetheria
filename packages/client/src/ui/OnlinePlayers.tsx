// Compact online players panel — live list of human players in the current
// world room. Click a name → quick actions (whisper / invite to party).
//
// Toggle via window event "toggle-online" (wire to a HUD button or keybind).

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState, Player } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";

export function OnlinePlayers({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useExclusiveModal("online", open, setOpen);
  const [, force] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-online", onToggle);
    // Refresh list at 1Hz while open so newcomers/leavers reflect quickly
    let timer: ReturnType<typeof setInterval> | null = null;
    if (open) {
      timer = setInterval(() => force((n) => n + 1), 1000);
    }
    return () => {
      window.removeEventListener("toggle-online", onToggle);
      if (timer) clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;

  const mySid = room.sessionId;
  const rows: Array<{ sid: string; name: string; job: string; level: number; isMe: boolean }> = [];
  room.state.players.forEach((p: Player, sid: string) => {
    rows.push({
      sid,
      name: p.name,
      job: p.job ?? "novice",
      level: p.level ?? 1,
      isMe: sid === mySid,
    });
  });
  rows.sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : b.level - a.level));

  const whisper = (target: string) => {
    const text = prompt(t("online.whisperPrompt") || `Whisper to ${target}:`);
    if (text && text.trim()) {
      room.send("whisper" as any, { to: target, text: text.trim() });
    }
  };
  const inviteParty = (target: string) => {
    room.send("party:invite" as any, { targetName: target });
  };

  return (
    <div data-no-screen-joy className="zone-side-panel z-30 w-64 max-w-[88vw]">
      <GameFrame title={`${t("online.title") || "Online"} (${rows.length})`}>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
        >✕</button>
        <div className="space-y-1 pt-1 max-h-72 overflow-y-auto game-scroll">
          {rows.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-3">{t("online.empty") || "No one here"}</div>
          )}
          {rows.map((r) => (
            <div key={r.sid}>
              <button
                onClick={() => setSelected(selected === r.sid ? null : r.sid)}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition ${
                  r.isMe
                    ? "bg-cyan-900/40 border border-cyan-500/40"
                    : "bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700/60"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate flex-1">{r.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">Lv{r.level} {r.job}</span>
              </button>
              {selected === r.sid && !r.isMe && (
                <div className="flex gap-1 mt-1 pl-3">
                  <button
                    onClick={() => whisper(r.name)}
                    className="flex-1 text-[10px] bg-violet-700 hover:bg-violet-600 text-white py-1 rounded"
                  >💬 {t("online.whisper") || "Whisper"}</button>
                  <button
                    onClick={() => inviteParty(r.name)}
                    className="flex-1 text-[10px] bg-amber-700 hover:bg-amber-600 text-white py-1 rounded"
                  >🤝 {t("online.invite") || "Invite"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </GameFrame>
    </div>
  );
}
