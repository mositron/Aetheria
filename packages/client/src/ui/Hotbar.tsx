import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { JOBS, type JobId, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";

export function Hotbar({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  const targetId = useStore((s) => s.targetMonsterId);
  const lastCastRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80); // faster for cooldown smoothness
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
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

  return (
    <div className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 flex gap-2 select-none touch-none">
      {job.skills.map((s) => {
        const canAfford = me.mp >= s.manaCost;
        const last = lastCastRef.current.get(s.id) ?? 0;
        const remaining = Math.max(0, s.cooldownMs - (performance.now() - last));
        const onCooldown = remaining > 0;
        const cdPct = onCooldown ? remaining / s.cooldownMs : 0; // 1 = full overlay
        const disabled = !canAfford || !targetId || onCooldown;
        return (
          <button
            key={s.id}
            title={`${s.name} — ${s.desc} (MP ${s.manaCost})`}
            onClick={() => cast(s.id)}
            onTouchStart={(e) => { e.preventDefault(); cast(s.id); }}
            disabled={disabled}
            className="relative active:scale-95 transition-transform overflow-hidden"
            style={{
              width: 56, height: 56,
              borderRadius: 12,
              background: canAfford
                ? "radial-gradient(circle at 30% 30%, #fde68a 0%, #fbbf24 60%, #b45309 100%)"
                : "radial-gradient(circle at 30% 30%, #94a3b8 0%, #475569 60%, #1e293b 100%)",
              border: "2px solid #ffffff",
              boxShadow: canAfford
                ? "0 0 0 2px rgba(251,191,36,0.4), 0 4px 0 rgba(180,83,9,0.5), inset 0 1px 0 rgba(255,255,255,0.45)"
                : "0 4px 0 rgba(30,41,59,0.5)",
              opacity: disabled ? 0.7 : 1,
              color: "#fff",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
            <div className="text-2xl leading-none">{s.icon}</div>
            <div className="absolute top-0.5 left-1.5 text-[10px] font-bold text-white">{s.hotkey}</div>
            <div className="absolute bottom-0.5 right-1.5 text-[10px] text-sky-100 font-semibold">{s.manaCost}</div>
            {onCooldown && (
              <>
                {/* sweep overlay — pie slice that decreases as cooldown ticks down */}
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
