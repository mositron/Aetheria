// Sequential onboarding for new characters — 5 small toasts in sequence.
// Each shows for ~6s, then auto-advances. Player can skip via X.
// Stored in localStorage so it shows once per character.

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useT } from "../locales/useT";
import { useStore } from "../store";

const STEPS: Array<{ titleKey: string; bodyKey: string }> = [
  { titleKey: "onboard.step1Title", bodyKey: "onboard.step1Body" },
  { titleKey: "onboard.step2Title", bodyKey: "onboard.step2Body" },
  { titleKey: "onboard.step3Title", bodyKey: "onboard.step3Body" },
  { titleKey: "onboard.step4Title", bodyKey: "onboard.step4Body" },
  { titleKey: "onboard.step5Title", bodyKey: "onboard.step5Body" },
];

export function Onboarding({ room }: { room: Room<WorldState> }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const t = useT();
  // TutorialFinger is the guided first-run flow — let it finish (or declare
  // itself already-dismissed) before these passive toasts start, so a new
  // player never sees both overlapping at once.
  const tutorialFingerActive = useStore((s) => s.tutorialFingerActive);

  useEffect(() => {
    if (tutorialFingerActive) return;
    // Only show for first-time chars
    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    // Use character NAME (stable across sessions) rather than session id
    const key = "onboarded:" + me.name;
    if (localStorage.getItem(key) === "1") return;
    setOpen(true);
    const id = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= STEPS.length) {
          clearInterval(id);
          localStorage.setItem(key, "1");
          setOpen(false);
          return s;
        }
        return s + 1;
      });
    }, 6000);
    return () => clearInterval(id);
  }, [room, tutorialFingerActive]);

  function skip() {
    const me = room.state.players.get(room.sessionId);
    if (me) localStorage.setItem("onboarded:" + me.name, "1");
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  return (
    <div
      className="fixed top-[5rem] left-1/2 -translate-x-1/2 z-[100] pointer-events-auto select-none"
      style={{ maxWidth: "min(320px, 90vw)" }}
    >
      <div
        className="rounded-xl px-3 py-2 backdrop-blur-md flex items-start gap-2"
        style={{
          background: "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(2,6,23,0.96))",
          border: "1px solid rgba(34, 211, 238, 0.5)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.6), 0 0 12px rgba(34,211,238,0.25)",
        }}
      >
        <div className="flex-1">
          <div className="text-cyan-300 font-bold text-xs mb-0.5">{t(s.titleKey)}</div>
          <div className="text-white/85 text-[11px] leading-relaxed">{t(s.bodyKey)}</div>
          <div className="text-[9px] text-slate-400 mt-1">{step + 1} / {STEPS.length}</div>
        </div>
        <button onClick={skip} className="text-rose-300/80 hover:text-rose-300 leading-none text-sm">✕</button>
      </div>
    </div>
  );
}