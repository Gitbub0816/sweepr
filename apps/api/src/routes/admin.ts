import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import type { UserRow } from "@sweepr/db";

export const adminRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

adminRouter.use("*", requireAuth, requireAdmin);

adminRouter.get("/stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT
      (SELECT COUNT(*) FROM bookings) AS total_bookings,
      (SELECT COUNT(*) FROM cleaners WHERE status = 'pending') AS pending_cleaners,
      (SELECT COUNT(*) FROM disputes WHERE status = 'open') AS open_disputes
  `) as Array<Record<string, unknown>>;
  return c.json({ stats: rows[0] });
});

adminRouter.get("/cleaners/pending", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleaners = (await sql`
    SELECT * FROM cleaners WHERE status = 'pending' ORDER BY created_at DESC
  `) as unknown[];
  return c.json({ cleaners });
});

// ---------------------------------------------------------------------------
// Application review: approve / reject
// ---------------------------------------------------------------------------

const rejectSchema = z.object({ reason: z.string().optional() });

/** Approve a cleaner application. Sets DB status + Clerk role/metadata. */
adminRouter.patch("/applications/:id/approve", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = (await sql`
    UPDATE cleaners SET status = 'approved' WHERE id = ${id}
    RETURNING user_id, first_name
  `) as Array<{ user_id: string; first_name: string | null }>;
  const cleaner = rows[0];
  if (!cleaner) return c.json({ error: "Application not found" }, 404);

  const users = (await sql`
    SELECT * FROM users WHERE id = ${cleaner.user_id} LIMIT 1
  `) as UserRow[];
  const user = users[0];

  if (user) {
    await sql`UPDATE users SET role = 'cleaner' WHERE id = ${user.id}`;
    try {
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      await clerk.users.updateUserMetadata(user.clerk_id, {
        publicMetadata: { role: "cleaner", cleanerStatus: "approved" },
      });
    } catch {
      // Non-fatal: DB is source of truth; Clerk sync can be retried.
    }
    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: user.email,
        subject: "You're approved to clean with Sweepr!",
        html: `<p>Congratulations${
          cleaner.first_name ? ` ${cleaner.first_name}` : ""
        } — your application has been approved. Sign in to start accepting jobs.</p>`,
      });
    } catch {
      // Non-fatal.
    }
  }

  return c.json({ ok: true, status: "approved" });
});

/** Reject a cleaner application with an optional reason. */
adminRouter.patch(
  "/applications/:id/reject",
  zValidator("json", rejectSchema),
  async (c) => {
    const id = c.req.param("id");
    const { reason } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      UPDATE cleaners SET status = 'rejected' WHERE id = ${id}
      RETURNING user_id
    `) as Array<{ user_id: string }>;
    const cleaner = rows[0];
    if (!cleaner) return c.json({ error: "Application not found" }, 404);

    const users = (await sql`
      SELECT * FROM users WHERE id = ${cleaner.user_id} LIMIT 1
    `) as UserRow[];
    const user = users[0];

    if (user) {
      try {
        const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
        await clerk.users.updateUserMetadata(user.clerk_id, {
          publicMetadata: { cleanerStatus: "rejected" },
        });
      } catch {
        // Non-fatal.
      }
      try {
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: user.email,
          subject: "Update on your Sweepr application",
          html: `<p>Thank you for applying. Unfortunately we're unable to approve your application at this time.${
            reason ? ` Reason: ${reason}` : ""
          }</p>`,
        });
      } catch {
        // Non-fatal.
      }
    }

    return c.json({ ok: true, status: "rejected" });
  }
);
