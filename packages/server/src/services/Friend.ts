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

export type FriendListEntry = { name: string; online: boolean };

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
      if (!friends.includes(name)) {
        friends.push(name);
        await this.prisma.character.update({
          where: { id: charId },
          data: { friendsJson: JSON.stringify(friends) } as any,
        });
      }
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
      await this.prisma.character.update({
        where: { id: charId },
        data: { friendsJson: JSON.stringify(friends) } as any,
      });
      return { ok: true, friends };
    } catch (e) {
      console.error("[friend.remove]", e);
      return { ok: false, reason: "error" };
    }
  }
}

export { MAX_FRIENDS, MAX_NAME };
