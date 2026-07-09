/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Background Check Adjudication — API.
 *
 * Cleaner-facing (mounted at /adjudication):
 *   GET  /acknowledgment   has the signed-in applicant acknowledged the policy?
 *   POST /acknowledge      record acknowledgment (legal_acceptances, slug
 *                          background-check-adjudication) — required before the
 *                          background check can start (yardstik/invite enforces).
 *
 * Admin-facing (mounted at /admin/adjudication, Trust & Safety → Adjudication):
 *   GET  /cases?status=    list cases
 *   POST /cases            open a case for a cleaner (status needs_input)
 *   PUT  /cases/:id/record enter convictions/pending charges → engine runs and
 *                          stores the deterministic decision
 *   POST /cases/:id/decide resolve an executive_review / hold case (approved |
 *                          denied + note)
 *
 * FCRA: an auto_deny or manual denied outcome starts the adverse-action
 * process (pre-adverse notice, waiting period, final notice) — this API records
 * the decision and notifies Trust & Safety; it never silently terminates the
 * applicant.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { logger } from "../lib/logger";
import { audit } from "../lib/audit";
import {
  adjudicate,
  OFFENSE_CATEGORIES,
  type ConvictionInput,
  type PendingChargeInput,
} from "../lib/adjudicationPolicy";
import { yardstikClient, adverseActionEarliestDate } from "../lib/yardstik";
import type { AppBindings } from "../types";

export const ADJUDICATION_DOC_SLUG = "background-check-adjudication";
export const ADJUDICATION_DOC_VERSION = "1.0.0";

// ── Cleaner-facing ─────────────────────────────────────────────────────────────

export const adjudicationRouter = new Hono<AppBindings>();

