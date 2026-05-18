// Friend list panel. Opens via menu (toggle-friends event).

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";

type Friend = { name: string; online: boolean };

export function FriendList({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [addName, setAddName] = useState("");
  const refreshed = useRef(false);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-friends", onToggle);
    const off = room.onMessage("friend:list" as any, (m: any) => {
      setFriends(m.friends ?? []);
    });
    return () => {
      window.removeEventListener("toggle-friends", onToggle);
      off?.();
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
    <div data-no-screen-joy className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[22rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title="🤝 เพื่อน">
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="space-y-2 pt-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = addName.trim();
                if (!n) return;
                room.send("friend:add" as any, { name: n });
                setAddName("");
              }}
              className="flex gap-1"
            >
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="ชื่อตัวละครที่อยากเพิ่ม"
                className="flex-1 bg-slate-900/80 border border-cyan-400/40 rounded px-2 py-1 text-xs text-white"
                maxLength={20}
              />
              <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 rounded px-3 py-1 text-xs font-bold text-white">+ เพิ่ม</button>
            </form>

            <div className="max-h-64 overflow-y-auto game-scroll space-y-1">
              {friends.length === 0 && (
                <div className="text-slate-400 text-xs text-center py-4">ยังไม่มีเพื่อน — เพิ่มเพื่อจะส่ง /w ได้สะดวก</div>
              )}
              {friends.map((f) => (
                <div key={f.name} className="flex items-center gap-2 bg-slate-900/60 border border-white/10 rounded px-2 py-1.5">
                  <span className={`w-2 h-2 rounded-full ${f.online ? "bg-emerald-400" : "bg-slate-600"}`} title={f.online ? "ออนไลน์" : "ออฟไลน์"} />
                  <div className="flex-1 text-xs font-bold text-white truncate">{f.name}</div>
                  {f.online && (
                    <button
                      onClick={() => room.send("whisper", { to: f.name, text: "Hi!" })}
                      className="bg-violet-700 hover:bg-violet-600 rounded px-2 py-0.5 text-[10px] font-bold text-white"
                    >💬 hi</button>
                  )}
                  <button
                    onClick={() => room.send("friend:remove" as any, { name: f.name })}
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
