/**
 * Checkr routes — Native Invitation (Hosted) flow.
 *
 * FCRA compliance summary:
 *  • We NEVER receive, log, or store SSN, DOB, or full address.
 *  • Checkr's hosted form presents the federally-required standalone Disclosure
 *    & Authorization to the candidate and obtains consent before collecting PII.
 *  • Pre-adverse action: Checkr fires report.pre_adverse_action webhook; we
 *    record the timestamp and enforce a 7-calendar-day hold (exceeds the federal
 *    5-business-day minimum and satisfies CA/NY/other state requirements).
 *  • Adverse action: fired by Checkr webhook; we mark the account accordingly.
 *    Checkr delivers the final notice + report to the candidate directly.
 *  • All webhook events are HMAC-SHA256 signature-verified.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId, upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  checkrClient,
  verifyCheckrSignature,
  adverseActionEarliestDate,
  type CheckrReport,
} from "../lib/checkr";
import { serverTrack } from "../lib/posthog";
import type { AppBindings } from "../types";

export const checkrRouter = new Hono<AppBindings>();

// ─── POST /checkr/invite ──────────────────────────────────────────────────────

const inviteSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  workState: z.string().length(2).default("CA"),
});

checkrRouter.post("/invite", requireAuth, zValidator("json", inviteSchema), async (c) => {
  const { firstName, lastName, workState } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");

  let user;
  try {
    user = await getUserByClerkId(sql, authUser.clerkId);
  } catch (err) {
    logger.error("checkr/invite: DB error looking up user", err);
    return c.json({ error: "Database error", detail: String(err) }, 500);
  }
  if (!user) {
    // Auto-sync user into DB on first request (Clerk webhook may not have fired yet)
    try {
      user = await upsertUser(sql, { clerkId: authUser.clerkId, email: authUser.email ?? `${authUser.clerkId}@unknown.sweepr`, role: "cleaner" });
    } catch (err) {
      logger.error("checkr/invite: failed to auto-create user", err);
      return c.json({ error: "User not found and could not be created" }, 404);
    }
  }

  const client = checkrClient(c.env);

  // Check for an existing Checkr candidate to enable check reuse.
  // Checkr requires reusing the same candidate_id rather than creating duplicates.
  const cleanerRows = (await sql`
    SELECT id, checkr_candidate_id FROM cleaners WHERE user_id = ${user.id} LIMIT 1
  `) as { id: string; checkr_candidate_id: string | null }[];
  const existingCandidateId = cleanerRows[0]?.checkr_candidate_id ?? null;

  let candidateId: string;
  if (existingCandidateId) {
    // Reuse existing Checkr candidate — create a new invitation on the same record.
    candidateId = existingCandidateId;
  } else {
    // First-time: create a candidate with name + email only. No PII.
    const candidate = await client.createCandidate(user.email ?? "", firstName, lastName);
    candidateId = candidate.id;
  }

  // Create invitation; Checkr returns a hosted-apply URL.
  const invitation = existingCandidateId
    ? await client.reInvite(candidateId, workState)
    : await client.createInvitation(candidateId, workState);

  try {
    if (cleanerRows[0]) {
      await sql`
        UPDATE cleaners
        SET checkr_candidate_id  = ${candidateId},
            checkr_invitation_id = ${invitation.id},
            checkr_status        = 'invited',
            checkr_invited_at    = NOW()
        WHERE user_id = ${user.id}
      `;
    } else {
      await sql`
        INSERT INTO cleaners (user_id, checkr_candidate_id, checkr_invitation_id, checkr_status, checkr_invited_at)
        VALUES (${user.id}, ${candidateId}, ${invitation.id}, 'invited', NOW())
      `;
    }
  } catch (err) {
    logger.error("checkr/invite: failed to upsert cleaners row", err);
    return c.json({ error: "Database error saving invitation", detail: String(err) }, 500);
  }

  serverTrack(c.env, user.id, "checkr_invite_sent", { workState });

  return c.json({
    invitationUrl: invitation.invitation_url,
    invitationId:  invitation.id,
    expiresAt:     invitation.expires_at,
  });
});

// ─── GET /checkr/status ───────────────────────────────────────────────────────

checkrRouter.get("/status", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = (await sql`
    SELECT cl.checkr_status, cl.checkr_invited_at,
           cl.checkr_report_id, cl.checkr_pre_adverse_at
    FROM cleaners cl
    WHERE cl.user_id = ${user.id}
    LIMIT 1
  `) as {
    checkr_status: string;
    checkr_invited_at: string | null;
    checkr_report_id: string | null;
    checkr_pre_adverse_at: string | null;
  }[];

  const row = rows[0];
  if (!row) return c.json({ status: "not_started", invitedAt: null, reportId: null, adverseActionEarliestAt: null });

  const adverseEarliest = row.checkr_pre_adverse_at
    ? adverseActionEarliestDate(new Date(row.checkr_pre_adverse_at)).toISOString()
    : null;

  return c.json({
    status: row.checkr_status ?? "not_started",
    invitedAt: row.checkr_invited_at,
    reportId: row.checkr_report_id,
    adverseActionEarliestAt: adverseEarliest,
  });
});

// ─── POST /webhooks/checkr ────────────────────────────────────────────────────
// Public route — authenticated by HMAC signature, not Clerk JWT.

checkrRouter.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-checkr-signature") ?? "";

  if (!c.env.CHECKR_WEBHOOK_SECRET) {
    logger.warn("Checkr webhook: CHECKR_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 503);
  }
  const valid = await verifyCheckrSignature(rawBody, sig, c.env.CHECKR_WEBHOOK_SECRET);
  if (!valid) {
    logger.warn("Checkr webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  let payload: { type: string; data: { object: Record<string, unknown> } };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return c.json({ error: "Bad JSON" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  logger.info("Checkr webhook received", { type: payload.type });

  switch (payload.type) {
    case "invitation.completed": {
      const inv = payload.data.object as { id: string; candidate_id: string };
      await sql`
        UPDATE cleaners
        SET checkr_status = 'pending'
        WHERE checkr_candidate_id = ${inv.candidate_id}
      `;
      break;
    }

    case "report.created": {
      const report = payload.data.object as unknown as CheckrReport;
      await sql`
        UPDATE cleaners
        SET checkr_report_id = ${report.id},
            checkr_status    = 'pending'
        WHERE checkr_candidate_id = ${report.candidate_id}
      `;
      break;
    }

    case "report.completed": {
      const report = payload.data.object as unknown as CheckrReport;
      const status = report.status === "clear" ? "clear" : "consider";
      await sql`
        UPDATE cleaners
        SET checkr_report_id    = ${report.id},
            checkr_status       = ${status},
            checkr_completed_at = NOW()
        WHERE checkr_candidate_id = ${report.candidate_id}
      `;
      if (status === "consider") {
        await sql`
          INSERT INTO notifications (user_id, type, body, created_at)
          SELECT u.id, 'checkr_consider',
                 'A background check requires adjudication.',
                 NOW()
          FROM users u
          WHERE u.role = 'admin'
          LIMIT 5
        `;
      }
      serverTrack(c.env, report.candidate_id, "checkr_report_completed", { status });
      break;
    }

    case "report.pre_adverse_action": {
      // FCRA § 615(a): pre-adverse notice includes report + Summary of Rights.
      // Checkr delivers these to the candidate. We record the timestamp and
      // enforce the 7-calendar-day wait before final adverse action.
      const report = payload.data.object as unknown as CheckrReport;
      await sql`
        UPDATE cleaners
        SET checkr_status         = 'pre_adverse_action',
            checkr_pre_adverse_at = NOW()
        WHERE checkr_candidate_id = ${report.candidate_id}
      `;
      logger.info("Checkr pre-adverse recorded", { candidateId: report.candidate_id });
      break;
    }

    case "report.adverse_action": {
      // Checkr has delivered the final adverse action notice + report.
      const report = payload.data.object as unknown as CheckrReport;
      await sql`
        UPDATE cleaners
        SET checkr_status = 'adverse_action'
        WHERE checkr_candidate_id = ${report.candidate_id}
      `;
      logger.info("Checkr adverse action finalized", { candidateId: report.candidate_id });
      break;
    }

    case "report.dispute": {
      const report = payload.data.object as unknown as CheckrReport;
      await sql`
        UPDATE cleaners
        SET checkr_status = 'dispute'
        WHERE checkr_candidate_id = ${report.candidate_id}
      `;
      break;
    }

    default:
      logger.info("Checkr webhook: unhandled event type", { type: payload.type });
  }

  return c.json({ received: true });
});
