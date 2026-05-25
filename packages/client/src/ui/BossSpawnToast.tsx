import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useStore } from "../store";

type Toast = { name: string; x: number; z: number };

export function BossSpawnToast({ room }: { room: Room<WorldState> }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const setWaypoint = useStore((s) => s.setWaypoint);

  useEffect(() => {
    const off = room.onMessage("bossSpawn" as any, (m: any) => {
      if (!m || typeof m.x !== "number") return;
      setToast({ name: m.name ?? "Boss", x: m.x, z: m.z });
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    });
    return () => off?.();
  }, [room]);

  if (!toast) return null;

  return (
    <div
      className="absolute left-1/2 z-50 pointer-events-none"
      style={{
        top: "calc(var(--hud-top) + 3.5rem)",
        transform: "translateX(-50%)",
        animation: "bossSlideDown 0.45s cubic-bezier(0.2,0.9,0.3,1.2)",
      }}
    >
      <div
        className="pointer-events-auto px-5 py-3 rounded-2xl flex items-center gap-3"
        style={{
          background: "linear-gradient(180deg, rgba(127,29,29,0.95) 0%, rgba(69,10,10,0.95) 100%)",
          border: "2px solid #ef4444",
          boxShadow: "0 0 30px rgba(239,68,68,0.6), 0 8px 24px rgba(0,0,0,0.6)",
        }}
      >
        <span className="text-2xl">⚜</span>
        <div className="flex flex-col">
          <span className="text-[10px] tracking-[0.25em] text-rose-300 uppercase">Boss Spawned</span>
          <span className="text-base font-bold text-amber-100">{toast.name}</span>
        </div>
        <button
          onClick={() => {
            setWaypoint({ x: toast.x, z: toast.z, label: toast.name, icon: "⚜" });
            window.dispatchEvent(new Event("toggle-world-map"));
            setToast(null);
          }}
          className="ml-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold whitespace-nowrap"
        >
          📍 View on Map
        </button>
      </div>
    </div>
  );
}
