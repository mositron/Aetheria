// WorldManager — server-side world lifecycle management.
//
// Handles: create world, list worlds, invite codes, join-by-code.
// Does NOT handle game logic (that lives in WorldRoom).
//
// Usage:
//   const wm = new WorldManager();
//   const world = await wm.createWorld({ name, hostId, template, mode, privacy, maxPlayers });
//   const code = wm.generateInviteCode(world.id);
//   const worlds = await wm.listPublicWorlds({ limit: 20 });

import { prisma } from "../db.js";
import { logger } from "../logger.js";

export type WorldTemplate = "forest" | "desert" | "mountain" | "island";
export type WorldMode    = "adventure" | "co-op" | "pvp";
export type WorldPrivacy = "public" | "friends" | "private";
export type WorldStatus  = "open" | "playing" | "closed";

export interface WorldMeta {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  template: WorldTemplate;
  mode: WorldMode;
  privacy: WorldPrivacy;
  maxPlayers: number;
  currentPlayers: number;
  seed: number;
  status: WorldStatus;
  inviteCode: string;
  createdAt: number;
}

export interface CreateWorldOptions {
  name: string;
  hostId: string;
  hostName: string;
  template?: WorldTemplate;
  mode?: WorldMode;
  privacy?: WorldPrivacy;
  maxPlayers?: number;
}

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class WorldManager {
  private inviteCodes = new Map<string, string>(); // code -> worldId

  /** Create a new world and generate its invite code. */
  async createWorld(opts: CreateWorldOptions): Promise<WorldMeta> {
    const id = `world_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const seed = Math.floor(Math.random() * 999999);
    const inviteCode = generateCode();

    const world = await (prisma.world.create as any)({
      data: {
        id,
        name: opts.name,
        hostId: opts.hostId,
        hostName: opts.hostName,
        template: (opts.template ?? "forest") as any,
        mode: (opts.mode ?? "adventure") as any,
        privacy: (opts.privacy ?? "private") as any,
        maxPlayers: Math.min(32, Math.max(2, opts.maxPlayers ?? 8)),
        seed,
        status: "open",
        inviteCode,
      },
    });

    this.inviteCodes.set(inviteCode, id);

    logger.info("world.created", { id, hostId: opts.hostId, name: opts.name, template: opts.template, mode: opts.mode });

    return world as unknown as WorldMeta;
  }

  /** Resolve an invite code to a worldId. Returns null if invalid/expired. */
  resolveCode(code: string): string | null {
    return this.inviteCodes.get(code.toUpperCase()) ?? null;
  }

  /** List public worlds available for joining. */
  async listPublicWorlds(limit = 20): Promise<WorldMeta[]> {
    const worlds = await prisma.world.findMany({
      where: { privacy: "public", status: { in: ["open", "playing"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return worlds as unknown as WorldMeta[];
  }

  /** Get world metadata by id. */
  async getWorld(id: string): Promise<WorldMeta | null> {
    const world = await prisma.world.findUnique({ where: { id } });
    return world ? (world as unknown as WorldMeta) : null;
  }

  /** Update world status (open→playing→closed). */
  async updateStatus(id: string, status: WorldStatus): Promise<void> {
    await prisma.world.update({ where: { id }, data: { status } });
    logger.info("world.statusChanged", { id, status });
  }

  /** Increment player count on join. */
  async onPlayerJoin(id: string): Promise<void> {
    await prisma.world.update({
      where: { id },
      data: { currentPlayers: { increment: 1 } },
    });
  }

  /** Decrement player count on leave. */
  async onPlayerLeave(id: string): Promise<void> {
    await prisma.world.update({
      where: { id },
      data: { currentPlayers: { decrement: 1 } },
    });
  }

  /** Delete a world (host action or automatic when empty). */
  async deleteWorld(id: string): Promise<void> {
    const world = await prisma.world.findUnique({ where: { id } });
    if (world?.inviteCode) {
      this.inviteCodes.delete(world.inviteCode);
    }
    await prisma.world.delete({ where: { id } });
    logger.info("world.deleted", { id });
  }

  /** Generate a new invite code for an existing world. */
  async regenerateCode(id: string): Promise<string> {
    const code = generateCode();
    await prisma.world.update({ where: { id }, data: { inviteCode: code } });
    this.inviteCodes.set(code, id);
    return code;
  }
}