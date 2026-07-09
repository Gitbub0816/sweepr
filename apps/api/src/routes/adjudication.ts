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
  // auto decisions are terminal at the engine level; review/hold wait for a human.
  const status =
    result.decision === "auto_approve" || result.decision === "auto_deny"
      ? "auto_decided"
      : result.decision; // executive_review | hold
  const finalOutcome =
    result.decision === "auto_approve" ? "approved" : result.decision === "auto_deny" ? "denied" : null;

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
      decided_at = ${finalOutcome ? new Date().toISOString() : null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Case not found" }, 404);

  try {
    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "adjudication_case",
      targetId: id,
      metadata: { event: "adjudication.evaluated", decision: result.decision, rules: result.rules },
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

  const rows = (await sql`
    UPDATE adjudication_cases SET
      final_outcome = ${outcome},
      final_note = ${note},
      decided_by = ${c.get("user").clerkId},
      decided_at = NOW(),
      status = 'decided',
      updated_at = NOW()
    WHERE id = ${id} AND status IN ('executive_review', 'hold', 'needs_input')
    RETURNING *
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Case not found or already decided" }, 404);

  try {
    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "adjudication_case",
      targetId: id,
      metadata: { event: "adjudication.decided", outcome, note: note.slice(0, 500) },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("adjudication audit failed", err);
  }
  return c.json({ case: rows[0] });
});
