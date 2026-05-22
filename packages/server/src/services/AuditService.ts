import { prisma } from "../db.js";

export type AuditOpts = {
  userId?: string | null;
  characterId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
};

export class AuditService {
  /**
   * Write an audit log entry to the database.
   * Fire-and-forget — errors are caught and logged but never thrown.
   */
  async log(action: string, opts: AuditOpts = {}): Promise<void> {
    const { userId = null, characterId = null, targetId = null, metadata = null, ip = null } = opts;
    const metaStr = metadata ? JSON.stringify(metadata) : null;
    prisma.auditLog
      .create({
        data: {
          action,
          userId,
          characterId,
          targetId,
          metadata: metaStr,
          ip,
        },
      })
      .catch((e: unknown) => {
        console.error("[audit] failed to write log:", e);
      });
  }
}

// Singleton instance for convenience
export const auditService = new AuditService();