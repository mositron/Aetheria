import { useEffect, useState } from "react";
import { GameFrame } from "./GameFrame";

type Entry = { name: string; score: number; kills: number; level: number };

export function Leaderboard() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-leaderboard", onToggle);
    return () => window.removeEventListener("toggle-leaderboard", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/leaderboard").then((r) => r.json()).then((d) => {
      setEntries(d.entries ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
    const id = setInterval(() => {
      fetch("/leaderboard").then((r) => r.json()).then((d) => setEntries(d.entries ?? [])).catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  return (
    <div data-no-screen-joy className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4" onClick={() => setOpen(false)}>
      <div className="w-[24rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title="🏆 Top 10 สัปดาห์นี้">
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>
          <div className="space-y-1.5 pt-1">
            {loading && <div className="text-center text-slate-400 py-4">กำลังโหลด...</div>}
            {!loading && entries.length === 0 && <div className="text-center text-slate-400 py-4">ยังไม่มีคะแนน — ออกล่า mob เลย!</div>}
            {entries.map((e, i) => (
              <div
                key={e.name}
                className={`flex items-center gap-2 p-2 rounded-xl border-2 ${
                  i === 0 ? "border-amber-300 bg-amber-500/15" :
                  i === 1 ? "border-slate-300 bg-slate-500/10" :
                  i === 2 ? "border-orange-400 bg-orange-500/10" : "border-slate-700 bg-slate-900/50"
                }`}
              >
                <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-black ${
                  i === 0 ? "bg-amber-400 text-amber-900" :
                  i === 1 ? "bg-slate-300 text-slate-900" :
                  i === 2 ? "bg-orange-400 text-orange-900" : "bg-slate-700 text-slate-300"
                }`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">{e.name}</div>
                  <div className="text-[10px] text-slate-400">Lv{e.level} · {e.kills} kills</div>
                </div>
                <div className="text-amber-300 font-black tabular-nums">{e.score}</div>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-slate-400 text-center mt-2">รีเซ็ตทุกวันจันทร์</div>
        </GameFrame>
      </div>
    </div>
  );
}
