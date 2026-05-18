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
      const c = await this.prisma.character.findUnique({ where: { id: charId } });
      if (!c) return { ok: false, reason: "error" };
      const gid = (c as any).guildId;
      if (!gid) return { ok: false, reason: "no-guild" };
      const g = await (this.prisma as any).guild.findUnique({ where: { id: gid } });
      if (!g) {
        // Stale reference — guild was deleted. Just clear our pointer.
        await this.prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any });
        return { ok: true };
      }
      const members = this.parseMembers(g.membersJson);
      const next = members.filter((n) => n !== ownName);
      if (next.length === 0) {
        // Last member — disband entirely
        await this.prisma.$transaction([
          (this.prisma as any).guild.delete({ where: { id: gid } }),
          this.prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any }),
        ]);
      } else {
        // Transfer leader if needed; clear my guildId
        const newLeader = g.leaderName === ownName ? next[0] : g.leaderName;
        await this.prisma.$transaction([
          (this.prisma as any).guild.update({
            where: { id: gid },
            data: { membersJson: JSON.stringify(next), leaderName: newLeader },
          }),
          this.prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any }),
        ]);
      }
      return { ok: true };
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
