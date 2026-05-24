// Auction House — list/browse/buy items between players.
// Opens via toggle-auction event from MenuBar.

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import FocusTrap from "focus-trap-react";
import { ITEMS, type Player, type WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";

type Listing = { id: string; sellerName: string; itemId: string; qty: number; pricePer: number };

export function AuctionHouse({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useExclusiveModal("auction", open, setOpen);
  const [tab, setTab] = useState<"browse" | "sell">("browse");
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState("");
  const [busyBuy, setBusyBuy] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-auction", onToggle);
    const offBrowse = room.onMessage("auction:browse" as any, (m: any) => setListings(m.listings ?? []));
    const offBuyOk = room.onMessage("auction:buy:ok" as any, () => setBusyBuy(false));
    const offBuyErr = room.onMessage("auction:buy:err" as any, () => setBusyBuy(false));
    return () => {
      window.removeEventListener("toggle-auction", onToggle);
      offBrowse?.();
      offBuyOk?.();
      offBuyErr?.();
    };
  }, [room]);

  useEffect(() => {
    if (open && tab === "browse") room.send("auction:browse" as any, { search });
  }, [open, tab, search, room]);

  if (!open) return null;
  const me = room.state.players.get(room.sessionId) as Player | undefined;
  return (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
<div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[28rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title="🏛 {t('auction.title')}">
          <button onClick={() => setOpen(false)} aria-label={t('common.close')} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="flex gap-1 mb-2">
            <button onClick={() => setTab("browse")} className={`flex-1 py-1 rounded text-xs font-bold ${tab === "browse" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300"}`}>🔍 {t('auction.browse')}</button>
            <button onClick={() => setTab("sell")} className={`flex-1 py-1 rounded text-xs font-bold ${tab === "sell" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300"}`}>📢 {t('auction.sell')}</button>
          </div>

          {tab === "browse" && (
            <>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('auction.search')}
                className="w-full bg-slate-900/80 border border-amber-400/40 rounded px-2 py-1 text-xs text-white mb-2"
              />
              <div className="max-h-72 overflow-y-auto game-scroll space-y-1">
                {listings.length === 0 && <div className="text-slate-400 text-xs text-center py-4">{t('auction.noListings')}</div>}
                {listings.map((l) => {
                  const def = ITEMS[l.itemId];
                  const total = l.pricePer * l.qty;
                  const isMine = me?.name === l.sellerName;
                  return (
                    <div key={l.id} className="flex items-center gap-2 bg-slate-900/60 border border-white/10 rounded px-2 py-1.5">
                      <span className="text-xl">{def?.icon ?? "📦"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">{def?.name ?? l.itemId} ×{l.qty}</div>
                        <div className="text-[10px] text-slate-400 truncate">{t('auction.bySeller', { seller: l.sellerName, price: l.pricePer })}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-amber-300 font-bold">{total}z</div>
                        {isMine ? (
                          <button
                            onClick={() => {
                              if (!confirm(t('auction.cancelListing'))) return;
                              room.send("auction:cancel" as any, { id: l.id });
                            }}
                            className="bg-rose-700 hover:bg-rose-600 rounded px-2 py-0.5 text-[10px] font-bold text-white mt-0.5"
                          >{t('auction.cancel')}</button>
                        ) : (
                          <button
                            onClick={() => { if (confirm(t('auction.buyConfirm', { item: def?.name, qty: l.qty, price: total }))) { setBusyBuy(true); room.send("auction:buy" as any, { id: l.id }); } }}
                            disabled={busyBuy || (me?.zeny ?? 0) < total}
                            className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 rounded px-2 py-0.5 text-[10px] font-bold text-white mt-0.5"
                          >{busyBuy ? "..." : `💰 ${t('auction.buy')}`}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "sell" && me && (
            <SellTab room={room} me={me} t={t} />
          )}
        </GameFrame>
      </div>
    </div>
    </FocusTrap>
  );
}

function SellTab({ room, me, t }: { room: Room<WorldState>; me: Player; t: ReturnType<typeof useT> }) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [pricePer, setPricePer] = useState(100);
  const stack = pickedIdx !== null ? me.inventory[pickedIdx] : null;
  const def = stack ? ITEMS[stack.itemId] : null;
  const fee = Math.max(1, Math.floor(pricePer * qty * 0.01));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto game-scroll bg-black/40 p-1.5 rounded">
        {Array.from(me.inventory.values()).map((s, i) => {
          const d = ITEMS[s.itemId];
          if (!d || d.slot === "weapon" || d.slot === "armor") return null; // gear sold via shop, not auction
          return (
            <button
              key={i} onClick={() => { setPickedIdx(i); setQty(1); setPricePer(50); }}
              className={`relative aspect-square flex items-center justify-center rounded text-xl ${pickedIdx === i ? "bg-amber-600 ring-2 ring-amber-300" : "bg-slate-800 hover:bg-slate-700"}`}
              title={d.name}
            >
              {d.icon}
              <span className="absolute bottom-0 right-0.5 text-[8px] text-amber-200 font-bold">{s.qty}</span>
            </button>
          );
        })}
      </div>

      {stack && def && (
        <>
          <div className="text-xs text-white">{t('auction.selected')} <span className="font-bold">{def.icon} {def.name}</span> ({t('auction.have', { count: stack.qty })})</div>
          <div className="flex gap-2 items-end">
            <label className="flex-1 text-[10px] text-slate-300">
              {t('auction.quantity')}
              <input type="number" min={1} max={stack.qty} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(stack.qty, parseInt(e.target.value) || 1)))} className="w-full bg-slate-900/80 border border-amber-400/40 rounded px-2 py-1 text-xs text-white" />
            </label>
            <label className="flex-1 text-[10px] text-slate-300">
              {t('auction.pricePer')}
              <input type="number" min={1} value={pricePer} onChange={(e) => setPricePer(Math.max(1, parseInt(e.target.value) || 1))} className="w-full bg-slate-900/80 border border-amber-400/40 rounded px-2 py-1 text-xs text-white" />
            </label>
          </div>
          <div className="text-[10px] text-slate-400">
            {t('auction.total')}: <span className="text-amber-300 font-bold">{pricePer * qty}z</span> · {t('auction.fee')}: <span className="text-rose-300 font-bold">{fee}z</span>
          </div>
          <button
            onClick={() => { if (pickedIdx === null) return; room.send("auction:list" as any, { invIndex: pickedIdx, qty, pricePer }); setPickedIdx(null); }}
            className="w-full bg-amber-600 hover:bg-amber-500 rounded px-3 py-1.5 text-xs font-bold text-white"
          >{t('auction.post')}</button>
        </>
      )}
    </div>
  );
}
