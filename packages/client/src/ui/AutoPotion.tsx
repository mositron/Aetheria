// Auto-potion config + slot button. Appears in the empty 3rd skill slot.
// Players choose: which item restores HP/MP and the min threshold to trigger.
// Logic runs once per second from a background poller (this component mounts
// it on init). Sends "useItem" to the server when stats drop below threshold.

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, type Player, type WorldState } from "@game/shared";

export type AutoPotionConfig = {
  hpItemId: string | null;
  hpThresholdPct: number;   // 0..100
  mpItemId: string | null;
  mpThresholdPct: number;
  enabled: boolean;
};

const DEFAULTS: AutoPotionConfig = {
  hpItemId: "hp_potion",
  hpThresholdPct: 50,
  mpItemId: "mp_potion",
  mpThresholdPct: 30,
  enabled: true,
};

const KEY = "aetheria.autopotion";

export function loadAutoPotion(): AutoPotionConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveAutoPotion(cfg: AutoPotionConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
  window.dispatchEvent(new CustomEvent("autopotion-changed", { detail: cfg }));
}

// ── Background poller (renders nothing). Mount once near the room root. ────
export function AutoPotionPoller({ room }: { room: Room<WorldState> }) {
  const [cfg, setCfg] = useState<AutoPotionConfig>(() => loadAutoPotion());
  useEffect(() => {
    const on = () => setCfg(loadAutoPotion());
    window.addEventListener("autopotion-changed", on);
    return () => window.removeEventListener("autopotion-changed", on);
  }, []);
  const lastUseAt = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (!cfg.enabled) return;
      const me = room.state.players.get(room.sessionId) as Player | undefined;
      if (!me || me.dead) return;
      const now = performance.now();
      if (now - lastUseAt.current < 1500) return;
      const hpPct = (me.hp / me.maxHp) * 100;
      const mpPct = (me.mp / me.maxMp) * 100;
      function findInvIndex(itemId: string): number {
        for (let i = 0; i < me!.inventory.length; i++) {
          if (me!.inventory[i].itemId === itemId && me!.inventory[i].qty > 0) return i;
        }
        return -1;
      }
      if (cfg.hpItemId && hpPct < cfg.hpThresholdPct) {
        const idx = findInvIndex(cfg.hpItemId);
        if (idx >= 0) {
          room.send("useItem", { invIndex: idx });
          lastUseAt.current = now;
          window.dispatchEvent(new CustomEvent("potion-used", { detail: { at: now } }));
          return;
        }
      }
      if (cfg.mpItemId && mpPct < cfg.mpThresholdPct) {
        const idx = findInvIndex(cfg.mpItemId);
        if (idx >= 0) {
          room.send("useItem", { invIndex: idx });
          lastUseAt.current = now;
          window.dispatchEvent(new CustomEvent("potion-used", { detail: { at: now } }));
        }
      }
    }, 700);
    return () => clearInterval(id);
  }, [room, cfg]);
  return null;
}

// ── Standalone "open config" dialog hook (use from any button) ──────────────
export function useAutoPotionDialog(): { open: () => void; render: React.ReactNode } {
  const [shown, setShown] = useState(false);
  const [cfg, setCfg] = useState<AutoPotionConfig>(() => loadAutoPotion());
  useEffect(() => {
    const on = () => setCfg(loadAutoPotion());
    window.addEventListener("autopotion-changed", on);
    return () => window.removeEventListener("autopotion-changed", on);
  }, []);
  return {
    open: () => setShown(true),
    render: shown ? (
      <AutoPotionDialog
        cfg={cfg}
        onChange={(next) => { setCfg(next); saveAutoPotion(next); }}
        onClose={() => setShown(false)}
      />
    ) : null,
  };
}

function AutoPotionDialog({ cfg, onChange, onClose }: {
  cfg: AutoPotionConfig;
  onChange: (next: AutoPotionConfig) => void;
  onClose: () => void;
}) {
  // List all consumables with hpRestore or mpRestore.
  const hpItems = Object.values(ITEMS).filter((i) => i.slot === "consumable" && (i.hpRestore ?? 0) > 0);
  const mpItems = Object.values(ITEMS).filter((i) => i.slot === "consumable" && (i.mpRestore ?? 0) > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-no-screen-joy
    >
      <div
        className="bg-slate-900/95 border-2 border-emerald-400/60 rounded-2xl p-4 w-full max-w-sm space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-emerald-300 font-bold text-sm">🧪 Auto-Potion</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
        </div>

        <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
          <input
            type="checkbox" checked={cfg.enabled}
            onChange={(e) => onChange({ ...cfg, enabled: e.target.checked })}
          />
          เปิดใช้งานอัตโนมัติ
        </label>

        {/* HP section */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-rose-300 font-semibold">❤ เมื่อ HP ต่ำกว่า {cfg.hpThresholdPct}%</div>
          <input
            type="range" min={10} max={90} step={5}
            value={cfg.hpThresholdPct}
            onChange={(e) => onChange({ ...cfg, hpThresholdPct: parseInt(e.target.value) })}
            className="w-full"
          />
          <select
            value={cfg.hpItemId ?? ""}
            onChange={(e) => onChange({ ...cfg, hpItemId: e.target.value || null })}
            className="w-full bg-slate-800 border border-white/15 rounded px-2 py-1 text-xs text-white"
          >
            <option value="">— ปิด —</option>
            {hpItems.map((i) => (
              <option key={i.id} value={i.id}>{i.icon} {i.name} (+{i.hpRestore} HP)</option>
            ))}
          </select>
        </div>

        {/* MP section */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-sky-300 font-semibold">✦ เมื่อ MP ต่ำกว่า {cfg.mpThresholdPct}%</div>
          <input
            type="range" min={10} max={90} step={5}
            value={cfg.mpThresholdPct}
            onChange={(e) => onChange({ ...cfg, mpThresholdPct: parseInt(e.target.value) })}
            className="w-full"
          />
          <select
            value={cfg.mpItemId ?? ""}
            onChange={(e) => onChange({ ...cfg, mpItemId: e.target.value || null })}
            className="w-full bg-slate-800 border border-white/15 rounded px-2 py-1 text-xs text-white"
          >
            <option value="">— ปิด —</option>
            {mpItems.map((i) => (
              <option key={i.id} value={i.id}>{i.icon} {i.name} (+{i.mpRestore} MP)</option>
            ))}
          </select>
        </div>

        <div className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-white/10">
          ระบบจะใช้ของในกระเป๋าอัตโนมัติ (ทุก 1.5 วินาทีอย่างมาก) ถ้าค่าตกต่ำกว่าที่ตั้งไว้
        </div>
      </div>
    </div>
  );
}
