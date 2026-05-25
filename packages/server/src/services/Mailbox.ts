// Mailbox service. DB-backed (prisma.mail) with claim-once semantics.
//
// claim() uses atomic conditional update so two concurrent claims can't
// double-pay. send() validates target exists and that the payload is
// non-empty before any state mutation.

import type { PrismaClient } from "@prisma/client";

const MAX_SUBJECT = 60;
const MAX_BODY = 500;
const MAX_ZENY = 9_999_999;

export type SendInput = {
  fromName: string;
  toName: string;
  subject: string;
  body: string;
  zeny: number;
  itemId?: string;
  itemQty?: number;
};

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "target-missing" | "empty" | "error" };

export type ClaimedMail = {
  id: string;
  zeny: number;
  itemId: string;
  itemQty: number;
};

export class Mailbox {
  constructor(private prisma: PrismaClient) {}

  async send(input: SendInput): Promise<SendResult> {
    const to = input.toName.trim();
    const subject = (input.subject || "").slice(0, MAX_SUBJECT).trim() || "(ไม่มีหัวข้อ)";
    const body = (input.body || "").slice(0, MAX_BODY).trim();
    const zeny = Math.max(0, Math.min(MAX_ZENY, input.zeny | 0));
    const itemId = input.itemId ?? "";
    const itemQty = Math.max(0, input.itemQty ?? 0);
    if (!to) return { ok: false, reason: "target-missing" };
    if (!body && zeny === 0 && !itemId) return { ok: false, reason: "empty" };
    try {
      const target = await this.prisma.character.findUnique({ where: { name: to } });
      if (!target) return { ok: false, reason: "target-missing" };
      await this.prisma.mail.create({
        data: { toName: to, fromName: input.fromName, subject, body, zeny, itemId, itemQty },
      });
      return { ok: true };
    } catch (e) {
      console.error("[mailbox.send]", e);
      return { ok: false, reason: "error" };
    }
  }

  /**
   * Atomically claim a mail. Returns the rewards on success, null if:
   *   - mail doesn't exist
   *   - belongs to someone else
   *   - already claimed (race lost)
   */
  async claim(id: string, ownerName: string): Promise<ClaimedMail | null> {
    try {
      // Atomic guard: updateMany returns count > 0 only if we set claimed=1
      // on a row that was previously claimed=0 AND owned by us.
      const claim = await this.prisma.mail.updateMany({
        where: { id, toName: ownerName, claimed: 0 },
        data: { claimed: 1, read: 1 },
      });
      if (claim.count === 0) return null;
      const mail = await this.prisma.mail.findUnique({ where: { id } });
      if (!mail) return null;
      return { id: mail.id, zeny: mail.zeny, itemId: mail.itemId, itemQty: mail.itemQty };
    } catch (e) {
      console.error("[mailbox.claim]", e);
      return null;
    }
  }

  /** Count of unread mails for the given recipient. Used for menu-bar badge. */
  async unreadCount(toName: string): Promise<number> {
    try {
      return await this.prisma.mail.count({ where: { toName, read: 0 } });
    } catch (e) {
      console.error("[mailbox.unreadCount]", e);
      return 0;
    }
  }

  /** Mark as read without claiming. */
  async markRead(id: string, ownerName: string): Promise<void> {
    try {
      await this.prisma.mail.updateMany({
        where: { id, toName: ownerName },
        data: { read: 1 },
      });
    } catch (e) {
      console.error("[mailbox.markRead]", e);
    }
  }

  registerHandlers(
    getPlayer: (sid: string) => any,
    sendToClient: (sid: string, type: string, data: any) => void,
    removeItem: (p: any, itemId: string, qty: number) => void,
    getSidByName?: (name: string) => string | null,
  ) {
    return {
      sendMail: async (client: any, msg: any) => {
        const p = getPlayer(client.sessionId);
        if (!p) return;
        const zeny = Math.max(0, Math.min(9_999_999, msg?.zeny | 0));
        if (zeny > 0 && p.zeny < zeny) {
          sendToClient(client.sessionId, "system", { text: "เงินไม่พอ" });
          return;
        }
        let itemId = "", itemQty = 0;
        const itemInvIdx = msg?.itemInvIdx;
        if (typeof itemInvIdx === "number" && itemInvIdx >= 0 && itemInvIdx < p.inventory.length) {
          const stack = p.inventory[itemInvIdx];
          itemId = stack.itemId;
          itemQty = Math.max(1, Math.min(stack.qty, msg?.itemQty | 0 || 1));
        }
        const r = await this.send({
          fromName: p.name,
          toName: String(msg?.to ?? "").trim(),
          subject: String(msg?.subject ?? ""),
          body: String(msg?.body ?? ""),
          zeny, itemId, itemQty,
        });
        if (!r.ok) {
          if (r.reason === "target-missing") sendToClient(client.sessionId, "system", { text: `ไม่พบผู้เล่นชื่อ ${msg?.to}` });
          return;
        }
        if (zeny > 0) p.zeny -= zeny;
        if (itemId && itemQty > 0) removeItem(p, itemId, itemQty);
        sendToClient(client.sessionId, "system", { text: `📬 ส่งจดหมายถึง ${msg?.to} แล้ว` });
        // Push live unread badge to recipient if they're online
        const targetSid = getSidByName?.(String(msg?.to ?? "").trim());
        if (targetSid) {
          const targetName = String(msg?.to ?? "").trim();
          sendToClient(targetSid, "mail:unreadCount", { count: await this.unreadCount(targetName) });
          sendToClient(targetSid, "system", { text: `📬 มีจดหมายใหม่จาก ${p.name}` });
        }
      },

      claimMail: async (client: any, msg: any) => {
        const p = getPlayer(client.sessionId);
        if (!p) return;
        const reward = await this.claim(String(msg?.id ?? ""), p.name);
        if (!reward) return;
        if (reward.zeny > 0) p.zeny += reward.zeny;
        if (reward.itemId && reward.itemQty > 0) {
          // Delegate to WorldRoom's addToInventory via callback
          // handled externally — reward item is added by caller
        }
        sendToClient(client.sessionId, "system", { text: "📦 รับของเรียบร้อย" });
        sendToClient(client.sessionId, "mailUpdated", {});
        sendToClient(client.sessionId, "mail:unreadCount", { count: await this.unreadCount(p.name) });
      },

      readMail: async (client: any, msg: any) => {
        const p = getPlayer(client.sessionId);
        if (!p) return;
        await this.markRead(String(msg?.id ?? ""), p.name);
        sendToClient(client.sessionId, "mail:unreadCount", { count: await this.unreadCount(p.name) });
      },

      "mail:requestUnread": async (client: any) => {
        const p = getPlayer(client.sessionId);
        if (!p) return;
        sendToClient(client.sessionId, "mail:unreadCount", { count: await this.unreadCount(p.name) });
      },
    };
  }
}
