import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useStore } from "../store";
import { useDraggable } from "../hooks/useDraggable";
import { useT } from "../locales/useT";

export function Chat({ room }: { room: Room<WorldState> }) {
  const t = useT();
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
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll if the user is already near the bottom. If they've
    // scrolled up to read history, leave their position alone — otherwise
    // every incoming message yanks them away from what they're reading.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight });
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
      style={{
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "clamp(8rem, 18vh, 11rem)",
        width: "clamp(200px, 60vw, 280px)",
        ...drag.style,
      }}
    >
      <div className="pointer-events-auto">
        {/* Always-visible translucent chat panel — shows recent msgs or a hint. */}
        <div
          ref={scrollRef}
          className="rounded-xl px-2 py-1.5 mb-1 text-[11px] space-y-0.5 max-h-32 overflow-y-auto game-scroll backdrop-blur-sm"
          style={{
            background: "rgba(0, 0, 0, 0.22)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            minHeight: 28,
          }}
          onClick={() => { if (!open) { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); } }}
        >
          {recent.length > 0 ? (
            recent.map((m, i) => (
              // Keying by (ts, from) survives the chat[]-truncated-to-50 rotation
              // in the store. Pure index would alias old/new rows after rollover
              // and trick React into reusing the wrong DOM node.
              <div key={`${m.ts}-${m.from}-${i}`} className="truncate"><span className="text-amber-300 font-semibold">{m.from}:</span> <span className="text-white/90">{m.text}</span></div>
            ))
          ) : (
            <div className="text-white/45 italic text-[10px]">{t("chat.noMessages")}</div>
          )}
        </div>
        {open ? (
          <form onSubmit={send}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder={t("chat.placeholder")}
              className="w-full bg-slate-900/70 backdrop-blur-md border border-cyan-400/40 rounded-full px-3 py-1 text-xs outline-none text-white"
              autoFocus
              onBlur={() => { if (!text.trim()) setOpen(false); }}
            />
          </form>
        ) : (
          <button
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            onTouchStart={(e) => { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="block w-full text-center text-[10px] text-cyan-300/80 rounded-full px-3 py-1 backdrop-blur-sm"
            style={{
              background: "rgba(0, 0, 0, 0.22)",
              border: "1px solid rgba(34, 211, 238, 0.18)",
            }}
          >
            {t("chat.clickToType")}
          </button>
        )}
      </div>
    </div>
  );
}
