/**
 * Contextual enrichment for IT / Security tickets — the "why did this happen"
 * panel. Given the reporter/sender email, surface the matching Sweepr user,
 * admin invites for that email (who invited them), related admin-audit entries,
 * a related error log, and other tickets from the same person.
 */
import type { Sql } from "./db";

export interface TicketContext {
  user: Record<string, unknown> | null;
  invites: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  relatedTickets: Array<Record<string, unknown>>;
  error: Record<string, unknown> | null;
}

export async function getTicketContext(
  sql: Sql,
  email: string | null,
  opts: { kind: "it" | "security"; ticketDbId?: string; errorId?: string | null },
): Promise<TicketContext> {
  const e = (email ?? "").toLowerCase();

  const user = e
    ? ((await sql`
        SELECT id, clerk_id, email, role, admin_role, created_at
        FROM users WHERE LOWER(email) = ${e} LIMIT 1
      `) as Array<Record<string, unknown>>)[0] ?? null
    : null;

  // Admin invites for this email → who requested them (created_by clerk → email).
  const invites = e
    ? ((await sql`
        SELECT i.email, i.created_by, i.created_at, i.used_at, i.expires_at,
               u.email AS inviter_email
        FROM admin_invites i
        LEFT JOIN users u ON u.clerk_id = i.created_by
        WHERE LOWER(i.email) = ${e}
        ORDER BY i.created_at DESC LIMIT 10
      `) as Array<Record<string, unknown>>)
    : [];

  // Related audit log entries: anything referencing this email, or actions by
  // this user (resolved via clerk id), most recent first.
  const clerkId = (user?.clerk_id as string) ?? "";
  const audit = e
    ? ((await sql`
        SELECT a.action, a.actor_clerk_id, a.target_type, a.target_id, a.metadata, a.created_at,
               u.email AS actor_email
        FROM admin_audit_log a
        LEFT JOIN users u ON u.clerk_id = a.actor_clerk_id
        WHERE (a.metadata->>'email') = ${e}
           OR LOWER(a.target_id) = ${e}
           OR (${clerkId} <> '' AND (a.actor_clerk_id = ${clerkId} OR a.target_id = ${clerkId}))
        ORDER BY a.created_at DESC LIMIT 25
      `) as Array<Record<string, unknown>>)
    : [];

  // Related error log (for IT tickets created from an error).
  const error = opts.errorId
    ? ((await sql`
        SELECT id, occurred_at, app, level, message, path, method, status_code, clerk_id, request_id
        FROM error_logs WHERE id = ${opts.errorId} LIMIT 1
      `) as Array<Record<string, unknown>>)[0] ?? null
    : null;

  // Other tickets from the same person.
  let relatedTickets: Array<Record<string, unknown>> = [];
  if (e) {
    if (opts.kind === "security") {
      relatedTickets = (await sql`
        SELECT id, case_code, subject, classification, status, received_at
        FROM security_tickets
        WHERE LOWER(sender_email) = ${e} AND id <> ${opts.ticketDbId ?? ""}
        ORDER BY received_at DESC LIMIT 10
      `) as Array<Record<string, unknown>>;
    } else {
      relatedTickets = (await sql`
        SELECT id, case_code, title, category, status, created_at
        FROM it_tickets
        WHERE LOWER(reporter_email) = ${e} AND id <> ${opts.ticketDbId ?? ""}
        ORDER BY created_at DESC LIMIT 10
      `) as Array<Record<string, unknown>>;
    }
  }

  return { user, invites, audit, relatedTickets, error };
}
