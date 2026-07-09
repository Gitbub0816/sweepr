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
 * Webhook handler for the SEPARATE admin Clerk application
 * (primary domain admin.getsweepr.com — staff only).
 *
 * Register this URL in the ADMIN Clerk app's Dashboard → Webhooks:
 *   https://api.getsweepr.com/webhooks/clerk-admin
 * Secret: CLERK_ADMIN_WEBHOOK_SECRET (the Svix signing secret, whsec_…)
 *
 * Semantics differ from the primary webhook: admin-instance identities are
 * MAPPED onto existing users rows by email at request time (middleware/auth),
 * so this handler must never relink or clobber a primary-instance row.
 *   user.created / user.updated → if a row already owns the email, no-op;
 *                                 otherwise insert a fresh staff row.
 *   user.deleted               → soft-delete ONLY when the row's clerk_id is
 *                                 the admin-instance id (never a mapped row).
 */

import { Hono } from "hono";
import { getDb } from "../../lib/db";
import { logger } from "../../lib/logger";
import { verifyClerkWebhook } from "./clerk";
import type { AppBindings } from "../../types";

export const clerkAdminWebhookRouter = new Hono<AppBindings>();

interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    primary_email_address_id?: string;
  };
}

clerkAdminWebhookRouter.post("/", async (c) => {
  const secret = c.env.CLERK_ADMIN_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("clerk-admin.webhook.missing_secret");
    return c.json({ error: "Webhook not configured" }, 503);
  }

  const body = await c.req.text();
  const verdict = await verifyClerkWebhook(
    secret,
    body,
    c.req.header("svix-id") ?? "",
    c.req.header("svix-timestamp") ?? "",
    c.req.header("svix-signature") ?? "",
  );
  if (!verdict.ok) {
    logger.warn("clerk-admin.webhook.invalid_signature", { reason: verdict.reason });
    return c.json({ error: "Invalid signature", reason: verdict.reason }, 401);
  }

  let event: ClerkUserEvent;
  try {
    event = JSON.parse(body) as ClerkUserEvent;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  const { type, data } = event;

  try {
    if (type === "user.created" || type === "user.updated") {
      const primaryEmail =
        data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
          ?.email_address ?? data.email_addresses?.[0]?.email_address;
      if (!primaryEmail) return c.json({ received: true, skipped: "no email" });

      // A row already owning this email is the same human's primary-instance
      // account — leave it untouched (request-time mapping handles identity).
      const existing = (await sql`
        SELECT id FROM users WHERE LOWER(email) = LOWER(${primaryEmail}) LIMIT 1
      `) as Array<{ id: string }>;
      if (existing.length === 0) {
        await sql`
          INSERT INTO users (clerk_id, email, role)
          VALUES (${data.id}, ${primaryEmail}, 'customer')
          ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
        `;
      }
      logger.info(`clerk-admin.webhook.${type}`, { clerkId: data.id });
    } else if (type === "user.deleted") {
      // Only rows created FOR the admin-instance id — never mapped rows.
      await sql`
        UPDATE users SET deleted_at = NOW(), updated_at = NOW()
        WHERE clerk_id = ${data.id} AND deleted_at IS NULL
      `;
      logger.info("clerk-admin.webhook.user.deleted", { clerkId: data.id });
    }
  } catch (err) {
    logger.error("clerk-admin.webhook.db_error", err as Error, { type, clerkId: data.id });
    return c.json({ error: "DB error" }, 500);
  }

  return c.json({ received: true });
});
