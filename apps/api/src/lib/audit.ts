import type { Sql } from "./db";
import { logger } from "./logger";

export type AuditAction =
  | "booking.created"
  | "booking.status_changed"
  | "booking.cancelled"
  | "booking.start_route"
  | "booking.start_clean"
  | "booking.completed"
  | "payment.captured"
  | "payment.refunded"
  | "cleaner.approved"
  | "cleaner.rejected"
  | "cleaner.suspended"
  | "dispute.opened"
  | "dispute.resolved"
  | "payout.released"
  | "user.created"
  | "user.role_changed"
  | "admin.action"
  | "admin.invite_created"
  | "admin.invite_accepted"
  | "data.export_requested"
  | "data.deleted"; // GDPR

export interface AuditEntry {
  action: AuditAction;
  actorClerkId: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * Write an immutable audit record. Never throws — audit failures must not
 * block the main operation, but are logged server-side for monitoring.
 */
export async function audit(db: Sql, entry: AuditEntry): Promise<void> {
  try {
    await db`
      INSERT INTO admin_audit_log (
        action, actor_clerk_id, target_type, target_id,
        metadata, ip_address, user_agent, created_at
      ) VALUES (
        ${entry.action}, ${entry.actorClerkId}, ${entry.targetType},
        ${entry.targetId}, ${JSON.stringify(entry.metadata)},
        ${entry.ipAddress ?? null}, ${entry.userAgent ?? null}, ${entry.timestamp}
      )
    `;
  } catch (err) {
    logger.error("Audit write failed", err, { action: entry.action });
  }
}
