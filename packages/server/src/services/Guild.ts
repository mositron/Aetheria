// Guild service. DB-backed (prisma.guild + Character.guildId) with
// transactional integrity for create/leave/disband.
//
// Notable invariants:
//   - One character belongs to at most one guild (Character.guildId)
//   - Names are unique (DB constraint)
//   - leave() uses $transaction so guildId on the Character can never
//     point to a Guild row that the same transaction deleted
//   - Stale guildId references auto-clear when guild row not found

import type { PrismaClient } from "@prisma/client";

const MAX_NAME = 24;
const MAX_TAG = 4;

export type GuildInfo = {
  id: string;
  name: string;
  tag: string;
  leader: string;
  members: string[];
};

export type CreateResult =
  | { ok: true; info: GuildInfo }
  | { ok: false; reason: "name-empty" | "already-in-guild" | "name-taken" | "error" };

export type JoinResult =
  | { ok: true; info: GuildInfo }
  | { ok: false; reason: "not-found" | "already-in-guild" | "error" };

export type LeaveResult =
  | { ok: true }
  | { ok: false; reason: "no-guild" | "error" };

export class Guild {
  constructor(private prisma: PrismaClient) {}

  private parseMembers(raw: unknown): string[] {
    if (typeof raw !== "string") return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
    } catch { return []; }
  }

  async create(charId: string, ownName: string, name: string, tag: string): Promise<CreateResult> {
    const cleanName = name.trim().slice(0, MAX_NAME);
    const cleanTag = tag.trim().slice(0, MAX_TAG).toUpperCase();
    if (!cleanName) return { ok: false, reason: "name-empty" };
    try {
      const c = await this.prisma.character.findUnique({ where: { id: charId } });
      if (!c) return { ok: false, reason: "error" };
      if ((c as any).guildId) return { ok: false, reason: "already-in-guild" };

      const dup = await (this.prisma as any).guild.findUnique({ where: { name: cleanName } }).catch(() => null);
      if (dup) return { ok: false, reason: "name-taken" };

      const g = await (this.prisma as any).guild.create({
        data: { name: cleanName, tag: cleanTag, leaderName: ownName, membersJson: JSON.stringify([ownName]) },
      });
      await this.prisma.character.update({ where: { id: charId }, data: { guildId: g.id } as any });
      return { ok: true, info: { id: g.id, name: g.name, tag: g.tag, leader: g.leaderName, members: [ownName] } };
    } catch (e: any) {
      console.error("[guild.create]", e);
      // Treat P2002 as name-taken (race we lost)
      if (e?.code === "P2002") return { ok: false, reason: "name-taken" };
      return { ok: false, reason: "error" };
    }
  }

  async join(charId: string, ownName: string, guildName: string): Promise<JoinResult> {
    const cleanName = guildName.trim();
    if (!cleanName) return { ok: false, reason: "not-found" };
    try {
      const c = await this.prisma.character.findUnique({ where: { id: charId } });
      if (!c) return { ok: false, reason: "error" };
      if ((c as any).guildId) return { ok: false, reason: "already-in-guild" };
      const g = await (this.prisma as any).guild.findUnique({ where: { name: cleanName } });
      if (!g) return { ok: false, reason: "not-found" };
      const members = this.parseMembers(g.membersJson);
      if (!members.includes(ownName)) members.push(ownName);
      await (this.prisma as any).guild.update({
        where: { id: g.id }, data: { membersJson: JSON.stringify(members) },
      });
      await this.prisma.character.update({ where: { id: charId }, data: { guildId: g.id } as any });
      return { ok: true, info: { id: g.id, name: g.name, tag: g.tag, leader: g.leaderName, members } };
    } catch (e) {
      console.error("[guild.join]", e);
      return { ok: false, reason: "error" };
    }
  }

  async leave(charId: string, ownName: string): Promise<LeaveResult> {
    try {
      // Run the entire read-compute-write as one interactive $transaction so
      // two simultaneous leave()s on the same guild serialize. Without this,
      // both invocations could read the same stale member list and the second
      // write would overwrite the first — double-promoting a new leader or
      // leaving the member-list out of sync with leaderName.
      return await this.prisma.$transaction(async (tx): Promise<LeaveResult> => {
        const c = await tx.character.findUnique({ where: { id: charId } });
        if (!c) return { ok: false, reason: "error" };
        const gid = (c as any).guildId;
        if (!gid) return { ok: false, reason: "no-guild" };
        const g = await (tx as any).guild.findUnique({ where: { id: gid } });
        if (!g) {
          await tx.character.update({ where: { id: charId }, data: { guildId: "" } as any });
          return { ok: true };
        }
        const members = this.parseMembers(g.membersJson);
        const next = members.filter((n) => n !== ownName);
        if (next.length === 0) {
          await (tx as any).guild.delete({ where: { id: gid } });
          await tx.character.update({ where: { id: charId }, data: { guildId: "" } as any });
        } else {
          const newLeader = g.leaderName === ownName ? next[0] : g.leaderName;
          await (tx as any).guild.update({
            where: { id: gid },
            data: { membersJson: JSON.stringify(next), leaderName: newLeader },
          });
          await tx.character.update({ where: { id: charId }, data: { guildId: "" } as any });
        }
        return { ok: true };
      });
    } catch (e) {
      console.error("[guild.leave]", e);
      return { ok: false, reason: "error" };
    }
  }

  /** Get guild info for a character, or null if not in a guild. Auto-clears stale ref. */
  async infoForChar(charId: string): Promise<GuildInfo | null> {
    try {
      const c = await this.prisma.character.findUnique({ where: { id: charId } });
      if (!c) return null;
      const gid = (c as any).guildId;
      if (!gid) return null;
      const g = await (this.prisma as any).guild.findUnique({ where: { id: gid } });
      if (!g) {
        // Stale — auto-clear and return null
        await this.prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any })
          .catch(() => { /* race with another auto-clear */ });
        return null;
      }
      return { id: g.id, name: g.name, tag: g.tag, leader: g.leaderName, members: this.parseMembers(g.membersJson) };
    } catch (e) {
      console.error("[guild.infoForChar]", e);
      return null;
    }
  }

  /** Members of the guild this character belongs to (for chat broadcast). */
  async membersOf(charId: string): Promise<string[]> {
    const info = await this.infoForChar(charId);
    return info?.members ?? [];
  }
}

