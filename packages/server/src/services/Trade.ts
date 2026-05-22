import {
  Player, ItemStack, ITEMS
} from "@game/shared";

const INVENTORY_SIZE = 200;

export type TradeSession = {
  partnerSid: string;
  items: Array<{ invIndex: number; qty: number }>;
  zeny: number;
  confirmed: boolean;
  /** Snapshot of player names at time of session creation for audit logging */
  playerName: string;
  partnerName: string;
};

export class Trade {
  public sessions = new Map<string, TradeSession>();
  /** Outgoing invite requests (sent but not yet accepted) */
  private pendingInvites = new Map<string, string>(); // sid → targetSid

  private auditLog: ((action: string, opts: Record<string, unknown>) => void) | null = null;

  constructor(
    private state: { players: Map<string, Player> },
    private callbacks: {
      sendToClient: (sid: string, type: string, data: any) => void;
      addToInventory: (p: Player, itemId: string, qty: number) => boolean;
    }
  ) {}

  setAuditLog(fn: (action: string, opts: Record<string, unknown>) => void) {
    this.auditLog = fn;
  }

  handleRequest(sid: string, targetSid: string) {
    const a = this.state.players.get(sid);
    if (!a) return;
    const b = this.state.players.get(targetSid);
    if (!b || a === b) return;
    if (a.mapId !== b.mapId) return; // can't trade across maps
    if (this.sessions.has(sid) || this.pendingInvites.has(sid)) {
      return this.callbacks.sendToClient(sid, "system", { text: "ฝั่งใดฝั่งหนึ่งกำลังเทรดอยู่" });
    }
    this.pendingInvites.set(sid, targetSid);
    this.callbacks.sendToClient(targetSid, "trade:invite", { fromSid: sid, fromName: a.name });
    this.callbacks.sendToClient(sid, "system", { text: `📩 ส่งคำขอเทรดให้ ${b.name}` });
  }

  handleAccept(sid: string, fromSid: string) {
    const b = this.state.players.get(sid);
    if (!b) return;
    const a = this.state.players.get(fromSid);
    if (!a) return;
    // Must have a pending invite from fromSid targeting sid
    if (this.pendingInvites.get(fromSid) !== sid) return;

    this.pendingInvites.delete(fromSid);
    const aName = a.name, bName = b.name;
    this.sessions.set(sid, { partnerSid: fromSid, items: [], zeny: 0, confirmed: false, playerName: bName, partnerName: aName });
    this.sessions.set(fromSid, { partnerSid: sid, items: [], zeny: 0, confirmed: false, playerName: aName, partnerName: bName });

    const s1 = this.sessions.get(fromSid);
    const s2 = this.sessions.get(sid);
    if (!s1 || !s2) return;

    this.callbacks.sendToClient(fromSid, "trade:state", { meItems: s1.items, meZeny: s1.zeny, meConfirmed: s1.confirmed, themItems: s2.items, themZeny: s2.zeny, themConfirmed: s2.confirmed, partner: b.name });
    this.callbacks.sendToClient(sid, "trade:state", { meItems: s2.items, meZeny: s2.zeny, meConfirmed: s2.confirmed, themItems: s1.items, themZeny: s1.zeny, themConfirmed: s1.confirmed, partner: a.name });
  }

  handleOffer(sid: string, offeredItems: Array<{ invIndex: number; qty: number }>, offeredZeny: number) {
    const me = this.state.players.get(sid);
    const sess = this.sessions.get(sid);
    if (!me || !sess) return;

    const zeny = Math.max(0, Math.min(me.zeny, offeredZeny | 0));
    const cleaned: typeof offeredItems = [];
    for (const it of offeredItems) {
      const stack = me.inventory[it.invIndex];
      if (!stack) continue;
      const qty = Math.max(1, Math.min(stack.qty, it.qty));
      cleaned.push({ invIndex: it.invIndex, qty });
    }

    sess.items = cleaned;
    sess.zeny = zeny;
    sess.confirmed = false;
    const partner = this.sessions.get(sess.partnerSid);
    if (partner) partner.confirmed = false;

    const partnerSid = sess.partnerSid;
    const partnerPlayer = this.state.players.get(partnerSid);
    this.callbacks.sendToClient(sid, "trade:state", { meItems: sess.items, meZeny: sess.zeny, meConfirmed: sess.confirmed, themItems: partner?.items ?? [], themZeny: partner?.zeny ?? 0, themConfirmed: partner?.confirmed ?? false, partner: partnerPlayer?.name ?? "?" });
    if (partner) {
      this.callbacks.sendToClient(partnerSid, "trade:state", { meItems: partner.items, meZeny: partner.zeny, meConfirmed: partner.confirmed, themItems: sess.items, themZeny: sess.zeny, themConfirmed: sess.confirmed, partner: me.name });
    }
  }