adjudicationRouter.get("/acknowledgment", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT la.id FROM legal_acceptances la
    JOIN users u ON u.id = la.user_id
    WHERE u.clerk_id = ${c.get("user").clerkId}
      AND la.document_slug = ${ADJUDICATION_DOC_SLUG}
    LIMIT 1
  `) as Array<{ id: string }>;
  return c.json({ acknowledged: rows.length > 0, version: ADJUDICATION_DOC_VERSION });
});

adjudicationRouter.post("/acknowledge", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const users = (await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string }>;
  if (!users[0]) return c.json({ error: "User not found" }, 404);

  const ip = c.req.header("cf-connecting-ip") ?? null;
  const ua = c.req.header("user-agent")?.slice(0, 500) ?? null;
  await sql`
    INSERT INTO legal_acceptances (user_id, document_slug, document_version, ip_address, user_agent, flow_context, checkbox_label_snapshot)
    VALUES (${users[0].id}, ${ADJUDICATION_DOC_SLUG}, ${ADJUDICATION_DOC_VERSION}, ${ip}, ${ua}, 'cleaner_onboarding_background_check',
            'I have read and acknowledge the Sweepr Background Check Adjudication Policy.')
  `;
  return c.json({ ok: true });
});

/**
 * True when the user has acknowledged the adjudication policy. Used by
 * yardstik/invite (and any future provider) to hard-gate the background check.
 */
export async function hasAcknowledgedAdjudicationPolicy(
  sql: ReturnType<typeof getDb>,
  clerkId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT la.id FROM legal_acceptances la
    JOIN users u ON u.id = la.user_id
    WHERE u.clerk_id = ${clerkId} AND la.document_slug = ${ADJUDICATION_DOC_SLUG}
    LIMIT 1
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

/**
 * Issue the FCRA pre-adverse notice for a denied adjudication case. Where the
 * cleaner has a Yardstik report on file, call the CRA so it notifies the
 * candidate and runs its own waiting-period timer; mirror the pre-adverse
 * timestamp onto the cleaner row. Best-effort: never let a notice-delivery
 * failure abort the state transition (the case already records pre_adverse_at,
 * and the waiting period is enforced from the case row).
 */
async function triggerPreAdverseNotice(
  c: { env: AppBindings["Bindings"] },
  sql: ReturnType<typeof getDb>,
  caseRow: Record<string, unknown>,
  reasons: string[],
): Promise<void> {
  const cleanerId = caseRow.cleaner_id as string | null;
  if (!cleanerId) return;
  try {
    const rows = (await sql`
      SELECT yardstik_report_id, yardstik_candidate_id, yardstik_pre_adverse_at
      FROM cleaners WHERE id = ${cleanerId} LIMIT 1
    `) as {
      yardstik_report_id: string | null;
      yardstik_candidate_id: string | null;
      yardstik_pre_adverse_at: string | null;
    }[];
    const cleaner = rows[0];
    if (cleaner?.yardstik_report_id) {
      const client = yardstikClient(c.env);
      await client.createAdverseAction(
        cleaner.yardstik_report_id,
        reasons[0]?.slice(0, 1000) ?? "Background check record requires adverse action review.",
      );
    }
    if (cleaner && !cleaner.yardstik_pre_adverse_at) {
      await sql`
        UPDATE cleaners
        SET yardstik_status = 'pre_adverse_action', yardstik_pre_adverse_at = NOW(), updated_at = NOW()
        WHERE id = ${cleanerId}
      `;
    }
  } catch (err) {
    logger.error("adjudication pre-adverse notice failed", err);
  }
}

/** Audit an adjudication decision/state transition (best-effort). */
async function auditDecision(
  actorClerkId: string,
  sql: ReturnType<typeof getDb>,
  targetId: string,
  event: string,
  meta: { outcome: string; note: string },
): Promise<void> {
  try {
    await audit(sql, {
      action: "admin.action",
      actorClerkId,
      targetType: "adjudication_case",
      targetId,
      metadata: { event, outcome: meta.outcome, note: meta.note.slice(0, 500) },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("adjudication audit failed", err);
  }
}

// ── Admin (Trust & Safety → Adjudication) ─────────────────────────────────────

export const adminAdjudicationRouter = new Hono<AppBindings>();
const gate = [requireAuth, requireAdminRole("super_admin", "admin", "ops", "security")] as const;

adminAdjudicationRouter.get("/cases", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const rows = status
    ? await sql`
        SELECT ac.*, cl.first_name, cl.last_name, u.email
        FROM adjudication_cases ac
        LEFT JOIN cleaners cl ON cl.id = ac.cleaner_id
        LEFT JOIN users u ON u.id = ac.user_id
        WHERE ac.status = ${status}
        ORDER BY ac.created_at DESC LIMIT 200`
    : await sql`
        SELECT ac.*, cl.first_name, cl.last_name, u.email
        FROM adjudication_cases ac
        LEFT JOIN cleaners cl ON cl.id = ac.cleaner_id
        LEFT JOIN users u ON u.id = ac.user_id
        ORDER BY ac.created_at DESC LIMIT 200`;
  return c.json({ cases: rows, categories: OFFENSE_CATEGORIES });
});

const createSchema = z.object({ cleanerId: z.string().uuid() });

adminAdjudicationRouter.post("/cases", ...gate, zValidator("json", createSchema), async (c) => {
  const { cleanerId } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const cleaners = (await sql`
    SELECT id, user_id FROM cleaners WHERE id = ${cleanerId} LIMIT 1
  `) as Array<{ id: string; user_id: string }>;
  if (!cleaners[0]) return c.json({ error: "Cleaner not found" }, 404);

  const rows = (await sql`
    INSERT INTO adjudication_cases (cleaner_id, user_id, status, created_by)
    VALUES (${cleanerId}, ${cleaners[0].user_id}, 'needs_input', ${c.get("user").clerkId})
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return c.json({ case: rows[0] }, 201);
});

const convictionSchema = z.object({
  category: z.enum(OFFENSE_CATEGORIES),
  offense: z.string().min(1).max(200),
  convictionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isConviction: z.literal(true),
});
const pendingSchema = z.object({
  category: z.enum(OFFENSE_CATEGORIES),
  offense: z.string().min(1).max(200),
});
const recordSchema = z.object({
  convictions: z.array(convictionSchema).max(50),
  pendingCharges: z.array(pendingSchema).max(50),
});