export function registerGuildHandlers(deps: {
  prisma: PrismaClient;
  state: { players: Map<string, any> };
  getPlayer: (sid: string) => any;
  sendToClient: (sid: string, type: string, data: any) => void;
  getCharId: (sid: string) => string | undefined;
  checkRateLimit: (sid: string, key: string, maxCount: number, windowMs: number) => boolean;
  clients: any[];
}) {
  const guild = new Guild(deps.prisma);
  const { getPlayer, sendToClient, getCharId, checkRateLimit } = deps;

  return {
    "guild:create": async (client: any, msg: any) => {
      const me = getPlayer(client.sessionId);
      const charId = getCharId(client.sessionId);
      if (!me || !charId) return;
      const r = await guild.create(charId, me.name, String(msg?.name ?? ""), String(msg?.tag ?? ""));
      if (!r.ok) {
        const reasonMsg = r.reason === "name-empty" ? "ตั้งชื่อกิลด์ก่อน"
          : r.reason === "already-in-guild" ? "อยู่กิลด์อื่นแล้ว ออกก่อน"
          : r.reason === "name-taken" ? "ชื่อนี้ถูกใช้แล้ว"
          : "สร้างกิลด์ไม่สำเร็จ";
        return sendToClient(client.sessionId, "system", { text: reasonMsg });
      }
      sendToClient(client.sessionId, "guild:info", r.info);
    },

    "guild:join": async (client: any, msg: any) => {
      const me = getPlayer(client.sessionId);
      const charId = getCharId(client.sessionId);
      if (!me || !charId) return;
      const r = await guild.join(charId, me.name, String(msg?.name ?? ""));
      if (!r.ok) {
        const reasonMsg = r.reason === "not-found" ? `ไม่พบกิลด์ "${msg?.name}"`
          : r.reason === "already-in-guild" ? "อยู่กิลด์อื่นแล้ว ออกก่อน"
          : "";
        if (reasonMsg) sendToClient(client.sessionId, "system", { text: reasonMsg });
        return;
      }
      sendToClient(client.sessionId, "guild:info", r.info);
    },

    "guild:leave": async (client: any) => {
      const me = getPlayer(client.sessionId);
      const charId = getCharId(client.sessionId);
      if (!me || !charId) return;
      const r = await guild.leave(charId, me.name);
      if (r.ok) sendToClient(client.sessionId, "guild:info", null as any);
    },

    "guild:info": async (client: any) => {
      const charId = getCharId(client.sessionId);
      if (!charId) return;
      const info = await guild.infoForChar(charId);
      sendToClient(client.sessionId, "guild:info", info as any);
    },

    "guild:chat": async (client: any, msg: any) => {
      const me = getPlayer(client.sessionId);
      const charId = getCharId(client.sessionId);
      if (!me || !charId) return;
      if (!checkRateLimit(client.sessionId, "guild-chat", 5, 5000)) {
        return sendToClient(client.sessionId, "system", { text: "⏸ ส่งช้าๆ" });
      }
      const text = String(msg?.text ?? "").slice(0, 200).trim();
      if (!text) return;
      const members = await guild.membersOf(charId);
      if (members.length === 0) return;
      for (const cl of deps.clients) {
        const p = getPlayer(cl.sessionId);
        if (p && members.includes(p.name)) {
          sendToClient(cl.sessionId, "guild:chat", { from: me.name, text, ts: Date.now() });
        }
      }
    },
  };
}
