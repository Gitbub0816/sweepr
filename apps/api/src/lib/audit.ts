/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

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
  | "payment.intent_created"
  | "booking.price_adjusted"
  | "booking.addons_added"
  | "tip.created"
  | "tip.paid_out"
  | "access_code.revealed"
  | "smart_entry.config_updated"
  | "smart_entry.access_revoked"
  | "cleaner.approved"
  | "cleaner.rejected"
  | "cleaner.suspended"
  | "cleaner.insurance_enrolled"
  | "dispute.opened"
  | "dispute.resolved"
  | "payout.released"
  | "payout.admin_released"
  | "payout.held"
  | "payout.fee_config_updated"
  | "payout.tier_updated"
  | "payout.dispute_released"
  | "payout.dispute_canceled"
  | "user.created"
  | "user.role_changed"
  | "admin.action"
  | "admin.invite_created"
  | "admin.invite_accepted"
  | "admin.permissions.updated"
  | "data.export_requested"
  | "data.deleted" // GDPR
  | "workspace.created"
  | "workspace.updated"
  | "workspace.member_added"
  | "workspace.member_role_changed"
  | "workspace.member_suspended"
  | "workspace.member_removed"
  | "workspace.invite_created"
  | "workspace.invite_revoked"
  | "workspace.invite_accepted"
  | "workspace.transition_created"
  | "workspace.transition_completed";

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
