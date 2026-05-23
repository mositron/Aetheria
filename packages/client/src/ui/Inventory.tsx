import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import FocusTrap from "focus-trap-react";
import { ITEMS, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { GameFrame } from "./GameFrame";
import { keyEq } from "../utils/keyMatch";
import { ConfirmDialog } from "./ConfirmDialog";
import { useT } from "../locales/useT";

type FilterKey = "all" | "weapon" | "armor" | "consumable" | "material" | "structure";

export function Inventory({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const open = useStore((s) => s.inventoryOpen);
  const toggle = useStore((s) => s.toggleInventory);
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmUnequip, setConfirmUnequip] = useState<{ slot: "weapon" | "armor"; itemId: string } | null>(null);

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
    if (filter === "structure") return s.itemId.startsWith("struct_");
    return def.slot === filter;
  });

return (
    <div onClick={toggle}>
      <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
        <div
          data-no-screen-joy
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-[18rem] sm:w-[20rem] md:w-[22rem] max-w-[92vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }}>
<GameFrame
              title={t('inventory.title')}
              className="flex flex-col min-h-0"
              innerClassName="flex flex-col flex-1 min-h-0"
            >
              <button
                onClick={toggle}
                aria-label={t('inventory.close')}
                className="absolute -top-3 -right-3 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10 flex items-center justify-center"
              >
                ✕
              </button>
          <div className="space-y-3 pt-1 overflow-y-auto game-scroll flex-1 pr-1" style={{ minHeight: 0 }}>
            <div className="grid grid-cols-2 gap-2">
              <EquipSlot label={t('inventory.weapon')} itemId={me.weapon} onUnequip={() => setConfirmUnequip({ slot: "weapon", itemId: me.weapon })} t={t} />
              <EquipSlot label={t('inventory.armor')} itemId={me.armor} onUnequip={() => setConfirmUnequip({ slot: "armor", itemId: me.armor })} t={t} />
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-1 mb-1">
              {([
                { id: "all", label: t('inventory.all'), icon: "📦" },
                { id: "weapon", label: t('inventory.weapon'), icon: "⚔" },
                { id: "armor", label: t('inventory.armor'), icon: "🛡" },
                { id: "consumable", label: t('inventory.consumable'), icon: "🧪" },
                { id: "material", label: t('inventory.material'), icon: "🪵" },
                { id: "structure", label: t('inventory.structure'), icon: "🏗️" },
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
                    t={t}
                    onUse={() => {
                      if (!stack) return;
                      const def = ITEMS[stack.itemId];
                      if (!def) return;
                      if (def.slot === "weapon" || def.slot === "armor") room.send("equip", { invIndex: realIdx });
                      else if (def.slot === "consumable") room.send("useItem", { invIndex: realIdx });
                      else if (stack.itemId.startsWith("struct_")) {
                        // Enter build mode with this structure item
                        useStore.getState().toggleInventory();
                        useStore.getState().setSelectedStructItem(stack.itemId);
                      }
                    }}
                    onDrop={() => {
                      if (stack) room.send("dropItem", { invIndex: realIdx });
                    }}
                  />
                );
              })}
            </div>
<div className="text-[10px] text-slate-400 text-center">
              {t('inventory.tapUse')}
            </div>
</div>
          </GameFrame>
          </div>
        </div>
      </FocusTrap>
      <ConfirmDialog
      open={confirmUnequip !== null}
      title={t('inventory.unequipTitle')}
      message={t('inventory.unequipMsg', { item: ITEMS[confirmUnequip?.itemId ?? ""]?.name ?? t('inventory.empty') })}
      severity={confirmUnequip?.itemId.startsWith("rare_") ? "warning" : "info"}
      confirmLabel={t('inventory.unequip')}
      onConfirm={() => {
        if (confirmUnequip) room.send("unequip", { slot: confirmUnequip.slot });
        setConfirmUnequip(null);
      }}
onCancel={() => setConfirmUnequip(null)}
      />
    </div>
  );
}

function ItemSlot({ stack, onUse, onDrop, t }: { stack?: { itemId: string; qty: number }; onUse: () => void; onDrop: () => void; t: ReturnType<typeof useT> }) {
  const def = stack ? ITEMS[stack.itemId] : null;
  const longPressTimer = useRef<number | null>(null);

  function startLongPress() {
    if (!stack) return;
    longPressTimer.current = window.setTimeout(() => {
      if (confirm(t('inventory.dropConfirm', { item: def?.name ?? t('inventory.empty') }))) onDrop();
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

function EquipSlot({ label, itemId, onUnequip, t }: { label: string; itemId: string; onUnequip: () => void; t: ReturnType<typeof useT> }) {
  const def = itemId ? ITEMS[itemId] : null;
  return (
    <div className="bg-slate-900/60 rounded p-2 flex items-center gap-2 border border-cyan-400/20">
      <div className="w-11 h-11 slot text-2xl">{def?.icon ?? "—"}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-cyan-300 uppercase tracking-widest">{label}</div>
        <div className="truncate text-xs">{def?.name ?? t('inventory.empty')}</div>
      </div>
      {def && <button className="w-7 h-7 rounded bg-rose-700 hover:bg-rose-600 text-white text-sm font-bold" onClick={onUnequip}>×</button>}
    </div>
  );
}
