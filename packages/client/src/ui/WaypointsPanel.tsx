// Multi-waypoints — save named markers to localStorage, switch active.
// Toggle via toggle-waypoints event. List in panel, click to activate.

import { useEffect, useState } from "react";
import { useStore, type Waypoint } from "../store";
import { GameFrame } from "./GameFrame";

type Saved = Waypoint & { id: string };

const KEY = "aetheria.waypoints";

function load(): Saved[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved[]) : [];
  } catch { return []; }
}
function save(list: Saved[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new Event("waypoints-changed"));
}

export function WaypointsPanel() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Saved[]>(() => load());
  const [name, setName] = useState("");
  const waypoint = useStore((s) => s.waypoint);
  const setWaypoint = useStore((s) => s.setWaypoint);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    const onChange = () => setList(load());
    window.addEventListener("toggle-waypoints", onToggle);
    window.addEventListener("waypoints-changed", onChange);
    return () => {
      window.removeEventListener("toggle-waypoints", onToggle);
      window.removeEventListener("waypoints-changed", onChange);
    };
  }, []);

  if (!open) return null;

  return (
    <div data-no-screen-joy className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[22rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title="📍 หมุดของฉัน">
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="space-y-2 pt-1">
            {waypoint && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!name.trim() || !waypoint) return;
                  const item: Saved = { id: String(Date.now()), x: waypoint.x, z: waypoint.z, label: name.trim(), icon: waypoint.icon ?? "📍" };
                  const next = [...list, item];
                  setList(next); save(next); setName("");
                }}
                className="bg-cyan-900/30 border border-cyan-400/30 rounded p-2 space-y-1"
              >
                <div className="text-[10px] text-cyan-300 font-bold">💾 บันทึกหมุดปัจจุบัน ({waypoint.x.toFixed(0)}, {waypoint.z.toFixed(0)})</div>
                <div className="flex gap-1">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ตั้งชื่อ (เช่น บ้าน, ตลาด)" maxLength={24} className="flex-1 bg-slate-900/80 border border-cyan-400/40 rounded px-2 py-1 text-xs text-white" />
                  <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 rounded px-3 text-xs font-bold text-white">บันทึก</button>
                </div>
              </form>
            )}

            <div className="max-h-64 overflow-y-auto game-scroll space-y-1">
              {list.length === 0 && <div className="text-slate-400 text-xs text-center py-4">ยังไม่มีหมุด — แตะที่ minimap แล้วกดบันทึก</div>}
              {list.map((w) => (
                <div key={w.id} className="flex items-center gap-2 bg-slate-900/60 border border-white/10 rounded px-2 py-1.5">
                  <span className="text-lg">{w.icon ?? "📍"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{w.label}</div>
                    <div className="text-[9px] text-slate-400">({w.x.toFixed(0)}, {w.z.toFixed(0)})</div>
                  </div>
                  <button
                    onClick={() => { setWaypoint({ x: w.x, z: w.z, label: w.label, icon: w.icon }); setOpen(false); }}
                    className="bg-emerald-700 hover:bg-emerald-600 rounded px-2 py-0.5 text-[10px] font-bold text-white"
                  >➤ ไป</button>
                  <button
                    onClick={() => { const n = list.filter((x) => x.id !== w.id); setList(n); save(n); }}
                    className="bg-rose-700 hover:bg-rose-600 rounded px-2 py-0.5 text-[10px] font-bold text-white"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}
