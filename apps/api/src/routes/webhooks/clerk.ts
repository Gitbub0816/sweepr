/**
 * Clerk webhook handler — keeps the Neon users table in sync with Clerk.
 *
 * Events handled:
 *   user.created  → INSERT user row (role: customer by default)
 *   user.updated  → UPDATE email
 *   user.deleted  → soft-delete (deleted_at = NOW())
 *
 * Verification: Svix HMAC-SHA256 signature on every request.
 * Secret: CLERK_WEBHOOK_SECRET (wrangler secret put CLERK_WEBHOOK_SECRET)
 *
 * Register this URL in Clerk Dashboard → Webhooks:
 *   https://api.getsweepr.com/webhooks/clerk
 */

import { Hono } from "hono";
import { getDb } from "../../lib/db";
import { upsertUser } from "@sweepr/db";
import { logger } from "../../lib/logger";
import type { AppBindings } from "../../types";

export const clerkWebhookRouter = new Hono<AppBindings>();

// Svix sends three headers we verify to authenticate the webhook.
const SVIX_ID = "svix-id";
const SVIX_TIMESTAMP = "svix-ts";
const SVIX_SIGNATURE = "svix-signature";

async function verifyClerkWebhook(
  secret: string,
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignatures: string
): Promise<boolean> {
  // Reject timestamps older than 5 minutes to prevent replay attacks.
  const ts = parseInt(svixTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${body}`;

  // Clerk webhook secrets are base64-encoded after the "whsec_" prefix.
  const secretBytes = Uint8Array.from(
    atob(secret.replace(/^whsec_/, "")),
    (c) => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    "raw", secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Svix may send multiple comma-separated sigs (v1,<base64> format).
  return svixSignatures.split(" ").some((s) => {
    const b64 = s.replace(/^v\d+,/, "");
    return b64 === computed;
  });
}

interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    primary_email_address_id?: string;
    deleted?: boolean;
  };
}

clerkWebhookRouter.post("/", async (c) => {
  const secret = c.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("clerk.webhook.missing_secret", new Error("CLERK_WEBHOOK_SECRET not configured"));
    return c.json({ error: "Webhook not configured" }, 500);
  }

  const svixId = c.req.header(SVIX_ID) ?? "";
  const svixTimestamp = c.req.header(SVIX_TIMESTAMP) ?? "";
  const svixSignatures = c.req.header(SVIX_SIGNATURE) ?? "";

  const body = await c.req.text();

  const valid = await verifyClerkWebhook(secret, body, svixId, svixTimestamp, svixSignatures);
  if (!valid) {
    logger.warn("clerk.webhook.invalid_signature", { svixId });
    return c.json({ error: "Invalid signature" }, 401);
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
      const primaryEmail = data.email_addresses?.find(
        (e) => e.id === data.primary_email_address_id
      )?.email_address ?? data.email_addresses?.[0]?.email_address;

      if (!primaryEmail) {
        logger.warn("clerk.webhook.no_email", { clerkId: data.id, type });
        return c.json({ received: true, skipped: "no email" });
      }

      await upsertUser(sql, { clerkId: data.id, email: primaryEmail });
      logger.info(`clerk.webhook.${type}`, { clerkId: data.id, email: primaryEmail });

    } else if (type === "user.deleted") {
      await sql`
        UPDATE users SET deleted_at = NOW(), updated_at = NOW()
        WHERE clerk_id = ${data.id} AND deleted_at IS NULL
      `;
      logger.info("clerk.webhook.user.deleted", { clerkId: data.id });
    }
  } catch (err) {
    logger.error("clerk.webhook.db_error", err as Error, { type, clerkId: data.id });
    // Return 500 so Clerk retries delivery.
    return c.json({ error: "DB error" }, 500);
  }

  return c.json({ received: true });
});
