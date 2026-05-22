import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { MAPS, BIOMES, biomeAt, type WorldState, type MapId } from "@game/shared";
import { setAmbientBiome, stopAmbient } from "../sfx/sfx";
import { useSettings } from "./SettingsPanel";
import { useT } from "../locales/useT";

/** Biome toast + compass-to-village. Both top-center, lightweight. */
export function BiomeWidgets({ room }: { room: Room<WorldState> }) {
  const settings = useSettings();
  const t = useT();
  const [biome, setBiome] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<{ id: string; name: string } | null>(null);
  const [bearing, setBearing] = useState(0);   // radians toward home
  const [distance, setDistance] = useState(0);
  const lastBiome = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const me = room.state.players.get(room.sessionId);
      if (!me) return;
      const mapDef = MAPS[room.state.mapId as MapId];
      const half = mapDef.size / 2;
      const b = biomeAt(me.pos.x, me.pos.z, half);
      if (b !== lastBiome.current) {
        lastBiome.current = b;
        setBiome(b);
        const def = BIOMES[b];
        if (def) {
          const tid = `${Date.now()}`;
          setShowToast({ id: tid, name: def.name });
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setShowToast(null), 2800);
        }
        // Switch ambient drone for new biome (only if ambient music enabled in settings)
        try {
          if (settings.ambient) setAmbientBiome(b);
          else stopAmbient();
        } catch {}
      }
      // compass: bearing toward (0,0) village
      const dx = -me.pos.x;
      const dz = -me.pos.z;
      const d = Math.hypot(dx, dz);
      setDistance(d);
      setBearing(Math.atan2(dx, dz));
    };
    tick();
    const id = setInterval(tick, 300);
    return () => { clearInterval(id); stopAmbient(); };
  }, [room, settings.ambient]);

  return (
    <>
      {/* Compass — top-center small badge always visible (hidden in village) */}
      {distance > 8 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 select-none touch-none pointer-events-none">
          <div className="bg-black/55 backdrop-blur-md border border-cyan-400/30 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-[0_4px_14px_rgba(0,0,0,0.5)]">
            <div className="w-5 h-5 relative">
              <svg viewBox="0 0 24 24" className="w-full h-full" style={{ transform: `rotate(${(bearing * 180) / Math.PI}deg)` }}>
                <path d="M12 2 L17 14 L12 11 L7 14 Z" fill="#22d3ee" stroke="#0e7490" strokeWidth="0.8" />
              </svg>
            </div>
            <span className="text-[11px] text-cyan-100 font-semibold">🏘 {t("biome.village")}</span>
            <span className="text-[10px] text-slate-300">{Math.round(distance)}m</span>
          </div>
        </div>
      )}

      {/* Biome toast */}
      {showToast && (
        <div
          key={showToast.id}
          className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none select-none"
          style={{ animation: "biomeIn 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28)" }}
        >
          <div
            className="px-6 py-3 bg-gradient-to-b from-slate-900/95 to-black/85 backdrop-blur-md border-2 border-amber-400/60 rounded shadow-[0_0_30px_rgba(251,191,36,0.3)]"
            style={{ clipPath: "polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)" }}
          >
            <div className="text-[10px] text-amber-300 tracking-[0.4em] uppercase text-center">{t("biome.enter")}</div>
            <div className="text-2xl font-black tracking-wider text-white text-center drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">
              {showToast.name}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes biomeIn {
          from { opacity: 0; transform: translate(-50%, -16px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </>
  );
}
