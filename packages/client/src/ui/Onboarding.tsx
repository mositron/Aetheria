// Sequential onboarding for new characters — 5 small toasts in sequence.
// Each shows for ~6s, then auto-advances. Player can skip via X.
// Stored in localStorage so it shows once per character.

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

const STEPS: Array<{ title: string; body: string }> = [
  { title: "🌸 ยินดีต้อนรับสู่ Aetheria", body: "เลื่อนซ้ายเพื่อเคลื่อนที่ ลากนิ้วหรือกด WASD" },
  { title: "⚔ โจมตี", body: "แตะมอนสเตอร์เพื่อเลือกเป้าหมาย แล้วกดดาบขวาล่าง" },
  { title: "🔥 ใช้สกิล", body: "ปุ่มสกิลรอบดาบ — ต้องมี MP (สกิลใช้ MP, ดาบไม่ใช้)" },
  { title: "🧪 Auto-Potion", body: "ปุ่มยาเปิด config — ตั้งเปอร์เซ็นต์ HP/MP ที่ให้กินยาอัตโนมัติ" },
  { title: "🗺 สำรวจโลก", body: "แตะแผนที่เพื่อปักหมุด เดินไกลขึ้นเรื่อยๆ จะเจอภูเขา · ทะเลทราย · หิมะ" },
];

export function Onboarding({ room }: { room: Room<WorldState> }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only show for first-time chars
    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    const key = "onboarded:" + me.id;
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
  }, [room]);

  function skip() {
    const me = room.state.players.get(room.sessionId);
    if (me) localStorage.setItem("onboarded:" + me.id, "1");
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  return (
    <div
      className="fixed top-[5rem] left-1/2 -translate-x-1/2 z-[100] pointer-events-auto select-none"
      style={{ maxWidth: 320 }}
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
          <div className="text-cyan-300 font-bold text-xs mb-0.5">{s.title}</div>
          <div className="text-white/85 text-[11px] leading-relaxed">{s.body}</div>
          <div className="text-[9px] text-slate-400 mt-1">{step + 1} / {STEPS.length}</div>
        </div>
        <button onClick={skip} className="text-rose-300/80 hover:text-rose-300 leading-none text-sm">✕</button>
      </div>
    </div>
  );
}
