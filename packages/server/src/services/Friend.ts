// Friend list service. DB-backed (Character.friendsJson) so no in-memory state.
//
// Validation lives here:
//   - self-add rejected
//   - target character must exist
//   - friend list capped at MAX_FRIENDS
//   - name length capped (defense in depth)

import type { PrismaClient } from "@prisma/client";

const MAX_FRIENDS = 100;
const MAX_NAME = 24;

export type FriendListEntry = { name: string; online: boolean; cave?: string | null; x?: number; z?: number };

export type FriendAddResult =
  | { ok: true; friends: string[] }
  | { ok: false; reason: "self" | "missing" | "full" | "error" };

export type FriendRemoveResult =
  | { ok: true; friends: string[] }
  | { ok: false; reason: "error" };

export class Friend {
  constructor(private prisma: PrismaClient) {}

  private parseFriends(raw: unknown): string[] {
    if (typeof raw !== "string") return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((s): s is string => typeof s === "string");
    } catch { return []; }
  }

  async list(charId: string): Promise<string[]> {
    const c = await this.prisma.character.findUnique({ where: { id: charId } });
    if (!c) return [];
    return this.parseFriends((c as any).friendsJson);
  }

  async add(charId: string, ownName: string, targetName: string): Promise<FriendAddResult> {
    const name = targetName.trim().slice(0, MAX_NAME);
    if (!name || name === ownName) return { ok: false, reason: "self" };
    try {
      const target = await this.prisma.character.findUnique({ where: { name } });
      if (!target) return { ok: false, reason: "missing" };
      const c = await this.prisma.character.findUnique({ where: { id: charId } });
      if (!c) return { ok: false, reason: "error" };
      const friends = this.parseFriends((c as any).friendsJson);
      if (friends.length >= MAX_FRIENDS) return { ok: false, reason: "full" };
      const targetFriends = this.parseFriends((target as any).friendsJson);
      // Bidirectional friendship: mirror the entry on the target's list too.
      // Wrap both writes in a transaction so a half-updated pair cannot remain
      // if one update fails.
      const myUpdate = friends.includes(name) ? null : { friendsJson: JSON.stringify([...friends, name]) };
      const theirUpdate = targetFriends.includes(ownName) ? null : { friendsJson: JSON.stringify([...targetFriends, ownName]) };
      if (myUpdate || theirUpdate) {
        await this.prisma.$transaction([
          ...(myUpdate ? [this.prisma.character.update({ where: { id: charId }, data: myUpdate as any })] : []),
          ...(theirUpdate ? [this.prisma.character.update({ where: { id: (target as any).id }, data: theirUpdate as any })] : []),
        ]);
      }
      if (!friends.includes(name)) friends.push(name);
      return { ok: true, friends };
    } catch (e) {
      console.error("[friend.add]", e);
      return { ok: false, reason: "error" };
    }
  }

  async remove(charId: string, targetName: string): Promise<FriendRemoveResult> {
    try {
      const c = await this.prisma.character.findUnique({ where: { id: charId } });
      if (!c) return { ok: false, reason: "error" };
      const friends = this.parseFriends((c as any).friendsJson).filter((n) => n !== targetName);
      // Mirror the removal on the target's friend list. Best-effort: if the
      // target row doesn't exist (deleted character) we still clear our side.
      const ownName = (c as any).name as string;
      const target = await this.prisma.character.findUnique({ where: { name: targetName } });
      const targetFriends = target ? this.parseFriends((target as any).friendsJson).filter((n) => n !== ownName) : null;
      await this.prisma.$transaction([
        this.prisma.character.update({ where: { id: charId }, data: { friendsJson: JSON.stringify(friends) } as any }),
        ...(target && targetFriends ? [this.prisma.character.update({ where: { id: (target as any).id }, data: { friendsJson: JSON.stringify(targetFriends) } as any })] : []),
      ]);
      return { ok: true, friends };
    } catch (e) {
      console.error("[friend.remove]", e);
      return { ok: false, reason: "error" };
    }
  }

  registerHandlers(
    isOnline: (name: string) => boolean,
    sendToClient: (sid: string, type: string, data: any) => void,
    getCharId: (sid: string) => string | undefined,
    getPlayer: (sid: string) => any,
    getLocation?: (name: string) => { cave: string | null; x: number; z: number } | null,
  ) {
    const enrich = (names: string[]): FriendListEntry[] => names.map((n) => {
      const online = isOnline(n);
      const loc = online && getLocation ? getLocation(n) : null;
      return loc
        ? { name: n, online, cave: loc.cave, x: loc.x, z: loc.z }
        : { name: n, online };
    });
    return {
      "friend:add": async (client: any, msg: any) => {
        const me = getPlayer(client.sessionId);
        const charId = getCharId(client.sessionId);
        if (!me || !charId) return;
        const r = await this.add(charId, me.name, String(msg?.name ?? ""));
        if (!r.ok) {
          const reasonMsg = r.reason === "self" ? ""
            : r.reason === "missing" ? `ไม่พบตัวละครชื่อ "${msg?.name}"`
            : r.reason === "full" ? "เพื่อนเต็ม (สูงสุด 100 คน) — ลบบางคนออกก่อน"
            : "";
          if (reasonMsg) sendToClient(client.sessionId, "system", { text: reasonMsg });
          return;
        }
        sendToClient(client.sessionId, "friend:list", { friends: enrich(r.friends) });
      },

      "friend:remove": async (client: any, msg: any) => {
        const charId = getCharId(client.sessionId);
        if (!charId) return;
        const r = await this.remove(charId, String(msg?.name ?? "").trim());
        if (r.ok) sendToClient(client.sessionId, "friend:list", { friends: enrich(r.friends) });
      },

      "friend:list": async (client: any) => {
        const charId = getCharId(client.sessionId);
        if (!charId) return;
        const friends = await this.list(charId);
        sendToClient(client.sessionId, "friend:list", { friends: enrich(friends) });
      },
    };
  }
}

export { MAX_FRIENDS, MAX_NAME };