  handleConfirm(sid: string) {
    const sess = this.sessions.get(sid);
    if (!sess) return;
    sess.confirmed = true;
    const partner = this.sessions.get(sess.partnerSid);
    if (!partner) return;

    if (sess.confirmed && partner.confirmed) {
      const a = this.state.players.get(sid);
      const b = this.state.players.get(sess.partnerSid);
      if (!a || !b) { this.cancelTrade(sid); return; }

      if (a.zeny < sess.zeny || b.zeny < partner.zeny) { this.cancelTrade(sid); return; }

      const self = this;
      const takeFrom = (p: Player, list: Array<{ invIndex: number; qty: number }>) => {
        const taken: Array<{ itemId: string; qty: number }> = [];
        const sorted = list.slice().sort((x, y) => y.invIndex - x.invIndex);
        for (const it of sorted) {
          const stack = p.inventory[it.invIndex];
          if (!stack || stack.qty < it.qty) throw new Error("invalid");
          taken.push({ itemId: stack.itemId, qty: it.qty });
          stack.qty -= it.qty;
          if (stack.qty <= 0) p.inventory.splice(it.invIndex, 1);
        }
        return taken;
      };

      const aFreeAfter = (INVENTORY_SIZE - a.inventory.length) + sess.items.length;
      const bFreeAfter = (INVENTORY_SIZE - b.inventory.length) + partner.items.length;
      if (aFreeAfter < partner.items.length || bFreeAfter < sess.items.length) {
        this.cancelTrade(sid);
        this.callbacks.sendToClient(sid, "system", { text: "⚠ ฝั่งใดฝั่งหนึ่งกระเป๋าจะเต็ม — เทรดถูกยกเลิก" });
        this.callbacks.sendToClient(sess.partnerSid, "system", { text: "⚠ ฝั่งใดฝั่งหนึ่งกระเป๋าจะเต็ม — เทรดถูกยกเลิก" });
        return;
      }

      const aSnapshot = a.inventory.map((s: any) => ({ itemId: s.itemId, qty: s.qty }));
      const bSnapshot = b.inventory.map((s: any) => ({ itemId: s.itemId, qty: s.qty }));
      const aZenyPre = a.zeny;
      const bZenyPre = b.zeny;

      try {
        const aGives = takeFrom(a, sess.items);
        const bGives = takeFrom(b, partner.items);

        for (const it of bGives) {
          if (!this.callbacks.addToInventory(a, it.itemId, it.qty)) throw new Error("inv-full-a");
        }
        for (const it of aGives) {
          if (!this.callbacks.addToInventory(b, it.itemId, it.qty)) throw new Error("inv-full-b");
        }

        a.zeny = aZenyPre - sess.zeny + partner.zeny;
        b.zeny = bZenyPre - partner.zeny + sess.zeny;

        this.callbacks.sendToClient(sid, "trade:done", {});
        this.callbacks.sendToClient(sid, "system", { text: "✅ เทรดสำเร็จ" });
        this.callbacks.sendToClient(sess.partnerSid, "trade:done", {});
        this.callbacks.sendToClient(sess.partnerSid, "system", { text: "✅ เทรดสำเร็จ" });
        this.auditLog?.("trade.complete", { metadata: { aName: sess.playerName, bName: sess.partnerName, aZeny: sess.zeny, bZeny: partner.zeny, aItems: sess.items.length, bItems: partner.items.length } });
      } catch (err: any) {
        a.inventory.splice(0, a.inventory.length);
        for (const s of aSnapshot) {
          const item = new ItemStack();
          item.itemId = s.itemId;
          item.qty = s.qty;
          a.inventory.push(item);
        }
        b.inventory.splice(0, b.inventory.length);
        for (const s of bSnapshot) {
          const item = new ItemStack();
          item.itemId = s.itemId;
          item.qty = s.qty;
          b.inventory.push(item);
        }
        a.zeny = aZenyPre; b.zeny = bZenyPre;

        const safeMsg = err?.message === "inv-full-a" || err?.message === "inv-full-b"
          ? "กระเป๋าของฝ่ายใดฝั่งหนึ่งเต็ม"
          : "ของไม่พอ หรือสถานะเปลี่ยน";
        console.error("[trade] failed", err);
        this.callbacks.sendToClient(sid, "system", { text: `⚠ เทรดล้มเหลว: ${safeMsg}` });
        this.callbacks.sendToClient(sess.partnerSid, "system", { text: `⚠ เทรดล้มเหลว: ${safeMsg}` });
      } finally {
        this.sessions.delete(sid);
        this.sessions.delete(sess.partnerSid);
      }
    } else {
      this.callbacks.sendToClient(sess.partnerSid, "trade:partner-confirmed", {});
    }
  }

  cancelTrade(sid: string) {
    const sess = this.sessions.get(sid);
    if (!sess) return;
    const partnerSid = sess.partnerSid;
    this.sessions.delete(sid);
    this.sessions.delete(partnerSid);
    this.auditLog?.("trade.cancel", { metadata: { aName: sess.playerName, bName: sess.partnerName } });
    this.callbacks.sendToClient(sid, "trade:cancelled", {});
    this.callbacks.sendToClient(sid, "system", { text: "🚫 ยกเลิกเทรด" });
    this.callbacks.sendToClient(partnerSid, "trade:cancelled", {});
    this.callbacks.sendToClient(partnerSid, "system", { text: "🚫 ยกเลิกเทรด" });
  }
}

export function registerTradeHandlers(deps: {
  tradeSvc: Trade;
}) {
  const { tradeSvc } = deps;

  return {
    "trade:request": (client: any, msg: any) => {
      tradeSvc.handleRequest(client.sessionId, msg?.toSid);
    },
    "trade:accept": (client: any, msg: any) => {
      tradeSvc.handleAccept(client.sessionId, msg?.fromSid);
    },
    "trade:offer": (client: any, msg: any) => {
      tradeSvc.handleOffer(client.sessionId, msg?.items, msg?.zeny);
    },
    "trade:confirm": (client: any) => {
      tradeSvc.handleConfirm(client.sessionId);
    },
    "trade:cancel": (client: any) => {
      tradeSvc.cancelTrade(client.sessionId);
    },
  };
}
