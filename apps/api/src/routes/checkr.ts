import { Hono, type Context } from "hono";
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
import { adjudicateConsiderReport } from "../lib/adjudication";
import { serverTrack } from "../lib/posthog";
import type { AppBindings } from "../types";

export const checkrRouter = new Hono<AppBindings>();

checkrRouter.get("/config", requireAuth, async (c) => {
  const publishableKey = c.env.VITE_CHECKR_PUBLISHABLE_KEY ?? c.env.CHECKR_PUBLISHABLE_KEY ?? "";
  return c.json({ publishableKey, configured: Boolean(publishableKey) });
});

const inviteSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  workState: z.string().length(2).default("CA"),
  /**
   * Candidate ID created in the browser by Checkr.js using the publishable key.
   * This lets sensitive fields such as SSN/DOB/phone go directly to Checkr and
   * prevents Sweepr's Worker from calling POST /candidates or receiving PII.
   */
  candidateId: z.string().min(3).max(100).optional(),
});

checkrRouter.post("/invite", requireAuth, zValidator("json", inviteSchema), async (c) => {
  const { firstName, lastName, workState, candidateId: clientCandidateId } = c.req.valid("json");
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
    try {
      user = await upsertUser(sql, {
        clerkId: authUser.clerkId,
        email: authUser.email ?? `${authUser.clerkId}@unknown.sweepr`,
        role: "cleaner",
      });
    } catch (err) {
      logger.error("checkr/invite: failed to auto-create user", err);
      return c.json({ error: "User not found and could not be created" }, 404);
    }
  }

  const client = checkrClient(c.env);

  const cleanerRows = (await sql`
    SELECT id, checkr_candidate_id FROM cleaners WHERE user_id = ${user.id} LIMIT 1
  `) as { id: string; checkr_candidate_id: string | null }[];
  const existingCandidateId = cleanerRows[0]?.checkr_candidate_id ?? null;

  let candidateId: string;
  const candidateWasCreatedByCheckrJs = Boolean(clientCandidateId && !existingCandidateId);
  let invitation: Awaited<ReturnType<typeof client.createInvitation>>;
  try {
    if (existingCandidateId) {
      candidateId = existingCandidateId;
    } else if (clientCandidateId) {
      candidateId = clientCandidateId;
    } else {
      // Server-side candidate creation with name+email only (no SSN/DOB/phone —
      // the applicant enters those on Checkr's hosted invitation page).
      const candidate = await client.createCandidate(user.email ?? "", firstName, lastName);
      candidateId = candidate.id;
    }

    invitation = existingCandidateId
      ? await client.reInvite(candidateId, workState)
      : await client.createInvitation(candidateId, workState);
  } catch (err) {
    // Checkr API failures (e.g. 403 "Request blocked" when the account isn't
    // yet credentialed for production, 401 bad key, or network) must not surface
    // as an unhandled 500. Return a clean, retryable error the UI can display.
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("checkr/invite: Checkr API call failed", err, { userId: user.id });
    const blocked = /→\s*40[13]/.test(detail);
    return c.json(
      {
        error: "background_check_unavailable",
        message: blocked
          ? "Background checks are temporarily unavailable. Our team has been notified — please try again shortly."
          : "Could not start your background check. Please try again in a few minutes.",
      },
      502,
    );
  }

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

  serverTrack(c.env, user.id, "checkr_invite_sent", {
    workState,
    candidateSource: candidateWasCreatedByCheckrJs ? "checkr_js" : existingCandidateId ? "existing" : "server",
  });

  return c.json({
    invitationUrl: invitation.invitation_url,
    invitationId:  invitation.id,
    expiresAt:     invitation.expires_at,
  });
});

checkrRouter.get("/status", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  // Single JOIN instead of a user lookup followed by a dependent cleaner
  // lookup. With no cleaner row, fields come back NULL, which resolves to
  // the same "not_started"/null defaults as the previous two-query version.
  const rows = (await sql`
    SELECT users.id AS user_id, cleaners.checkr_status, cleaners.checkr_invited_at,
           cleaners.checkr_report_id, cleaners.checkr_pre_adverse_at
    FROM users
    LEFT JOIN cleaners ON cleaners.user_id = users.id
    WHERE users.clerk_id = ${authUser.clerkId}
    LIMIT 1
  `) as {
    user_id: string;
    checkr_status: string | null;
    checkr_invited_at: string | null;
    checkr_report_id: string | null;
    checkr_pre_adverse_at: string | null;
  }[];

  const userRow = rows[0];
  if (!userRow) return c.json({ error: "User not found" }, 404);
  const row = userRow;

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

// Registered at both "/" and "/webhook" so the canonical URL
// api.getsweepr.com/webhooks/checkr works (the router is mounted at
// /webhooks/checkr AND /checkr, so bare "/" must answer too).
const checkrWebhookHandler = async (c: Context<AppBindings>) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-checkr-signature") ?? "";

  const signingKey = c.env.CHECKR_CLIENT_SECRET ?? c.env.CHECKR_WEBHOOK_SECRET;
  if (!signingKey) {
    logger.warn("Checkr webhook: CHECKR_CLIENT_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 503);
  }
  const valid = await verifyCheckrSignature(rawBody, sig, signingKey);
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
      const rawStatus = report.status === "clear" ? "clear" : "consider";
      await sql`
        UPDATE cleaners
        SET checkr_report_id    = ${report.id},
            checkr_status       = ${rawStatus},
            checkr_completed_at = NOW()
        WHERE checkr_candidate_id = ${report.candidate_id}
      `;

      if (rawStatus === "consider") {
        const haiku = await adjudicateConsiderReport(report, c.env);

        let autoEngaged = false;
        if (haiku?.recommendation === "engage") {
          const client = checkrClient(c.env);
          try {
            await client.adjudicate(report.id, "engaged");
            await sql`
              UPDATE cleaners SET checkr_status = 'clear'
              WHERE checkr_candidate_id = ${report.candidate_id}
            `;
            logger.info("Haiku adjudicated: engage", { reportId: report.id, reasoning: haiku.reasoning });
            autoEngaged = true;
          } catch (err) {
            logger.error("Checkr adjudication API failed; falling back to admin review", { err: String(err) });
          }
        }

        if (!autoEngaged) {
          const reasoning = haiku?.reasoning ?? "No AI adjudication available — manual review required.";
          await sql`
            INSERT INTO notifications (user_id, type, body, created_at)
            SELECT u.id, 'checkr_consider',
                   ${"Background check requires adjudication. AI note: " + reasoning},
                   NOW()
            FROM users u
            WHERE u.role = 'admin'
            LIMIT 5
          `;
          logger.info("Haiku adjudicated: flag (or unavailable)", { reportId: report.id, reasoning });
        }
      }

      serverTrack(c.env, report.candidate_id, "checkr_report_completed", { status: rawStatus });
      break;
    }

    case "report.pre_adverse_action": {
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
};

checkrRouter.post("/", checkrWebhookHandler);
checkrRouter.post("/webhook", checkrWebhookHandler);
