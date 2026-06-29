import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { getUserByClerkId, upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const authRouter = new Hono<AppBindings>();

/** Sync the signed-in Clerk user into our DB (idempotent). */
authRouter.post("/sync", requireAuth, async (c) => {
  const { clerkId, email } = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await upsertUser(sql, {
    clerkId,
    email: email ?? `${clerkId}@unknown.sweepr`,
  });
  return c.json({ user });
});

authRouter.get("/me", requireAuth, (c) => c.json({ user: c.get("user") }));

// ---------------------------------------------------------------------------
// GDPR — right to erasure (Art. 17)
// Soft-deletes user data, anonymizes PII, cancels active bookings.
// ---------------------------------------------------------------------------
authRouter.delete("/me", requireAuth, async (c) => {
  const { clerkId } = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const user = await getUserByClerkId(sql, clerkId);
  if (!user) return c.body(null, 204);

  const anonEmail = `deleted_${user.id}@deleted.sweepr`;

  // 1. Soft-delete + anonymize the user record.
  await sql`
    UPDATE users
    SET deleted_at = NOW(), email = ${anonEmail}, updated_at = NOW()
    WHERE id = ${user.id}
  `;
  // 2. Anonymize related PII.
  await sql`
    UPDATE customers
    SET deleted_at = NOW(), first_name = 'Deleted', last_name = 'User', phone = NULL
    WHERE user_id = ${user.id}
  `;
  await sql`
    UPDATE cleaners
    SET deleted_at = NOW(), first_name = 'Deleted', last_name = 'User', phone = NULL, bio = NULL
    WHERE user_id = ${user.id}
  `;
  // 3. Cancel any pending bookings owned by this user.
  await sql`
    UPDATE bookings b
    SET status = 'cancelled_by_customer', updated_at = NOW()
    FROM customers cu
    WHERE b.customer_id = cu.id AND cu.user_id = ${user.id}
      AND b.status IN ('draft','quoted','payment_pending','booked','matching')
  `;

  // 4. Record the data subject request.
  await sql`
    INSERT INTO data_subject_requests (user_id, request_type, status, completed_at)
    VALUES (${user.id}, 'delete', 'completed', NOW())
  `;

  // 5. Audit trail.
  await audit(sql, {
    action: "data.deleted",
    actorClerkId: clerkId,
    targetType: "user",
    targetId: user.id,
    metadata: {},
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  // 6. Revoke the Clerk user / sessions (best-effort).
  try {
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
    await clerk.users.deleteUser(clerkId);
  } catch (err) {
    logger.error("Failed to delete Clerk user during erasure", err);
  }

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// GDPR — right to data portability (Art. 20)
// Returns a JSON export of all of the user's data.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Email probe — used by the front-end to hint "looks like you don't have an
// account" on email blur. Public (no auth). Intentional email enumeration
// (Clerk error messages already reveal the same information).
// ---------------------------------------------------------------------------
authRouter.post(
  "/probe",
  zValidator("json", z.object({ email: z.string().email().max(254) })),
  async (c) => {
    const { email } = c.req.valid("json");
    try {
      const sql = getDb(c.env.DATABASE_URL);
      const rows = await sql`SELECT 1 FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
      return c.json({ exists: rows.length > 0 });
    } catch {
      return c.json({ exists: false });
    }
  }
);

authRouter.get("/export", requireAuth, async (c) => {
  const { clerkId } = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const user = await getUserByClerkId(sql, clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const [bookings, reviews, payments, addresses] = await Promise.all([
    sql`SELECT b.* FROM bookings b JOIN customers cu ON cu.id = b.customer_id WHERE cu.user_id = ${user.id}`,
    sql`SELECT r.* FROM reviews r JOIN customers cu ON cu.id = r.customer_id WHERE cu.user_id = ${user.id}`,
    sql`SELECT p.* FROM payments p JOIN customers cu ON cu.id = p.customer_id WHERE cu.user_id = ${user.id}`,
    sql`SELECT * FROM addresses WHERE user_id = ${user.id}`,
  ]);

  await sql`
    INSERT INTO data_subject_requests (user_id, request_type, status, completed_at)
    VALUES (${user.id}, 'export', 'completed', NOW())
  `;

  await audit(sql, {
    action: "data.export_requested",
    actorClerkId: clerkId,
    targetType: "user",
    targetId: user.id,
    metadata: {},
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  const exportData = { user, bookings, reviews, payments, addresses };
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="sweepr-data-export.json"',
    },
  });
});