adminAdjudicationRouter.put("/cases/:id/record", ...gate, zValidator("json", recordSchema), async (c) => {
  const id = c.req.param("id");
  const { convictions, pendingCharges } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  const result = adjudicate(convictions as ConvictionInput[], pendingCharges as PendingChargeInput[]);

  // FCRA: a clean auto_approve is terminal, but auto_deny must NOT finalize a
  // denial. It enters the pre-adverse-action state — the applicant is sent the
  // pre-adverse notice and the statutory waiting period must elapse before a
  // final 'denied' outcome is allowed (see /cases/:id/decide). executive_review
  // and hold continue to wait for a human.
  const nowISO = new Date().toISOString();
  const isAutoApprove = result.decision === "auto_approve";
  const isAutoDeny = result.decision === "auto_deny";
  const status = isAutoApprove
    ? "auto_decided"
    : isAutoDeny
      ? "pre_adverse_action"
      : result.decision; // executive_review | hold
  const finalOutcome = isAutoApprove ? "approved" : null;

  const rows = (await sql`
    UPDATE adjudication_cases SET
      convictions = ${JSON.stringify(convictions)}::jsonb,
      pending_charges = ${JSON.stringify(pendingCharges)}::jsonb,
      decision = ${result.decision},
      reasons = ${JSON.stringify(result.reasons)}::jsonb,
      rules = ${JSON.stringify(result.rules)}::jsonb,
      status = ${status},
      final_outcome = ${finalOutcome},
      decided_by = ${finalOutcome ? "engine" : null},
      decided_at = ${finalOutcome ? nowISO : null},
      pre_adverse_at = ${isAutoDeny ? nowISO : null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Case not found" }, 404);

  // Trigger the CRA (Yardstik) pre-adverse notice where a report is on file so
  // Yardstik runs its own waiting-period timer and notifies the candidate.
  if (isAutoDeny) {
    await triggerPreAdverseNotice(c, sql, rows[0], result.reasons);
  }

  try {
    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "adjudication_case",
      targetId: id,
      metadata: {
        event: isAutoDeny ? "adjudication.pre_adverse_action" : "adjudication.evaluated",
        decision: result.decision,
        rules: result.rules,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("adjudication audit failed", err);
  }
  return c.json({ case: rows[0], result });
});

const decideSchema = z.object({
  outcome: z.enum(["approved", "denied"]),
  note: z.string().min(3).max(2000),
});

adminAdjudicationRouter.post("/cases/:id/decide", ...gate, zValidator("json", decideSchema), async (c) => {
  const id = c.req.param("id");
  const { outcome, note } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  const existing = (await sql`
    SELECT * FROM adjudication_cases WHERE id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  const current = existing[0];
  if (!current) return c.json({ error: "Case not found" }, 404);

  // An approval finalizes immediately from any open (undecided) state.
  if (outcome === "approved") {
    const rows = (await sql`
      UPDATE adjudication_cases SET
        final_outcome = 'approved',
        final_note = ${note},
        decided_by = ${c.get("user").clerkId},
        decided_at = NOW(),
        status = 'decided',
        updated_at = NOW()
      WHERE id = ${id} AND final_outcome IS NULL
      RETURNING *
    `) as Array<Record<string, unknown>>;
    if (!rows[0]) return c.json({ error: "Case not found or already decided" }, 404);
    await auditDecision(c.get("user").clerkId, sql, id, "adjudication.decided", { outcome, note });
    return c.json({ case: rows[0] });
  }

  // FCRA: a denial may NOT be finalized directly. First it must enter the
  // pre-adverse-action state (issue the pre-adverse notice, start the waiting
  // period); only after that period elapses can a final 'denied' be recorded.
  if (current.status !== "pre_adverse_action") {
    if (current.final_outcome) return c.json({ error: "Case already decided" }, 404);
    const nowISO = new Date().toISOString();
    const rows = (await sql`
      UPDATE adjudication_cases SET
        final_note = ${note},
        status = 'pre_adverse_action',
        pre_adverse_at = COALESCE(pre_adverse_at, ${nowISO}),
        updated_at = NOW()
      WHERE id = ${id} AND final_outcome IS NULL
      RETURNING *
    `) as Array<Record<string, unknown>>;
    if (!rows[0]) return c.json({ error: "Case not found or already decided" }, 404);
    await triggerPreAdverseNotice(c, sql, rows[0], [note]);
    await auditDecision(c.get("user").clerkId, sql, id, "adjudication.pre_adverse_action", { outcome, note });
    const earliest = adverseActionEarliestDate(new Date(rows[0].pre_adverse_at as string));
    return c.json({
      case: rows[0],
      status: "pre_adverse_action",
      finalDenialAllowedAt: earliest.toISOString(),
    });
  }

  // Already in pre-adverse — enforce the waiting period before finalizing.
  const preAdverseAt = current.pre_adverse_at as string | null;
  if (!preAdverseAt) return c.json({ error: "Pre-adverse timestamp missing" }, 409);
  const earliest = adverseActionEarliestDate(new Date(preAdverseAt));
  if (Date.now() < earliest.getTime()) {
    return c.json(
      {
        error: "Adverse-action waiting period has not elapsed.",
        earliestAllowedAt: earliest.toISOString(),
      },
      409,
    );
  }

  const rows = (await sql`
    UPDATE adjudication_cases SET
      final_outcome = 'denied',
      final_note = ${note},
      decided_by = ${c.get("user").clerkId},
      decided_at = NOW(),
      status = 'decided',
      updated_at = NOW()
    WHERE id = ${id} AND status = 'pre_adverse_action' AND final_outcome IS NULL
    RETURNING *
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Case not found or already decided" }, 404);
  await auditDecision(c.get("user").clerkId, sql, id, "adjudication.decided", { outcome, note });
  return c.json({ case: rows[0] });
});
