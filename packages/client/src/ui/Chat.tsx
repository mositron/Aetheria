import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useStore } from "../store";
import { useDraggable } from "../hooks/useDraggable";

export function Chat({ room }: { room: Room<WorldState> }) {
  const chat = useStore((s) => s.chat);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useDraggable("chat");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !open) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
        setText("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) { setOpen(false); return; }
    // /w PLAYER message → whisper
    const wm = t.match(/^\/w\s+(\S+)\s+(.+)$/);
    if (wm) {
      room.send("whisper", { to: wm[1], text: wm[2] });
    } else {
      room.send("chat", { text: t });
    }
    setText("");
    setOpen(false);
  }

  // Show only the last 3 messages when collapsed, expand to 6 when open.
  // Placed above joystick zone so it doesn't overlap touch controls or hint.
  const recent = chat.slice(-(open ? 6 : 3));
  return (
    <div
      ref={drag.elRef}
      className="absolute z-20 pointer-events-none select-none"
      style={{ left: 12, bottom: 14 * 16, width: 240, ...drag.style }} // bottom: 14rem
    >
      <div className="pointer-events-auto">
        {recent.length > 0 && (
          <div className="bg-black/55 backdrop-blur-md border border-cyan-400/30 rounded-xl px-2 py-1.5 mb-1 text-[11px] space-y-0.5 max-h-32 overflow-y-auto game-scroll">
            {recent.map((m, i) => (
              <div key={i} className="truncate"><span className="text-amber-300 font-semibold">{m.from}:</span> {m.text}</div>
            ))}
          </div>
        )}
        {open ? (
          <form onSubmit={send}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder="พิมพ์... (Esc=ปิด · /w ชื่อ ข้อความ=กระซิบ)"
              className="w-full bg-slate-900/80 backdrop-blur-md border border-cyan-400/40 rounded-full px-3 py-1 text-xs outline-none text-white"
            />
          </form>
        ) : (
          <button
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            onTouchStart={(e) => { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="text-[10px] text-cyan-300/70 bg-black/40 backdrop-blur-md border border-cyan-400/20 rounded-full px-3 py-1"
          >
            💬 พิมพ์แชต (Enter)
          </button>
        )}
      </div>
    </div>
  );
}
