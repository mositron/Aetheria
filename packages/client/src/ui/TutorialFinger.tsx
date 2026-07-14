import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useStore } from "../store";
import { useT } from "../locales/useT";

// Targets use stable data-tutorial-target attributes rather than title text —
// title text used to be locale-dependent for some buttons (Thai regex) and
// static English for others, so the tutorial silently broke depending on
// which locale/button it hit. Steps also only reference elements that are
// ALWAYS mounted (not hidden inside the collapsed "More" menu section) so a
// missing target never blanks the whole overlay mid-tutorial.

type Step = {
  id: string;
  text: string;
  /** Function returning DOMRect of target element (lazy — element may not exist yet) */
  targetSelector: string;
  position?: "top" | "bottom" | "left" | "right";
  /** Returns true when the step's goal is met (advance automatically) */
  done?: (room: Room<WorldState>) => boolean;
};

const STEPS: Step[] = [
  {
    id: "minimap",
    text: "tutorial.minimap",
    targetSelector: "[data-tutorial-target='minimap']",
    position: "left",
  },
  {
    id: "attack",
    text: "tutorial.attack",
    targetSelector: "[data-tutorial-target='attack']",
    position: "top",
    done: (room) => {
      const me = room.state.players.get(room.sessionId);
      if (!me) return false;
      let prog: any = { counters: {} };
      try { prog = JSON.parse(me.achievementsJson || "{}"); } catch {}
      return (prog.counters?.kills ?? 0) >= 1;
    },
  },
  {
    id: "menu",
    text: "tutorial.openMenu",
    targetSelector: "[data-tutorial-target='menu-open']",
    position: "left",
  },
];

export function TutorialFinger({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const dismissed = useStore((s) => s.dismissedHints);
  const dismissHint = useStore((s) => s.dismissHint);
  const setTutorialFingerActive = useStore((s) => s.setTutorialFingerActive);
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(true);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Skip if already dismissed
  useEffect(() => {
    if (dismissed.includes("tutorial-finger-done")) {
      setActive(false);
    }
  }, [dismissed]);

  // Publish active/inactive to the store so Onboarding + HintSystem don't
  // render on top of this guided flow. Store defaults to true so those two
  // wait for this effect's first run before showing anything.
  useEffect(() => {
    setTutorialFingerActive(active);
  }, [active, setTutorialFingerActive]);

  // Track target element bounding rect; advance if step's goal met
  useEffect(() => {
    if (!active) return;
    const s = STEPS[step];
    if (!s) { setActive(false); return; }
    const id = setInterval(() => {
      const el = document.querySelector(s.targetSelector) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
      } else {
        setRect(null);
      }
      // auto-advance
      if (s.done && s.done(room)) setStep((n) => n + 1);
    }, 300);
    return () => clearInterval(id);
  }, [step, active, room]);

  function next() {
    if (step + 1 >= STEPS.length) finish();
    else setStep(step + 1);
  }
  function finish() {
    dismissHint("tutorial-finger-done");
    setActive(false);
  }

  if (!active || !rect) return null;
  const s = STEPS[step];

  // Compute tip box position
  const tipPos: React.CSSProperties = (() => {
    const pad = 30;
    switch (s.position) {
      case "top":    return { left: rect.x, top: rect.y - rect.h / 2 - pad, transform: "translate(-50%, -100%)" };
      case "left":   return { left: rect.x - rect.w / 2 - pad, top: rect.y, transform: "translate(-100%, -50%)" };
      case "right":  return { left: rect.x + rect.w / 2 + pad, top: rect.y, transform: "translate(0, -50%)" };
      default:       return { left: rect.x, top: rect.y + rect.h / 2 + pad, transform: "translate(-50%, 0)" };
    }
  })();

  return (
    <>
      {/* Dim everything except the target (cutout) */}
      <div
        className="fixed inset-0 z-[60] pointer-events-none"
        style={{
          background: `radial-gradient(circle ${Math.max(rect.w, rect.h) * 0.9 + 30}px at ${rect.x}px ${rect.y}px, transparent 60%, rgba(0,0,0,0.65) 100%)`,
        }}
      />

      {/* Pulse highlight ring on target */}
      <div
        className="fixed z-[61] pointer-events-none"
        style={{
          left: rect.x - rect.w / 2 - 6,
          top: rect.y - rect.h / 2 - 6,
          width: rect.w + 12,
          height: rect.h + 12,
          borderRadius: "999px",
          border: "3px solid #fde047",
          boxShadow: "0 0 0 4px rgba(253,224,71,0.4), 0 0 24px rgba(253,224,71,0.7)",
          animation: "tutorPulse 1.2s ease-in-out infinite",
        }}
      />

      {/* Finger pointer */}
      <div
        className="fixed z-[62] pointer-events-none text-5xl"
        style={{
          left: rect.x,
          top: rect.y + rect.h / 2 + 10,
          transform: "translate(-50%, 0)",
          animation: "tutorFinger 1.4s ease-in-out infinite",
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))",
        }}
      >
        👆
      </div>

      {/* Tip card */}
      <div
        className="fixed z-[63] max-w-[16rem] pointer-events-auto"
        style={tipPos}
      >
        <div
          className="px-3 py-2 rounded-2xl text-sm font-semibold text-amber-900"
          style={{
            background: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)",
            border: "2px solid #fbbf24",
            boxShadow: "0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">🎓</span>
            <span className="flex-1 leading-snug">{t(s.text)}</span>
          </div>
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={finish}
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold"
            >{t('skip')}</button>
            <button
              onClick={next}
              className="text-[11px] px-2.5 py-0.5 rounded-full bg-gradient-to-b from-rose-400 to-pink-600 text-white font-bold"
            >{t('common.next')} →</button>
          </div>
          <div className="text-[9px] text-amber-700/70 mt-1">{step + 1}/{STEPS.length}</div>
        </div>
      </div>

      <style>{`
        @keyframes tutorPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
        @keyframes tutorFinger {
          0%, 100% { transform: translate(-50%, 0); }
          50%      { transform: translate(-50%, 10px); }
        }
      `}</style>
    </>
  );
}
