import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { keyEq } from "../utils/keyMatch";
import { useT } from "../locales/useT";

const EMOTE_IDS = [
  "wave", "heart", "laugh", "cry", "wow", "sleep",
  "dance", "thanks", "selfie", "yes", "no", "music",
] as const;

export function EmoteWheel({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "t")) setOpen((o) => !o);
      else if (e.key === "Escape" && open) setOpen(false);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", onKey);
    window.addEventListener("toggle-emote", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("toggle-emote", onToggle);
    };
  }, [open]);

  function play(emoteIcon: string) {
    room.send("emote", { emote: emoteIcon });
    setOpen(false);
  }

  const EMOTE_ICONS: Record<string, string> = {
    wave: "👋", heart: "💖", laugh: "😂", cry: "😭", wow: "😮", sleep: "😴",
    dance: "💃", thanks: "🙏", selfie: "📸", yes: "👍", no: "👎", music: "🎵",
  };

  return (
    <>
      {open && (
        <div
          data-no-screen-joy
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="grid grid-cols-4 gap-3 p-4 rounded-3xl"
            style={{
              background: "linear-gradient(180deg, rgba(255, 251, 235, 0.96), rgba(254, 215, 235, 0.96))",
              border: "3px solid #ffffff",
              boxShadow: "0 0 0 3px rgba(244,114,182,0.5), 0 12px 32px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {EMOTE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => play(EMOTE_ICONS[id])}
                onTouchStart={(ev) => { ev.preventDefault(); play(EMOTE_ICONS[id]); }}
                className="flex flex-col items-center gap-1 p-2 rounded-2xl bg-white/70 border-2 border-white hover:scale-110 active:scale-95 transition-transform"
                style={{ minWidth: 64 }}
              >
                <span className="text-3xl">{EMOTE_ICONS[id]}</span>
                <span className="text-[10px] font-bold text-pink-800">{t(`emote.${id}`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
