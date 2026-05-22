// P2P trade window. Opens on trade:invite (accept prompt) or via "Trade"
// button when targeting another player. Two columns (me / them), item picker,
// zeny input, lock + confirm flow.

import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";

type Offer = { invIndex: number; qty: number };
type State = {
  meItems: Offer[]; meZeny: number; meConfirmed: boolean;
  themItems: Offer[]; themZeny: number; themConfirmed: boolean;
  partner: string;
};

export function TradeWindow({ room }: { room: Room<WorldState> }) {
  const [invite, setInvite] = useState<{ fromSid: string; fromName: string } | null>(null);
  const [state, setState] = useState<State | null>(null);
  const targetPlayerId = useStore((s) => s.targetPlayerId);
  const me = room.state.players.get(room.sessionId);
  const t = useT();

  useEffect(() => {
    const offInv = room.onMessage("trade:invite" as any, (m: any) => setInvite(m));
    const offState = room.onMessage("trade:state" as any, (m: any) => { setState(m); setInvite(null); });
    const offDone = room.onMessage("trade:done" as any, () => setState(null));
    const offCancel = room.onMessage("trade:cancelled" as any, () => { setState(null); setInvite(null); });
    return () => { offInv?.(); offState?.(); offDone?.(); offCancel?.(); };
  }, [room]);

  // "Trade with" button when targeting another player
  function requestTrade() {
    if (!targetPlayerId) return;
    room.send("trade:request" as any, { toSid: targetPlayerId });
  }

  if (invite) {
    return (
      <div data-no-screen-joy className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm">
        <div className="w-[18rem]">
          <GameFrame title={t('trade.tradeRequest')}>
            <div className="text-sm text-white mb-3">{t('trade.requestFrom', { name: invite.fromName })}</div>
            <div className="flex gap-2">
              <button
                onClick={() => room.send("trade:accept" as any, { fromSid: invite.fromSid })}
                className="flex-1 bg-emerald-700 hover:bg-emerald-600 rounded px-3 py-1.5 text-xs font-bold text-white"
              >✅ {t('trade.accept')}</button>
              <button
                onClick={() => setInvite(null)}
                className="flex-1 bg-rose-700 hover:bg-rose-600 rounded px-3 py-1.5 text-xs font-bold text-white"
              >🚫 {t('trade.reject')}</button>
            </div>
          </GameFrame>
        </div>
      </div>
    );
  }

  if (!state || !me) {
    // Show "Trade" button when targeting a different player
    if (!targetPlayerId || targetPlayerId === room.sessionId) return null;
    return (
      <button
        onClick={requestTrade}
        className="absolute top-[5.5rem] left-1/2 -translate-x-1/2 bg-cyan-700 hover:bg-cyan-600 border-2 border-cyan-300 rounded-full px-3 py-1 text-xs font-bold text-white z-30"
      >🤝 {t('trade.requestTrade')}</button>
    );
  }

  return (
    <div data-no-screen-joy className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4">
      <div className="w-[32rem] max-w-[96vw]">
        <GameFrame title={t('trade.tradingWith', { partner: state.partner })}>
          <button onClick={() => room.send("trade:cancel" as any, {})} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Side label={t('trade.myOffer')} offer={state.meItems} zeny={state.meZeny} confirmed={state.meConfirmed} me={me} canEdit={true} room={room} t={t} />
            <Side label={state.partner} offer={state.themItems} zeny={state.themZeny} confirmed={state.themConfirmed} me={null} canEdit={false} room={room} t={t} />
          </div>

          <button
            disabled={state.meConfirmed}
            onClick={() => room.send("trade:confirm" as any, {})}
            className={`w-full mt-3 rounded px-3 py-2 text-sm font-bold text-white ${state.meConfirmed ? "bg-slate-600" : "bg-amber-600 hover:bg-amber-500"}`}
          >
            {state.meConfirmed ? (state.themConfirmed ? t('trade.processing') : t('trade.waitingConfirm')) : t('trade.confirm')}
          </button>
        </GameFrame>
      </div>
    </div>
  );
}

function Side({ label, offer, zeny, confirmed, me, canEdit, room, t }: { label: string; offer: Offer[]; zeny: number; confirmed: boolean; me: Player | null; canEdit: boolean; room: Room<WorldState>; t: ReturnType<typeof useT> }) {
  const [draftZeny, setDraftZeny] = useState(zeny);
  useEffect(() => { setDraftZeny(zeny); }, [zeny]);

  function update(newOffer: Offer[], newZeny: number) {
    room.send("trade:offer" as any, { items: newOffer, zeny: newZeny });
  }

  function addItem(invIndex: number) {
    const next = offer.some((o) => o.invIndex === invIndex)
      ? offer.filter((o) => o.invIndex !== invIndex)
      : [...offer, { invIndex, qty: 1 }];
    update(next, draftZeny);
  }

  return (
    <div className={`bg-slate-900/60 border rounded p-2 ${confirmed ? "border-emerald-400/60" : "border-white/15"}`}>
      <div className="text-[11px] font-bold text-cyan-300 mb-1 flex items-center justify-between">
        <span>{label}</span>
        {confirmed && <span className="text-emerald-300">{t('trade.locked')}</span>}
      </div>
      <div className="space-y-1 text-[10px] max-h-32 overflow-y-auto game-scroll">
        {offer.length === 0 && <div className="text-slate-500 italic">{t('trade.noItems')}</div>}
        {offer.map((o, i) => {
          const stack = me?.inventory[o.invIndex];
          const def = stack ? ITEMS[stack.itemId] : null;
          return (
            <div key={i} className="flex items-center gap-1 bg-slate-800/60 rounded px-1.5 py-0.5">
              <span>{def?.icon ?? "📦"}</span>
              <span className="flex-1 text-white">{def?.name ?? "?"} ×{o.qty}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] text-amber-300">💰 {zeny}z</div>
      {canEdit && me && (
        <div className="mt-1 space-y-1">
          <div className="flex items-center gap-1">
            <input type="number" min={0} max={me.zeny} value={draftZeny}
              onChange={(e) => setDraftZeny(Math.max(0, Math.min(me.zeny, parseInt(e.target.value) || 0)))}
              onBlur={() => update(offer, draftZeny)}
              className="flex-1 bg-slate-900 border border-amber-400/40 rounded px-1.5 py-0.5 text-[10px] text-white"
            />
            <button onClick={() => update(offer, draftZeny)} className="bg-amber-600 hover:bg-amber-500 rounded px-1.5 py-0.5 text-[9px] font-bold text-white">{t('trade.setZeny')}</button>
          </div>
          <div className="grid grid-cols-6 gap-0.5 max-h-20 overflow-y-auto game-scroll bg-black/40 p-0.5 rounded">
            {Array.from(me.inventory.values()).map((s, i) => {
              const def = ITEMS[s.itemId];
              if (!def) return null;
              const picked = offer.some((o) => o.invIndex === i);
              return (
                <button
                  key={i} onClick={() => addItem(i)}
                  className={`aspect-square flex items-center justify-center text-sm rounded ${picked ? "bg-emerald-700 ring-1 ring-emerald-300" : "bg-slate-800 hover:bg-slate-700"}`}
                  title={`${def.name} ×${s.qty}`}
                >{def.icon}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
