/**
 * WorldCreate — modal for creating a new server-hosted world.
 */
import { useState } from "react";
import { GameFrame } from "./GameFrame";

interface Props {
  onCreated: (worldId: string, inviteCode: string) => void;
  onClose: () => void;
}

const TEMPLATES = [
  { id: "forest", label: "🌲 ป่าสงบ", desc: "ป่าเขามืด ทรัพยากรมากมาย เหมาะสำหรับมือใหม่", color: "emerald" },
  { id: "desert", label: "🏜️ ทะเลทราย", desc: "ลมร้อน น้ำหายาก ความท้าทายสูงสุด", color: "amber" },
  { id: "mountain", label: "⛰️ ภูเขาสูง", desc: "ยอดเขาแหลม ไอหนาวเย็น ขุมทรัพย์ลึกลับ", color: "slate" },
  { id: "island", label: "🏝️ เกาะลึก", desc: "เกาะลอยน้ำ แยกจากแผ่นดิน ปลอดภัยกว่า", color: "cyan" },
] as const;

const MODES = [
  { id: "adventure", label: "ผจญภัย", icon: "🗺️" },
  { id: "co-op", label: "ร่วมมือ", icon: "🤝" },
  { id: "pvp", label: "PvP", icon: "⚔️" },
] as const;

const PRIVACY = [
  { id: "private", label: "เฉพาะเพื่อน", desc: "รหัสเชิญเท่านั้น" },
  { id: "friends", label: "เฉพาะเพื่อน", desc: "เฉพาะเพื่อนที่เพิ่มแล้ว" },
  { id: "public", label: "สาธารณะ", desc: "ทุกคนเห็นและเข้าร่วมได้" },
] as const;

const MAX_PLAYERS_OPTIONS = [4, 8, 16, 32];

export function WorldCreate({ onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<string>("forest");
  const [mode, setMode] = useState<string>("adventure");
  const [privacy, setPrivacy] = useState<string>("private");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("ใส่ชื่อโลกด้วย"); return; }
    if (trimmed.length > 32) { setError("ชื่อโลกสั้นกว่า 32 ตัวอักษร"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/worlds/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, template, mode, privacy, maxPlayers }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "เกิดข้อผิดพลาด"); return; }
      onCreated(data.worldId, data.inviteCode);
    } catch {
      setError("เชื่อมต่อ server ไม่ได้");
    } finally {
      setSubmitting(false);
    }
  };

  const colorMap: Record<string, string> = {
    emerald: "border-emerald-500 bg-emerald-900/20 hover:bg-emerald-900/30",
    amber: "border-amber-500 bg-amber-900/20 hover:bg-amber-900/30",
    slate: "border-slate-400 bg-slate-800/40 hover:bg-slate-800/60",
    cyan: "border-cyan-500 bg-cyan-900/20 hover:bg-cyan-900/30",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm py-8 px-4"
      onClick={onClose}
    >
      <div
        className="w-[36rem] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <GameFrame
          title="🌍 สร้างโลกใหม่"
          className="flex flex-col gap-4"
          innerClassName="flex flex-col gap-4"
        >
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
          >
            ✕
          </button>

          {/* World name */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1.5 block">ชื่อโลก</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder="ชื่อโลกของคุณ..."
              className="w-full bg-slate-900/70 border border-slate-500 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Template */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">ภูมิประเทศ</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`border-2 rounded-lg p-3 text-left transition ${template === t.id ? `${colorMap[t.color]} ring-2 ring-offset-1 ring-offset-slate-900` : "border-slate-700 bg-slate-900/40 hover:border-slate-500"}`}
                >
                  <div className="text-sm font-bold text-white mb-0.5">{t.label}</div>
                  <div className="text-[11px] text-slate-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">โหมดเล่น</label>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex-1 border-2 rounded-lg py-2 text-center text-sm font-bold transition ${mode === m.id ? "border-cyan-500 bg-cyan-900/30 text-cyan-100" : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500"}`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Privacy */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">ความเป็นส่วนตัว</label>
            <div className="flex gap-2">
              {PRIVACY.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPrivacy(p.id)}
                  className={`flex-1 border-2 rounded-lg py-2 text-center transition ${privacy === p.id ? "border-cyan-500 bg-cyan-900/30 text-cyan-100" : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500"}`}
                >
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[10px] opacity-70">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Max players */}
          <div>
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 block">จำนวนผู้เล่น</label>
            <div className="flex gap-2">
              {MAX_PLAYERS_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 border-2 rounded-lg py-2 text-center text-sm font-bold transition ${maxPlayers === n ? "border-cyan-500 bg-cyan-900/30 text-cyan-100" : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-rose-400 text-sm font-bold text-center">{error}</div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-b from-cyan-600 to-cyan-800 hover:from-cyan-500 hover:to-cyan-700 text-white border border-cyan-400/50 transition disabled:opacity-50"
          >
            {submitting ? "กำลังสร้าง..." : "🌍 สร้างโลก"}
          </button>
        </GameFrame>
      </div>
    </div>
  );
}