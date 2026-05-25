// Item hotbar — 5 slots bound to number keys 1..5.
// Bind: from Inventory, right-click an item → dispatchEvent("hotbar:bind", { itemId })
// Clear: right-click an occupied hotbar slot.
// Use: press 1..5 (keyboard) or click the slot. Server cooldowns honored.

import { useEffect } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { useRecallCooldown } from "../hooks/useRecallCooldown";

export function ItemHotbar({ room }: { room: Room<WorldState> }) {
  const hotbar = useStore((s) => s.hotbar);
  const setSlot = useStore((s) => s.setHotbarSlot);
  const recallCd = useRecallCooldown(room);

  const me = room.state.players.get(room.sessionId);
  const findInvIdx = (itemId: string | null): number => {
    if (!itemId || !me) return -1;
    for (let i = 0; i < me.inventory.length; i++) {
      if (me.inventory[i].itemId === itemId) return i;
    }
    return -1;
  };
  const useSlot = (slot: number) => {
    const itemId = hotbar[slot];
    if (!itemId) return;
    if (itemId === "recall_stone" && recallCd > 0) return;
    const idx = findInvIdx(itemId);
    if (idx < 0) return;
    room.send("useItem", { invIndex: idx });
  };

  // Keyboard 1..5
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5) useSlot(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotbar, recallCd, room]);

  // Bind from inventory via custom event
  useEffect(() => {
    const onBind = (e: Event) => {
      const detail = (e as CustomEvent<{ itemId: string }>).detail;
      if (!detail?.itemId) return;
      const empty = hotbar.findIndex((s) => s === null);
      const slot = empty >= 0 ? empty : 0;
      setSlot(slot, detail.itemId);
    };
    window.addEventListener("hotbar:bind", onBind);
    return () => window.removeEventListener("hotbar:bind", onBind);
  }, [hotbar, setSlot]);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 pointer-events-auto select-none flex gap-1 z-20"
      style={{ bottom: "calc(var(--bottom-safe) + 0.25rem)", touchAction: "none" }}
      data-no-screen-joy
    >
      {hotbar.map((itemId, i) => {
        const def = itemId ? ITEMS[itemId] : null;
        const idx = findInvIdx(itemId);
        const qty = idx >= 0 && me ? me.inventory[idx].qty : 0;
        const outOfItem = !!itemId && idx < 0;
        const onCd = itemId === "recall_stone" && recallCd > 0;
        return (
          <button
            key={i}
            onClick={() => useSlot(i)}
            onContextMenu={(e) => { e.preventDefault(); setSlot(i, null); }}
            disabled={!itemId || outOfItem || onCd}
            className={`relative w-11 h-11 rounded border-2 ${!def ? "border-slate-700 bg-slate-900/50" : "border-cyan-400/70 bg-slate-800/85 hover:bg-slate-700"} flex items-center justify-center text-xl transition ${(onCd || outOfItem) ? "opacity-60" : ""}`}
            style={{ touchAction: "manipulation" }}
            title={def ? `${def.name} — key ${i + 1} · right-click clears` : `Slot ${i + 1} (empty — right-click item in inventory to bind)`}
          >
            <span className="absolute top-0 left-0.5 text-[9px] text-cyan-300 font-bold leading-none">{i + 1}</span>
            {def && (
              <>
                <span style={{ filter: onCd || outOfItem ? "grayscale(1)" : "none" }}>{def.icon}</span>
                {qty > 0 && (
                  <span className="absolute bottom-0 right-0.5 text-[9px] bg-slate-900 rounded px-0.5 font-bold text-amber-200">{qty}</span>
                )}
                {onCd && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-rose-200 bg-black/60 rounded">{recallCd}s</span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
