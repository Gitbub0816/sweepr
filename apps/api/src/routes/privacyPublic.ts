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
 * Public privacy endpoints (no auth — rate-limited at mount):
 *
 *   POST /privacy/consent   persist a cookie-consent decision (GDPR Art. 7
 *                           accountability: we can prove what was chosen, when)
 *   POST /privacy/requests  DSAR intake for anyone, including non-account
 *                           holders (CCPA "know/delete/opt-out", GDPR access
 *                           /erasure/portability). Creates a privacy_requests
 *                           row and notifies admins.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const privacyPublicRouter = new Hono<AppBindings>();

const consentSchema = z.object({
  analytics: z.boolean(),
  functional: z.boolean().optional().default(false),
  marketing: z.boolean().optional().default(false),
  gpcDetected: z.boolean().optional().default(false),
  /** Client-generated stable anonymous id so choices can be audited/updated. */
  anonymousId: z.string().min(8).max(100).optional(),
});

privacyPublicRouter.post("/consent", zValidator("json", consentSchema), async (c) => {
  const { analytics, functional, marketing, gpcDetected, anonymousId } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    INSERT INTO cookie_consents (anonymous_id, necessary, functional, analytics, marketing, gpc_detected)
    VALUES (${anonymousId ?? null}, TRUE, ${functional}, ${analytics}, ${marketing}, ${gpcDetected})
  `;
  return c.json({ ok: true });
});

const requestSchema = z.object({
  email: z.string().email().max(320),
  requestType: z.enum(["know", "access", "delete", "correct", "opt_out", "portability"]),
  details: z.string().max(4000).optional(),
  jurisdiction: z.string().max(50).optional(),
});

/**
 * Statutory response window (calendar days) for a DSAR, by declared
 * jurisdiction. CCPA/CPRA (California, US privacy laws) → 45 days; GDPR/UK GDPR
 * (EU/EEA/UK) → 30 days; anything unrecognized → 30 (the shorter, safer clock).
 */
export function responseDueDays(jurisdiction?: string | null): number {
  const j = (jurisdiction ?? "").toLowerCase();
  if (/ccpa|cpra|california|\bca\b|united states|\bus\b|usa/.test(j)) return 45;
  if (/gdpr|eu|eea|europe|uk|united kingdom|britain/.test(j)) return 30;
  return 30;
}

privacyPublicRouter.post("/requests", zValidator("json", requestSchema), async (c) => {
  const { email, requestType, details, jurisdiction } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  // Link to an existing account when the email matches one (best-effort).
  const users = (await sql`
    SELECT id FROM users WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1
  `) as Array<{ id: string }>;

  // Statutory response deadline is jurisdiction-specific: GDPR grants one month
  // (30 days), CCPA/CPRA grants 45 days. Default to the shorter 30-day clock
  // when the jurisdiction is unknown so we never under-respond.
  const dueDays = responseDueDays(jurisdiction);
  const rows = (await sql`
    INSERT INTO privacy_requests (requester_id, requester_email, request_type, jurisdiction, details, due_at)
    VALUES (${users[0]?.id ?? null}, ${email}, ${requestType}, ${jurisdiction ?? null}, ${details ?? null},
            NOW() + (${`${dueDays} days`}::interval))
    RETURNING id
  `) as Array<{ id: string }>;

  try {
    await sql`
      INSERT INTO notifications (user_id, type, body, created_at)
      SELECT u.id, 'privacy_request',
             ${`New privacy request (${requestType}) from ${email}`.slice(0, 500)}, NOW()
      FROM users u WHERE u.role IN ('admin', 'super_admin') LIMIT 5
    `;
  } catch (err) {
    logger.error("privacy request: admin notify failed", err);
  }

  return c.json({ ok: true, id: rows[0].id });
});
