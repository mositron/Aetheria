import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { JOBS, type JobId, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";

export function Hotbar({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  const targetId = useStore((s) => s.targetMonsterId);
  const lastCastRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // 200ms = 5Hz. Matches other UI panels + CLAUDE.md polling rule.
    // Skill cooldowns 800ms+ still get 4-75 visible frames; sweep stays readable.
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onCast = (e: Event) => {
      const detail = (e as CustomEvent<{ skillId: string }>).detail;
      if (detail?.skillId) lastCastRef.current.set(detail.skillId, performance.now());
    };
    window.addEventListener("local-cast", onCast);
    return () => window.removeEventListener("local-cast", onCast);
  }, []);

  const me: Player | undefined = room.state.players.get(room.sessionId);
  const job = me ? JOBS[me.job as JobId] : null;
  const jobId = me?.job;

  // Reset cooldown tracker when the player advances/changes class. Without
  // this, a same-id skill across two jobs (e.g. Swordsman bash @1500ms vs
  // Knight bash @700ms) would inherit the previous job's last-cast timestamp
  // and show a phantom cooldown.
  useEffect(() => {
    lastCastRef.current.clear();
  }, [jobId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (!job) return;
      // Layout-independent: derive digit from e.code ("Digit1"..."Digit9")
      const codeMatch = e.code.match(/^Digit(\d)$/);
      const n = codeMatch ? parseInt(codeMatch[1], 10) : parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const skill = job.skills.find((s) => s.hotkey === n);
        if (skill && targetId) {
          window.dispatchEvent(new CustomEvent("local-cast", { detail: { skillId: skill.id } }));
          room.send("skill", { skillId: skill.id, targetId });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room, job, targetId]);

  if (!me || !job || job.skills.length === 0) return null;

  function cast(skillId: string) {
    if (!targetId) return;
    const skill = job?.skills.find((s) => s.id === skillId);
    if (skill) {
      const last = lastCastRef.current.get(skillId) ?? 0;
      if (performance.now() - last < skill.cooldownMs) return; // still cooling down
      lastCastRef.current.set(skillId, performance.now());
    }
    window.dispatchEvent(new CustomEvent("local-cast", { detail: { skillId } }));
    room.send("skill", { skillId, targetId });
  }

  // Mobile (landscape too — min(w,h) < 540): skills sit as a vertical column
  // immediately left of the attack button so the thumb can reach without moving.
  // Desktop: keep them centered at the bottom.
  const isMobile = true; // mobile arc layout used on all screen sizes
  // Mobile arc around Attack button (no overlap — Attack at right-6 bottom-6, 64px).
  // Skill 54px positions chosen so distance between centers ≥ 4rem (clear gap).
  //   0 → directly LEFT of Attack
  //   1 → UPPER-LEFT (diagonal)
  //   2 → directly ABOVE Attack
  //   3 → far UPPER-LEFT (outer ring)
  // 3 slots equidistant from Attack AND from each other (≈4.6rem center spacing).
  // Angles 190°/130°/70° at radius 4.6 → equilateral triangle through Attack center.
  // Slot 0 nudged lower per user feedback.
  // Symmetric L around Attack (Attack @ right:2.5 bottom:2.5, size 76):
  //   • Skill 1 — same BOTTOM edge as Attack/utility  (bottom row)
  //   • Skill 3 — same RIGHT edge as Attack           (right column)
  //   • Skill 2 — diagonal at 135°, equidistant from Attack as 1 & 3
  // All 3 skills are equidistant from Attack (≈4.56rem).
  const arcPos = [
    { right: "7.68rem", bottom: "2.50rem" }, // 0 → bottom-aligned with Attack
    { right: "6.40rem", bottom: "6.40rem" }, // 1 → diagonal upper-left
    { right: "2.50rem", bottom: "7.68rem" }, // 2 → right-aligned with Attack
  ];
  const btnSize = isMobile ? 54 : 56;
  const SLOTS = 3; // always render 3 mobile slots — empty ones are dim placeholders

  return (
    <div
      className={isMobile ? "" : "absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 flex gap-2 select-none touch-none"}
      data-no-screen-joy
    >
      {(isMobile ? Array.from({ length: SLOTS }) : job.skills).map((_, idx) => {
        const s = job.skills[idx];
        const pos = arcPos[idx];
        // Empty placeholder for future skills (job hasn't unlocked this slot yet).
        if (isMobile && !s) {
          return (
            <div
              key={`empty-${idx}`}
              className="absolute pointer-events-none"
              style={{
                right: pos.right, bottom: pos.bottom,
                width: btnSize, height: btnSize,
                borderRadius: "50%",
                background: "radial-gradient(circle at 30% 30%, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.6) 60%, rgba(2,6,23,0.7) 100%)",
                border: "1px dashed rgba(148,163,184,0.35)",
                boxShadow: "inset 0 2px 6px rgba(0,0,0,0.45)",
                opacity: 0.55,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xl">·</div>
            </div>
          );
        }
        if (!s) return null;
        const canAfford = me.mp >= s.manaCost;
        const last = lastCastRef.current.get(s.id) ?? 0;
        const remaining = Math.max(0, s.cooldownMs - (performance.now() - last));
        const onCooldown = remaining > 0;
        const cdPct = onCooldown ? remaining / s.cooldownMs : 0;
        const disabled = !canAfford || !targetId || onCooldown;
        return (
          <button
            key={s.id}
            title={`${s.name} — ${s.desc} (MP ${s.manaCost})`}
            onClick={() => cast(s.id)}
            onTouchStart={(e) => { e.preventDefault(); cast(s.id); }}
            disabled={disabled}
            className={`active:scale-95 transition-transform overflow-hidden touch-none ${isMobile ? "absolute" : "relative"}`}
            style={{
              ...(isMobile && pos ? { right: pos.right, bottom: pos.bottom } : null),
              width: btnSize, height: btnSize,
              borderRadius: isMobile ? "50%" : 12,
              background: canAfford
                ? (isMobile
                    ? "radial-gradient(circle at 30% 30%, rgba(254,243,199,0.75) 0%, rgba(245,158,11,0.75) 50%, rgba(146,64,14,0.75) 100%)"
                    : "radial-gradient(circle at 30% 30%, #fde68a 0%, #fbbf24 60%, #b45309 100%)")
                : "radial-gradient(circle at 30% 30%, rgba(148,163,184,0.55) 0%, rgba(71,85,105,0.55) 60%, rgba(30,41,59,0.55) 100%)",
              border: canAfford ? "2px solid #fcd34d" : "2px solid #475569",
              boxShadow: canAfford
                ? "0 0 12px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.2), 0 3px 6px rgba(0,0,0,0.35)"
                : "inset 0 1px 0 rgba(255,255,255,0.1), 0 3px 6px rgba(0,0,0,0.35)",
              opacity: disabled ? 0.7 : 1,
              color: "#fff",
              textShadow: "0 1px 2px rgba(0,0,0,0.7)",
            }}
          >
            <div className="text-2xl leading-none">{s.icon}</div>
            {/* Hotkey: top-left corner inside circle's safe arc (~12px from edges) */}
            <div
              className="absolute text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              style={{ top: 6, left: 12 }}
            >{s.hotkey}</div>
            {/* Mana cost: bottom-right corner inside circle's safe arc */}
            <div
              className="absolute text-[9px] text-sky-100 font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              style={{ bottom: 6, right: 12 }}
            >{s.manaCost}</div>
            {onCooldown && (
              <>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `conic-gradient(rgba(0,0,0,0.65) ${cdPct * 360}deg, transparent 0)`,
                    transform: "rotate(-90deg)",
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-white font-black text-base pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {(remaining / 1000).toFixed(1)}
                </div>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
