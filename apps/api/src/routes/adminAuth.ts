import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

/**
 * Public admin-auth endpoints — no requireAuth middleware.
 * These run *before* Clerk sends the email code, so they cannot be
 * gated on an existing session.
 */
export const adminAuthRouter = new Hono<AppBindings>();

// Check whether an email belongs to an admin/super_admin user.
// Used by the admin login page to give early feedback before OTP is sent.
adminAuthRouter.post(
  "/check-email",
  zValidator("json", z.object({ email: z.string().email().max(254) })),
  async (c) => {
    const { email } = c.req.valid("json");
    try {
      const sql = getDb(c.env.DATABASE_URL);
      const rows = await sql`
        SELECT 1 FROM users
        WHERE email = ${email.toLowerCase()}
          AND role IN ('admin', 'super_admin')
        LIMIT 1
      `;
      return c.json({ authorized: rows.length > 0 });
    } catch {
      return c.json({ authorized: false });
    }
  }
);
