/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId, upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  yardstikClient,
  verifyYardstikSignature,
  adverseActionEarliestDate,
  mapReportStatus,
  stripWrappingQuotes,
  type YardstikWebhookBody,
} from "../lib/yardstik";
import { adjudicateConsiderReport } from "../lib/adjudication";
import { enrollSorMonitoringIfApproved } from "../lib/sorMonitoring";
import { hasAcknowledgedAdjudicationPolicy } from "./adjudication";
import { serverTrack } from "../lib/posthog";
import type { AppBindings } from "../types";

export const yardstikRouter = new Hono<AppBindings>();

/** SHA-256 hex digest — used as a fallback dedup key when a webhook carries no id. */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

yardstikRouter.get("/config", requireAuth, async (c) => {
  return c.json({ configured: Boolean(c.env.YARDSTIK_API_KEY) });
});

const inviteSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

yardstikRouter.post("/invite", requireAuth, zValidator("json", inviteSchema), async (c) => {
  const { firstName, lastName } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");

  // The Background Check Adjudication Policy must be reviewed and acknowledged
  // immediately before any background check starts — the client shows the
  // acknowledgment modal when it sees this error code.
  if (!(await hasAcknowledgedAdjudicationPolicy(sql, authUser.clerkId))) {
    return c.json(
      { error: "policy_ack_required", message: "Please review and acknowledge the Background Check Adjudication Policy first." },
      403,
    );
  }

  let user;
  try {
    user = await getUserByClerkId(sql, authUser.clerkId);
  } catch (err) {
    logger.error("yardstik/invite: DB error looking up user", err);
    return c.json({ error: "Database error" }, 500);
  }
  if (!user) {
    try {
      user = await upsertUser(sql, {
        clerkId: authUser.clerkId,
        email: authUser.email ?? `${authUser.clerkId}@unknown.sweepr`,
        role: "cleaner",
      });
    } catch (err) {
      logger.error("yardstik/invite: failed to auto-create user", err);
      return c.json({ error: "User not found and could not be created" }, 404);
    }
  }

  const cleanerRows = (await sql`
    SELECT id, yardstik_candidate_id, yardstik_report_id
    FROM cleaners WHERE user_id = ${user.id} LIMIT 1
  `) as { id: string; yardstik_candidate_id: string | null; yardstik_report_id: string | null }[];
  let cleanerId = cleanerRows[0]?.id ?? null;
  const existingCandidateId = cleanerRows[0]?.yardstik_candidate_id ?? null;
  const existingReportId = cleanerRows[0]?.yardstik_report_id ?? null;

  if (!cleanerId) {
    const inserted = (await sql`
      INSERT INTO cleaners (user_id, first_name, last_name, status)
      VALUES (${user.id}, ${firstName}, ${lastName}, 'pending')
      RETURNING id
    `) as { id: string }[];
    cleanerId = inserted[0].id;
  }

  const client = yardstikClient(c.env);

  // If this cleaner already has a report, don't order a second one — Yardstik
  // rejects a duplicate for the same candidate within 30 days. Instead, fetch
  // the existing report's current status, reconcile our (possibly stale) DB
  // copy, and either resume the hosted apply page or report the live status.
  if (existingReportId) {
    try {
      const existing = await client.getReport(existingReportId);
      const normalized = mapReportStatus(existing.status);
      await sql`UPDATE cleaners SET yardstik_status = ${normalized} WHERE id = ${cleanerId}`;
      const applyUrl = existing.meta?.apply ?? null;
      // Only re-offer the apply page when the candidate hasn't submitted yet.
      if (applyUrl && (existing.status === "created" || existing.status === "expired")) {
        return c.json({
          invitationUrl: applyUrl,
          invitationId: existing.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
      return c.json({ alreadyStarted: true, status: normalized, reportId: existing.id });
    } catch (err) {
      // If the lookup fails, fall through to the normal create path below.
      logger.warn("yardstik/invite: existing-report lookup failed; ordering fresh", { err: String(err) });
    }
  }

  let candidateId: string;
  let report: Awaited<ReturnType<typeof client.createReport>>;
  try {
    candidateId = existingCandidateId
      ?? (await client.createCandidate(user.email ?? "", firstName, lastName, cleanerId)).id;
    report = await client.createReport(candidateId, cleanerId);
  } catch (err) {
    // Yardstik API failures (bad key, network, account not credentialed) must
    // not surface as an unhandled 500. Return a clean, retryable error.
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("yardstik/invite: Yardstik API call failed", err, { userId: user.id });
    const { recordError } = await import("../lib/errorLog");
    await recordError(sql, {
      source: "server",
      app: "api",
      message: `yardstik/invite failed: ${detail}`,
      path: "/yardstik/invite",
      method: "POST",
      statusCode: 502,
      clerkId: authUser.clerkId,
    });
    // Surface the underlying Yardstik error to owner accounts only, so the
    // integration can be debugged from the browser console without exposing
    // internal API messages to ordinary cleaners.
    const { isOwnerClerkId } = await import("../lib/owner");
    const ownerDetail = isOwnerClerkId(authUser.clerkId, c.env) ? { detail } : {};
    return c.json(
      {
        error: "background_check_unavailable",
        message: "Could not start your background check. Please try again in a few minutes.",
        ...ownerDetail,
      },
      502,
    );
  }

  try {
    await sql`
      UPDATE cleaners
      SET yardstik_candidate_id = ${candidateId},
          yardstik_report_id    = ${report.id},
          yardstik_status       = 'invited',
          yardstik_invited_at   = NOW()
      WHERE id = ${cleanerId}
    `;
  } catch (err) {
    logger.error("yardstik/invite: failed to update cleaners row", err);
    return c.json({ error: "Database error saving invitation" }, 500);
  }

  serverTrack(c.env, user.id, "yardstik_report_ordered", {
    candidateSource: existingCandidateId ? "existing" : "server",
  });

  return c.json({
    invitationUrl: report.applyUrl,
    invitationId: report.id,
    expiresAt: report.expiresAt,
  });
});

yardstikRouter.get("/status", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const rows = (await sql`
    SELECT users.id AS user_id, cleaners.yardstik_status, cleaners.yardstik_invited_at,
           cleaners.yardstik_report_id, cleaners.yardstik_pre_adverse_at
    FROM users
    LEFT JOIN cleaners ON cleaners.user_id = users.id
    WHERE users.clerk_id = ${authUser.clerkId}
    LIMIT 1
  `) as {
    user_id: string;
    yardstik_status: string | null;
    yardstik_invited_at: string | null;
    yardstik_report_id: string | null;
    yardstik_pre_adverse_at: string | null;
  }[];

  const row = rows[0];
  if (!row) return c.json({ error: "User not found" }, 404);

  const adverseEarliest = row.yardstik_pre_adverse_at
    ? adverseActionEarliestDate(new Date(row.yardstik_pre_adverse_at)).toISOString()
    : null;

  return c.json({
    status: row.yardstik_status ?? "not_started",
    invitedAt: row.yardstik_invited_at,
    reportId: row.yardstik_report_id,
    adverseActionEarliestAt: adverseEarliest,
  });
});

// Registered at both "/" and "/webhook" so the canonical URL
// api.getsweepr.com/webhooks/yardstik works (the router is mounted at
// /webhooks/yardstik AND /yardstik, so bare "/" must answer too).
//
// Yardstik has no multi-event subscription: each webhook_type is registered
// with its own URL in the Yardstik dashboard/API (POST /webhooks). Register
// EVERY event type (candidate.created, report.created, report.updated,
// report.completed, report.submitted, ...) against this same URL — the
// handler dispatches on the `resource_type` + `event` fields in the body, so
// one endpoint covers every subscription without needing separate routes.
const yardstikWebhookHandler = async (c: Context<AppBindings>) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-yardstik-webhook-signature") ?? "";

  // The signing secret is a Yardstik API key literally named WEBHOOK_SIGNATURE
  // (separate from the main API key). Trim wrapping quotes / whitespace a
  // dashboard or wrangler paste can leave on it, or the HMAC never matches.
  const signingKey = stripWrappingQuotes(c.env.YARDSTIK_WEBHOOK_SIGNATURE ?? "").trim();
  if (!signingKey) {
    logger.warn("Yardstik webhook: YARDSTIK_WEBHOOK_SIGNATURE not configured");
    return c.json({ error: "Webhook not configured" }, 503);
  }

  let payload: YardstikWebhookBody;
  try {
    payload = JSON.parse(rawBody) as YardstikWebhookBody;
  } catch {
    return c.json({ error: "Bad JSON" }, 400);
  }

  // Yardstik signs an SHA-256 HMAC hex digest of the body. Their own docs
  // compute it over JSON.stringify(parsedBody); the raw wire bytes normally
  // match that exactly, but fall back to the re-serialized form so a
  // whitespace/formatting difference can't cause a false rejection.
  let valid = await verifyYardstikSignature(rawBody, sig, signingKey);
  if (!valid) valid = await verifyYardstikSignature(JSON.stringify(payload), sig, signingKey);
  if (!valid) {
    logger.warn("Yardstik webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const sql = getDb(c.env.DATABASE_URL);

  // Replay / dedup guard. Yardstik carries no timestamp we can use for a
  // freshness window, so a captured (still-validly-signed) delivery could be
  // replayed to re-drive a status transition. Claim a dedup row keyed on the
  // webhook body's `id` (or a hash of body+signature when absent) BEFORE doing
  // any work — a delivery that can't claim the row is a duplicate we skip.
  // Mirrors the stripe_events INSERT … ON CONFLICT DO NOTHING RETURNING pattern.
  const eventKey =
    (payload.id && String(payload.id)) || (await sha256Hex(`${rawBody}\n${sig}`));
  try {
    const claimed = (await sql`
      INSERT INTO yardstik_webhook_events (event_key, event, resource_id)
      VALUES (${eventKey}, ${payload.event ?? null}, ${payload.resource_id ?? null})
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    `) as { id: string }[];
    if (!claimed[0]) {
      logger.info("Yardstik webhook: duplicate delivery ignored", { eventKey });
      return c.json({ received: true, duplicate: true });
    }
  } catch (err) {
    // If the dedup store is unavailable, fail closed on replay protection but do
    // not silently drop a real event — log and continue processing (the handler
    // writes are themselves idempotent status updates).
    logger.warn("Yardstik webhook: dedup check failed; processing anyway", { err: String(err) });
  }

  logger.info("Yardstik webhook received", { resourceType: payload.resource_type, event: payload.event });

  // external_id was set to cleaners.id at candidate/report creation time —
  // prefer it (no lookup needed); fall back to matching by the Yardstik
  // resource ID for events where external_id wasn't echoed back.
  const cleanerId = payload.external_id ?? null;
  async function findCleanerId(): Promise<string | null> {
    if (cleanerId) return cleanerId;
    const rows = (await sql`
      SELECT id FROM cleaners
      WHERE yardstik_candidate_id = ${payload.resource_id} OR yardstik_report_id = ${payload.resource_id}
      LIMIT 1
    `) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  if (payload.resource_type === "report") {
    const targetId = await findCleanerId();
    if (!targetId) {
      logger.info("Yardstik webhook: no matching cleaner for report", { resourceId: payload.resource_id });
      return c.json({ received: true });
    }

    // A cleaner has TWO reports against the same candidate: the initial
    // screening report and the ongoing SOR monitoring report. Events for the
    // monitoring report must NOT drive yardstik_status (which tracks the
    // screening decision) — otherwise a monitor update would clobber an
    // approved cleaner's 'clear' status. Skip status mutation for those.
    const reportRows = (await sql`
      SELECT yardstik_report_id, yardstik_sor_monitor_report_id
      FROM cleaners WHERE id = ${targetId} LIMIT 1
    `) as { yardstik_report_id: string | null; yardstik_sor_monitor_report_id: string | null }[];
    const monitorReportId = reportRows[0]?.yardstik_sor_monitor_report_id ?? null;
    const screeningReportId = reportRows[0]?.yardstik_report_id ?? null;
    if (
      monitorReportId &&
      payload.resource_id === monitorReportId &&
      payload.resource_id !== screeningReportId
    ) {
      logger.info("Yardstik webhook: SOR monitor report event (status untouched)", {
        cleanerId: targetId,
        status: payload.status,
      });
      return c.json({ received: true });
    }

    const normalized = mapReportStatus(payload.status);

    if (payload.event === "created") {
      await sql`
        UPDATE cleaners SET yardstik_report_id = ${payload.resource_id}, yardstik_status = 'invited'
        WHERE id = ${targetId}
      `;
    } else if (payload.event === "updated" || payload.event === "deleted") {
      const completedAt = ["clear", "consider", "dispute", "pre_adverse_action", "adverse_action", "suspended"].includes(normalized)
        ? "NOW()"
        : null;
      if (completedAt) {
        await sql`
          UPDATE cleaners SET yardstik_status = ${normalized}, yardstik_completed_at = NOW()
          WHERE id = ${targetId}
        `;
      } else {
        await sql`
          UPDATE cleaners SET yardstik_status = ${normalized}
          WHERE id = ${targetId}
        `;
      }

      if (normalized === "pre_adverse_action") {
        await sql`
          UPDATE cleaners SET yardstik_pre_adverse_at = NOW() WHERE id = ${targetId}
        `;
        logger.info("Yardstik pre-adverse recorded", { cleanerId: targetId });
      }

      if (normalized === "consider") {
        const haiku = await adjudicateConsiderReport(
          { id: payload.resource_id, status: payload.status },
          c.env,
        );

        let autoEngaged = false;
        if (haiku?.recommendation === "engage") {
          const client = yardstikClient(c.env);
          try {
            const candRows = (await sql`
              SELECT yardstik_candidate_id FROM cleaners WHERE id = ${targetId} LIMIT 1
            `) as { yardstik_candidate_id: string | null }[];
            const candidateId = candRows[0]?.yardstik_candidate_id;
            if (candidateId) {
              await client.proceedReport(candidateId, payload.resource_id);
              await sql`UPDATE cleaners SET yardstik_status = 'clear' WHERE id = ${targetId}`;
              logger.info("Haiku adjudicated: engage", { reportId: payload.resource_id, reasoning: haiku.reasoning });
              await enrollSorMonitoringIfApproved(sql, c.env, targetId);
              autoEngaged = true;
            }
          } catch (err) {
            logger.error("Yardstik proceed-report call failed; falling back to admin review", { err: String(err) });
          }
        }

        if (!autoEngaged) {
          const reasoning = haiku?.reasoning ?? "No AI adjudication available, manual review required.";
          await sql`
            INSERT INTO notifications (user_id, type, body, created_at)
            SELECT u.id, 'yardstik_consider',
                   ${"Background check requires adjudication. AI note: " + reasoning},
                   NOW()
            FROM users u
            WHERE u.role = 'admin'
            LIMIT 5
          `;
          logger.info("Haiku adjudicated: flag (or unavailable)", { reportId: payload.resource_id, reasoning });
        }

        serverTrack(c.env, targetId, "yardstik_report_consider", {});
      }

      if (normalized === "clear") {
        // Approved → auto-enroll in continuous SOR monitoring (idempotent
        // no-op when unconfigured or already enrolled).
        await enrollSorMonitoringIfApproved(sql, c.env, targetId);
        serverTrack(c.env, targetId, "yardstik_report_completed", { status: normalized });
      }
    }
  } else {
    logger.info("Yardstik webhook: unhandled resource type", { resourceType: payload.resource_type });
  }

  return c.json({ received: true });
};

yardstikRouter.post("/", yardstikWebhookHandler);
yardstikRouter.post("/webhook", yardstikWebhookHandler);
