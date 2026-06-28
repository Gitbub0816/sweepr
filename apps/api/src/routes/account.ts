/**
 * Account & privacy — GDPR/CCPA self-service (danger zone).
 *
 *   GET  /account/export            download a copy of all my data (JSON)
 *   POST /account/unsubscribe       opt out of all communications
 *   POST /account/delete-pii        scrub personal info, keep the account
 *   POST /account/delete            { scope, confirmEmail } HARD delete account
 *
 * Every destructive action re-verifies the signed-in user by requiring them to
 * type their exact email in `confirmEmail`. Deletes are HARD (rows removed);
 * FK ON DELETE CASCADE (migration 031) removes all dependent rows.
 *
 * Email/phone changes are handled client-side via Clerk (with OTP verification)
 * and synced back through the Clerk webhook + requireAuth.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { getUserByClerkId, getCustomerByUserId, getCleanerByUserId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const accountRouter = new Hono<AppBindings>();
accountRouter.use("*", requireAuth);

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolve the signed-in user (and a db handle). Only ever the caller's own. */
async function me(c: Context<AppBindings>) {
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = await getUserByClerkId(sql, clerkId);
  return { sql, user, clerkId };
}

// ── Export ────────────────────────────────────────────────────────────────────
accountRouter.get("/export", async (c) => {
  const { sql, user, clerkId } = await me(c);
  if (!user) return c.json({ error: "User not found" }, 404);

  const customer = await getCustomerByUserId(sql, user.id);
  const cleaner = await getCleanerByUserId(sql, user.id);
  const safe = async <T>(p: Promise<T>, f: T) => { try { return await p; } catch { return f; } };

  const [addresses, bookings, reviews, notifications, tickets, training, consents] = await Promise.all([
    safe(sql`SELECT * FROM addresses WHERE user_id = ${user.id}`, []),
    safe(customer
      ? sql`SELECT * FROM bookings WHERE customer_id = ${customer.id}`
      : (cleaner ? sql`SELECT * FROM bookings WHERE cleaner_id = ${cleaner.id}` : sql`SELECT 1 WHERE false`), []),
    safe(sql`SELECT * FROM reviews WHERE customer_id = ${customer?.id ?? null} OR cleaner_id = ${cleaner?.id ?? null}`, []),
    safe(sql`SELECT * FROM notifications WHERE user_id = ${user.id}`, []),
    safe(sql`SELECT id, ticket_number, title, category, status, created_at FROM it_tickets WHERE reporter_clerk_id = ${clerkId}`, []),
    safe(cleaner ? sql`SELECT * FROM cleaner_training_progress WHERE cleaner_id = ${cleaner.id}` : sql`SELECT 1 WHERE false`, []),
    safe(sql`SELECT * FROM consent_log WHERE user_id = ${user.id}`, []),
  ]);

  return c.json({
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, role: user.role, createdAt: (user as unknown as Record<string, unknown>).created_at },
    customer, cleaner, addresses, bookings, reviews, notifications, supportTickets: tickets,
    trainingProgress: training, consents,
  });
});

// ── Unsubscribe from communications ───────────────────────────────────────────
accountRouter.post("/unsubscribe", async (c) => {
  const { sql, user } = await me(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  const cleaner = await getCleanerByUserId(sql, user.id);
  const email = user.email;

  await Promise.allSettled([
    email ? sql`DELETE FROM newsletter_subscribers WHERE email = ${email}` : Promise.resolve(),
    email ? sql`DELETE FROM status_subscribers WHERE email = ${email}` : Promise.resolve(),
    email ? sql`DELETE FROM city_subscribers WHERE email = ${email}` : Promise.resolve(),
    cleaner ? sql`
      UPDATE cleaners SET notification_marketing = false, notification_reminder = false,
        notification_payout = true, notification_job_offer = true WHERE id = ${cleaner.id}
    ` : Promise.resolve(),
    sql`INSERT INTO consent_log (user_id, consent_type, granted) VALUES (${user.id}, 'marketing', false)`,
  ]);
  return c.json({ ok: true });
});

// ── Delete PII only (keep account) ────────────────────────────────────────────
const confirmSchema = z.object({ confirmEmail: z.string().email() });

accountRouter.post("/delete-pii", zValidator("json", confirmSchema), async (c) => {
  const { sql, user } = await me(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (c.req.valid("json").confirmEmail.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return c.json({ error: "Email confirmation does not match." }, 400);
  }
  const customer = await getCustomerByUserId(sql, user.id);
  const cleaner = await getCleanerByUserId(sql, user.id);

  await Promise.allSettled([
    sql`DELETE FROM addresses WHERE user_id = ${user.id}`,
    customer ? sql`UPDATE customers SET first_name = NULL, last_name = NULL, phone = NULL WHERE id = ${customer.id}` : Promise.resolve(),
    cleaner ? sql`UPDATE cleaners SET first_name = NULL, last_name = NULL, phone = NULL, bio = NULL, avatar_url = NULL WHERE id = ${cleaner.id}` : Promise.resolve(),
    sql`INSERT INTO consent_log (user_id, consent_type, granted) VALUES (${user.id}, 'pii_erasure', false)`,
  ]);
  await sql`INSERT INTO account_deletion_log (email_hash, scope) VALUES (${await sha256(user.email ?? user.id)}, 'pii')`;
  return c.json({ ok: true });
});

// ── Hard-delete the account (and all data) ────────────────────────────────────
accountRouter.post(
  "/delete",
  zValidator("json", confirmSchema.extend({ scope: z.enum(["account", "account_and_data"]).default("account_and_data") })),
  async (c) => {
    const { sql, user, clerkId } = await me(c);
    if (!user) return c.json({ error: "User not found" }, 404);
    const { confirmEmail, scope } = c.req.valid("json");
    if (confirmEmail.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return c.json({ error: "Email confirmation does not match." }, 400);
    }

    const emailHash = await sha256(user.email ?? user.id);
    const email = user.email;

    // Audit FIRST (separate table, not cascade-linked, no PII).
    await sql`INSERT INTO account_deletion_log (email_hash, scope) VALUES (${emailHash}, ${scope})`;

    // Email-keyed rows aren't FK-linked to the user — remove explicitly.
    if (email) {
      await Promise.allSettled([
        sql`DELETE FROM newsletter_subscribers WHERE email = ${email}`,
        sql`DELETE FROM status_subscribers WHERE email = ${email}`,
        sql`DELETE FROM city_subscribers WHERE email = ${email}`,
        sql`DELETE FROM waitlist WHERE email = ${email}`,
      ]);
    }

    // Hard delete — cascades to customers/cleaners/bookings/payments/etc. (031).
    await sql`DELETE FROM users WHERE id = ${user.id}`;

    // Delete the Clerk identity too so they can't sign back into a ghost account.
    try {
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      await clerk.users.deleteUser(clerkId);
    } catch (err) {
      logger.error("account.delete.clerk_failed", err as Error, { userId: user.id });
    }

    return c.json({ ok: true, deleted: true });
  },
);
