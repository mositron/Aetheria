import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { JOBS, JOB_ADVANCEMENT, SECOND_TIER_JOBS, type JobId, type Player, type WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";

const FIRST_CLASS_OPTIONS = [
  { job: "swordsman", icon: "⚔", labelKey: "job.swordsmanLabel", descKey: "job.swordsmanDesc" },
  { job: "mage",      icon: "🪄", labelKey: "job.mageLabel",     descKey: "job.mageDesc" },
  { job: "archer",    icon: "🏹", labelKey: "job.archerLabel",   descKey: "job.archerDesc" },
  { job: "acolyte",   icon: "✨", labelKey: "job.acolyteLabel",  descKey: "job.acolyteDesc" },
  { job: "thief",     icon: "🗡", labelKey: "job.thiefLabel",    descKey: "job.thiefDesc" },
];

const SECOND_CLASS_LABELS: Record<string, { icon: string; label: string; desc: string }> = {
  knight:   { icon: "🛡", label: "Knight",   desc: "Bash + AoE Spiral + Auto Guard" },
  wizard:   { icon: "🔮", label: "Wizard",   desc: "Frost Nova + Meteor + Fire Wall" },
  sniper:   { icon: "🎯", label: "Sniper",   desc: "Snipe ระยะไกล + Arrow Rain" },
  priest:   { icon: "🕊", label: "Priest",   desc: "Greater Heal + Sanctuary" },
  assassin: { icon: "☠", label: "Assassin", desc: "Sonic Blow + Deadly Poison" },
};

const THIRD_CLASS_LABELS: Record<string, { icon: string; label: string; desc: string }> = {
  lord_knight:   { icon: "⚔", label: "Lord Knight",   desc: "Charge Attack + Iron Wall + Brandish" },
  high_wizard:   { icon: "🔮", label: "High Wizard",   desc: "Meteor Strike + Ice Elemental + Magic Shatter" },
  sniper_t2:     { icon: "🎯", label: "Sniper",        desc: "Arrow Storm + Trap Master + Eagle Eye" },
  high_priest:   { icon: "✝", label: "High Priest",   desc: "Resurrection + Holy Shield + Divine Blessing" },
  assassin_t2:   { icon: "🗡", label: "Assassin",      desc: "Backstab + Vanish + Poison Trap" },
};

export function JobPicker({ room }: { room: Room<WorldState> }) {
  const t = useT();
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

  // 3rd-tier: player already has a 2nd-class job and is Lv50+
  const thirdClassAdvancements = (JOB_ADVANCEMENT[me.job] as JobId[] | undefined);
  const thirdClassReady = !!thirdClassAdvancements && thirdClassAdvancements.length > 0 && me.level >= 50;

  if (!firstClassReady && !secondClassReady && !thirdClassReady) return null;

return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[26rem] max-w-[94vw] pointer-events-auto">
      <GameFrame
        title={firstClassReady ? t("job.changeTitleLv5") : thirdClassReady ? t("job.promoTitle3rd") : t("job.promoTitle2nd")}
        variant={thirdClassReady ? "gold" : secondClassReady ? "violet" : "cyan"}
      >
        <div className="text-center text-xs text-slate-300 mb-2">
          {firstClassReady ? t("job.pickFirst") :
           thirdClassReady ? "🌟 " + t("job.promo50") :
           "🌟 " + t("job.promo30")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {firstClassReady && FIRST_CLASS_OPTIONS.map((j) => (
            <JobBtn key={j.job} job={j.job} icon={j.icon} label={t(j.labelKey)} desc={t(j.descKey)} room={room} variant="primary" />
          ))}
          {secondClassReady && advancements!.map((nextJob) => {
            const info = SECOND_CLASS_LABELS[nextJob];
            if (!info) return null;
            return <JobBtn key={nextJob} job={nextJob} icon={info.icon} label={info.label} desc={info.desc} room={room} variant="violet" />;
          })}
          {thirdClassReady && thirdClassAdvancements!.map((nextJob) => {
            const info = THIRD_CLASS_LABELS[nextJob];
            if (!info) return null;
            return <JobBtn key={nextJob} job={nextJob} icon={info.icon} label={info.label} desc={info.desc} room={room} variant="gold" />;
          })}
        </div>
      </GameFrame>
    </div>
  );
}

function JobBtn({ job, icon, label, desc, room, variant }: { job: string; icon: string; label: string; desc: string; room: Room<WorldState>; variant: "primary" | "violet" | "gold" }) {
  const gradients: Record<string, string> = {
    primary: "linear-gradient(180deg, #67e8f9 0%, #22d3ee 60%, #0891b2 100%)",
    violet:  "linear-gradient(180deg, #c084fc 0%, #a855f7 60%, #7c3aed 100%)",
    gold:    "linear-gradient(180deg, #fde68a 0%, #fbbf24 60%, #d97706 100%)",
  };
  const shadows: Record<string, string> = {
    primary: "0 4px 0 rgba(8,145,178,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
    violet:  "0 4px 0 rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
    gold:    "0 4px 0 rgba(217,119,6,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
  };
  return (
    <button
      onClick={() => room.send("changeJob", { job })}
      className="relative p-2.5 rounded-2xl text-left transition active:scale-95 border-2 border-white"
      style={{ background: gradients[variant], boxShadow: shadows[variant] }}
    >
      <div className="font-bold text-white text-sm flex items-center gap-1">
        <span className="text-lg">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[10px] text-white/90 mt-0.5">{desc}</div>
    </button>
  );
}
