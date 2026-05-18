import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { JOBS, JOB_ADVANCEMENT, type JobId, type Player, type WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";

const FIRST_CLASS_OPTIONS = [
  { job: "swordsman", icon: "⚔", label: "นักดาบ", desc: "HP สูง + เบิร์สแรง" },
  { job: "mage",      icon: "🪄", label: "เมจ",   desc: "MP เยอะ + เวทธาตุ" },
  { job: "archer",    icon: "🏹", label: "นักธนู", desc: "โจมตีระยะไกล" },
  { job: "acolyte",   icon: "✨", label: "อโคไลท์", desc: "ฮีล + holy" },
  { job: "thief",     icon: "🗡", label: "โจร",   desc: "พิษ + เบิร์ส" },
];

const SECOND_CLASS_LABELS: Record<string, { icon: string; label: string; desc: string }> = {
  knight:   { icon: "🛡", label: "Knight",   desc: "Bash + AoE Spiral + Auto Guard" },
  wizard:   { icon: "🔮", label: "Wizard",   desc: "Frost Nova + Meteor + Fire Wall" },
  sniper:   { icon: "🎯", label: "Sniper",   desc: "Snipe ระยะไกล + Arrow Rain" },
  priest:   { icon: "🕊", label: "Priest",   desc: "Greater Heal + Sanctuary" },
  assassin: { icon: "☠", label: "Assassin", desc: "Sonic Blow + Deadly Poison" },
};

export function JobPicker({ room }: { room: Room<WorldState> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  const firstClassReady = me.job === "novice" && me.level >= 5;
  const advancements = JOB_ADVANCEMENT[me.job] as JobId[] | undefined;
  const secondClassReady = !!advancements && advancements.length > 0 && me.level >= 30;

  if (!firstClassReady && !secondClassReady) return null;

  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[26rem] max-w-[94vw] pointer-events-auto">
      <GameFrame
        title={firstClassReady ? "เปลี่ยนอาชีพ Lv 5" : "เลื่อนขั้น 2nd-class"}
        variant={secondClassReady ? "violet" : "cyan"}
      >
        <div className="text-center text-xs text-slate-300 mb-2">
          {firstClassReady ? "เลือกอาชีพแรกของคุณ — ปลดล็อก skill ใหม่!" : "🌟 ผ่านเลเวล 30 — เลื่อนขั้นเป็นอาชีพชั้นสอง!"}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {firstClassReady && FIRST_CLASS_OPTIONS.map((j) => (
            <JobBtn key={j.job} job={j.job} icon={j.icon} label={j.label} desc={j.desc} room={room} variant="primary" />
          ))}
          {secondClassReady && advancements!.map((nextJob) => {
            const info = SECOND_CLASS_LABELS[nextJob];
            if (!info) return null;
            return <JobBtn key={nextJob} job={nextJob} icon={info.icon} label={info.label} desc={info.desc} room={room} variant="violet" />;
          })}
        </div>
      </GameFrame>
    </div>
  );
}

function JobBtn({ job, icon, label, desc, room, variant }: { job: string; icon: string; label: string; desc: string; room: Room<WorldState>; variant: "primary" | "violet" }) {
  return (
    <button
      onClick={() => room.send("changeJob", { job })}
      className="relative p-2.5 rounded-2xl text-left transition active:scale-95 border-2 border-white"
      style={{
        background: variant === "violet"
          ? "linear-gradient(180deg, #c084fc 0%, #a855f7 60%, #7c3aed 100%)"
          : "linear-gradient(180deg, #67e8f9 0%, #22d3ee 60%, #0891b2 100%)",
        boxShadow: variant === "violet"
          ? "0 4px 0 rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.4)"
          : "0 4px 0 rgba(8,145,178,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      <div className="font-bold text-white text-sm flex items-center gap-1">
        <span className="text-lg">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[10px] text-white/90 mt-0.5">{desc}</div>
    </button>
  );
}
