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

privacyPublicRouter.post("/requests", zValidator("json", requestSchema), async (c) => {
  const { email, requestType, details, jurisdiction } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  // Link to an existing account when the email matches one (best-effort).
  const users = (await sql`
    SELECT id FROM users WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1
  `) as Array<{ id: string }>;

  // CCPA: 45 calendar days to respond; GDPR: 30 — track the stricter one.
  const rows = (await sql`
    INSERT INTO privacy_requests (requester_id, requester_email, request_type, jurisdiction, details, due_at)
    VALUES (${users[0]?.id ?? null}, ${email}, ${requestType}, ${jurisdiction ?? null}, ${details ?? null},
            NOW() + INTERVAL '30 days')
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
