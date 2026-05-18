import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { GameFrame } from "./GameFrame";
import { keyEq } from "../utils/keyMatch";

type FilterKey = "all" | "weapon" | "armor" | "consumable" | "material" | "furniture";

export function Inventory({ room }: { room: Room<WorldState> }) {
  const open = useStore((s) => s.inventoryOpen);
  const toggle = useStore((s) => s.toggleInventory);
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "i")) toggle();
      if (e.key === "Escape" && open) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;
  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;
  // Keep original indices so equip/use messages still work
  const itemsWithIdx = Array.from(me.inventory.values()).map((s, idx) => ({ s, idx }));
  const filtered = itemsWithIdx.filter(({ s }) => {
    if (filter === "all") return true;
    const def = ITEMS[s.itemId];
    if (!def) return false;
    if (filter === "furniture") return s.itemId.startsWith("furniture_");
    return def.slot === filter;
  });

  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4" onClick={toggle}>
      <div className="w-[22rem] max-w-[92vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }} onClick={(e) => e.stopPropagation()}>
        <GameFrame
          title="กระเป๋า"
          className="flex flex-col min-h-0"
          innerClassName="flex flex-col flex-1 min-h-0"
        >
          <button
            onClick={toggle}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
          >
            ✕
          </button>
          <div className="space-y-3 pt-1 overflow-y-auto game-scroll flex-1 pr-1" style={{ minHeight: 0 }}>
            <div className="grid grid-cols-2 gap-2">
              <EquipSlot label="อาวุธ" itemId={me.weapon} onUnequip={() => room.send("unequip", { slot: "weapon" })} />
              <EquipSlot label="ชุดเกราะ" itemId={me.armor} onUnequip={() => room.send("unequip", { slot: "armor" })} />
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-1 mb-1">
              {([
                { id: "all", label: "ทั้งหมด", icon: "📦" },
                { id: "weapon", label: "อาวุธ", icon: "⚔" },
                { id: "armor", label: "เกราะ", icon: "🛡" },
                { id: "consumable", label: "ใช้", icon: "🧪" },
                { id: "material", label: "วัสดุ", icon: "🪵" },
                { id: "furniture", label: "เฟอร์", icon: "🪑" },
              ] as { id: FilterKey; label: string; icon: string }[]).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-[10px] px-2 py-1 rounded-full border-2 transition ${
                    filter === f.id ? "border-cyan-300 bg-cyan-500/30 text-white" : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-400/50"
                  }`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-6 gap-1.5 bg-black/40 p-2 rounded max-h-[70vh] overflow-y-auto game-scroll">
              {(filter === "all" ? Array.from({ length: 200 }).map((_, i) => itemsWithIdx[i]) : filtered).map((entry, gridIdx) => {
                const stack = entry?.s;
                const realIdx = entry?.idx ?? -1;
                return (
                  <ItemSlot
                    key={gridIdx}
                    stack={stack}
                    onUse={() => {
                      if (!stack) return;
                      const def = ITEMS[stack.itemId];
                      if (!def) return;
                      if (def.slot === "weapon" || def.slot === "armor") room.send("equip", { invIndex: realIdx });
                      else if (def.slot === "consumable") room.send("useItem", { invIndex: realIdx });
                    }}
                    onDrop={() => {
                      if (stack) room.send("dropItem", { invIndex: realIdx });
                    }}
                  />
                );
              })}
            </div>
            <div className="text-[10px] text-slate-400 text-center">
              แตะใช้/สวม · กดค้างเพื่อทิ้ง
            </div>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}

function ItemSlot({ stack, onUse, onDrop }: { stack?: { itemId: string; qty: number }; onUse: () => void; onDrop: () => void }) {
  const def = stack ? ITEMS[stack.itemId] : null;
  const longPressTimer = useRef<number | null>(null);

  function startLongPress() {
    if (!stack) return;
    longPressTimer.current = window.setTimeout(() => {
      if (confirm(`ทิ้ง ${def?.name}?`)) onDrop();
      longPressTimer.current = null;
    }, 600);
  }
  function cancelLongPress() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <div
      className="slot text-2xl relative"
      style={{ minHeight: 44 }}
      title={def?.name ?? ""}
      onClick={() => { cancelLongPress(); onUse(); }}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={(e) => { e.preventDefault(); if (stack) onDrop(); }}
    >
      {def?.icon}
      {stack && stack.qty > 1 && (
        <span className="absolute bottom-0 right-0.5 text-[10px] bg-slate-900 rounded px-1 font-bold text-amber-200">{stack.qty}</span>
      )}
    </div>
  );
}

function EquipSlot({ label, itemId, onUnequip }: { label: string; itemId: string; onUnequip: () => void }) {
  const def = itemId ? ITEMS[itemId] : null;
  return (
    <div className="bg-slate-900/60 rounded p-2 flex items-center gap-2 border border-cyan-400/20">
      <div className="w-11 h-11 slot text-2xl">{def?.icon ?? "—"}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-cyan-300 uppercase tracking-widest">{label}</div>
        <div className="truncate text-xs">{def?.name ?? "(ว่าง)"}</div>
      </div>
      {def && <button className="w-7 h-7 rounded bg-rose-700 hover:bg-rose-600 text-white text-sm font-bold" onClick={onUnequip}>×</button>}
    </div>
  );
}
