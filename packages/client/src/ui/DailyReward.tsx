import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, type WorldState } from "@game/shared";
import { useT } from "../locales/useT";

type RewardData = {
  day: number;
  streak: number;
  zeny: number;
  items: { id: string; qty: number }[];
};

export function DailyReward({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [reward, setReward] = useState<RewardData | null>(null);

  useEffect(() => {
    const off = room.onMessage("dailyReward" as any, (m: any) => setReward(m));
    return () => off?.();
  }, [room]);

  if (!reward) return null;

  return (
    <div
      data-no-screen-joy
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={() => setReward(null)}
    >
      <div
        className="relative w-[24rem] max-w-[92vw] p-6 rounded-3xl text-center"
        style={{
          background: "linear-gradient(180deg, #fff7ed 0%, #fed7aa 50%, #fdba74 100%)",
          border: "4px solid #ffffff",
          boxShadow: "0 0 0 4px rgba(251,191,36,0.5), 0 12px 50px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.8)",
          animation: "rewardPop 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* sparkles */}
        <div className="absolute -top-4 left-4 text-3xl animate-pulse">✨</div>
        <div className="absolute -top-2 right-8 text-2xl animate-pulse" style={{ animationDelay: "0.3s" }}>⭐</div>
        <div className="absolute -bottom-2 left-10 text-2xl animate-pulse" style={{ animationDelay: "0.6s" }}>🌟</div>

        <div className="text-amber-700 text-xs font-bold tracking-widest uppercase mb-1">{t("daily.title")}</div>
        <div className="text-4xl font-black text-amber-900 mb-1">{t("daily.todayGift")}</div>
        <div className="text-sm text-amber-800 mb-4">
          {t("daily.streakLabel")} <span className="font-bold text-rose-600">{t("daily.streakDays", { streak: reward.streak })}</span> 🔥
        </div>

        {/* 7-day streak indicator */}
        <div className="flex justify-center gap-1.5 mb-4">
          {Array.from({ length: 7 }).map((_, i) => {
            const dayIdx = i + 1;
            const passed = dayIdx <= reward.day;
            const current = dayIdx === reward.day;
            return (
              <div
                key={i}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                  current ? "border-rose-500 bg-rose-200 scale-125 animate-pulse" :
                  passed ? "border-amber-500 bg-amber-300 text-amber-900" : "border-amber-700/30 bg-white/50 text-amber-700"
                }`}
              >
                {passed ? "✓" : dayIdx}
              </div>
            );
          })}
        </div>

        <div className="bg-white/70 rounded-2xl p-3 mb-3 border-2 border-amber-300">
          <div className="text-amber-700 text-xs font-bold mb-1.5">{t("daily.reward")}</div>
          <div className="flex justify-center items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-2xl">💰</span>
              <span className="font-black text-amber-900">{reward.zeny}</span>
            </div>
            {reward.items.map((it, i) => {
              const def = ITEMS[it.id];
              return (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-2xl">{def?.icon ?? "?"}</span>
                  <span className="font-black text-amber-900">×{it.qty}</span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => setReward(null)}
          className="btn-game w-full"
          style={{
            background: "linear-gradient(180deg, #fb923c 0%, #ea580c 60%, #9a3412 100%)",
            boxShadow: "0 0 0 2px rgba(254, 215, 170, 0.5), 0 4px 0 rgba(154, 52, 18, 0.5), inset 0 1px 0 rgba(255,255,255,0.45)",
          }}
        >
          {t("daily.claim")}
        </button>
      </div>

      <style>{`
        @keyframes rewardPop {
          0%   { transform: scale(0.5) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.05) rotate(2deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
