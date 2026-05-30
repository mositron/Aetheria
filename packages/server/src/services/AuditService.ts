import fs from "fs";
import path from "path";
import { prisma } from "../db.js";

export type AuditOpts = {
  userId?: string | null;
  characterId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
};

// Fallback log path — written to when the DB write fails so security-relevant
// events are NEVER lost silently. Operators should ship this alongside the DB
// in their monitoring.
const FALLBACK_LOG = process.env.AUDIT_FALLBACK_LOG ?? path.resolve(process.cwd(), "audit-fallback.log");

function writeFallback(action: string, opts: AuditOpts, err: unknown) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      action,
      ...opts,
      dbErr: err instanceof Error ? err.message : String(err),
    }) + "\n";
    fs.appendFileSync(FALLBACK_LOG, line);
  } catch (fileErr) {
    // Last-resort: at least emit to stderr so the line is recoverable from
    // container logs.
    console.error("[audit.fallback.fileFailed]", fileErr, "originalAction=", action);
  }
}

export class AuditService {
  /**
   * Write an audit log entry. Returns a promise that resolves whether the DB
   * write succeeded or fell back to the local file — callers may safely
   * not-await for non-critical events.
   *
   * On DB failure the entry is appended to AUDIT_FALLBACK_LOG so security
   * events are not lost during database outages.
   */
  async log(action: string, opts: AuditOpts = {}): Promise<void> {
    const { userId = null, characterId = null, targetId = null, metadata = null, ip = null } = opts;
    const metaStr = metadata ? JSON.stringify(metadata) : null;
    try {
      await prisma.auditLog.create({
        data: { action, userId, characterId, targetId, metadata: metaStr, ip },
      });
    } catch (e) {
      console.error("[audit] db write failed, falling back to file:", e);
      writeFallback(action, opts, e);
    }
  }
}

// Singleton instance for convenience
export const auditService = new AuditService();
