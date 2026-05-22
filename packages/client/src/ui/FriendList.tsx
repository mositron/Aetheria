// Friend list panel. Opens via menu (toggle-friends event).

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";

type Friend = { name: string; online: boolean };

export function FriendList({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [addName, setAddName] = useState("");
  const [busyAdd, setBusyAdd] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-friends", onToggle);
    const off = room.onMessage("friend:list" as any, (m: any) => {
      setFriends(m.friends ?? []);
    });
    const offAddOk = room.onMessage("friend:add:ok" as any, () => { setBusyAdd(false); setAddName(""); });
    const offAddErr = room.onMessage("friend:add:err" as any, () => setBusyAdd(false));
    return () => {
      window.removeEventListener("toggle-friends", onToggle);
      off?.();
      offAddOk?.();
      offAddErr?.();
    };
  }, [room]);

  // Auto-refresh when opened
  useEffect(() => {
    if (open) {
      room.send("friend:list" as any, {});
      refreshed.current = true;
    }
  }, [open, room]);

  if (!open) return null;
  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[22rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title={t("friend.title")}>
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="space-y-2 pt-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = addName.trim();
                if (!n) return;
                setBusyAdd(true);
                room.send("friend:add" as any, { name: n });
              }}
              className="flex gap-1"
            >
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t("friend.addPlaceholder")}
                className="flex-1 bg-slate-900/80 border border-cyan-400/40 rounded px-2 py-1 text-xs text-white"
                maxLength={20}
                disabled={busyAdd}
              />
              <button type="submit" disabled={busyAdd} className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded px-3 py-1 text-xs font-bold text-white">{busyAdd ? "..." : t("friend.addBtn")}</button>
            </form>

            <div className="max-h-64 overflow-y-auto game-scroll space-y-1">
              {friends.length === 0 && (
                <div className="text-slate-400 text-xs text-center py-4">{t("friend.empty")}</div>
              )}
              {friends.map((f) => (
                <div key={f.name} className="flex items-center gap-2 bg-slate-900/60 border border-white/10 rounded px-2 py-1.5">
                  <span className={`w-2 h-2 rounded-full ${f.online ? "bg-emerald-400" : "bg-slate-600"}`} title={f.online ? t("friend.onlineStatus") : t("friend.offlineStatus")} />
                  <div className="flex-1 text-xs font-bold text-white truncate">{f.name}</div>
                  {f.online && (
                    <button
                      onClick={() => room.send("whisper", { to: f.name, text: "Hi!" })}
                      className="bg-violet-700 hover:bg-violet-600 rounded px-2 py-0.5 text-[10px] font-bold text-white"
                    >💬 hi</button>
                  )}
                  <button
                    onClick={() => {
                      if (!confirm(t("friend.removeConfirm", { name: f.name }))) return;
                      room.send("friend:remove" as any, { name: f.name });
                    }}
                    className="bg-rose-700 hover:bg-rose-600 rounded px-2 py-0.5 text-[10px] font-bold text-white"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}
