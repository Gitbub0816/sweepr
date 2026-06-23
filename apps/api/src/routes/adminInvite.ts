/**
 * Admin invite system — one-time signed URLs for granting admin access.
 *
 * Flow:
 *   1. Super-admin calls POST /admin/invites  → invite row created, email sent
 *   2. Recipient clicks link → admin app /accept-invite?token=xxx
 *   3. App calls GET  /admin/invites/verify?token=xxx  → validates + returns email
 *   4. User signs up / signs in with Clerk
 *   5. App calls POST /admin/invites/accept  → token consumed, user promoted to admin
 *
 * First admin: run in Neon SQL editor:
 *   UPDATE users SET role = 'admin' WHERE email = '<your-email>';
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";
import type { UserRow } from "@sweepr/db";

export const adminInviteRouter = new Hono<AppBindings>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Protected — admin only
// ---------------------------------------------------------------------------

const createInviteSchema = z.object({
  email: z.string().email(),
});

/** Create a one-time invite link and email it to the recipient. */
adminInviteRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  zValidator("json", createInviteSchema),
  async (c) => {
    const { email } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const actorClerkId = c.get("user").clerkId;

    const token = generateToken();

    await sql`
      INSERT INTO admin_invites (token, email, created_by, expires_at)
      VALUES (
        ${token},
        ${email.toLowerCase()},
        ${actorClerkId},
        NOW() + INTERVAL '7 days'
      )
    `;

    // The admin app hostname — falls back to admin.getsweepr.com
    const adminOrigin =
      (c.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .find((o) => o.includes("admin")) ?? "https://admin.getsweepr.com";

    const link = `${adminOrigin}/accept-invite?token=${token}`;

    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: email,
        subject: "You've been invited to Sweepr Admin",
        html: `
          <p>You've been invited to join the Sweepr admin console.</p>
          <p><a href="${link}">Accept your invitation</a></p>
          <p>This link expires in 7 days and can only be used once.</p>
          <p>If you weren't expecting this email you can ignore it.</p>
        `,
      });
    } catch {
      // Email failure is non-fatal — return the link so the admin can share manually
    }

    await audit(sql, {
      action: "admin.invite_created",
      actorClerkId,
      targetType: "admin_invite",
      targetId: token.slice(0, 8),
      metadata: { email },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, link });
  }
);

/** List pending (unused, non-expired) invites. */
adminInviteRouter.get("/", requireAuth, requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const invites = await sql`
    SELECT id, email, created_by, expires_at, created_at
    FROM admin_invites
    WHERE used_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
  `;
  return c.json({ invites });
});

// ---------------------------------------------------------------------------
// Public — called before the user is an admin
// ---------------------------------------------------------------------------

/** Validate an invite token and return the invited email. */
adminInviteRouter.get("/verify", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!token) return c.json({ valid: false, error: "Missing token" }, 400);

  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT email, expires_at, used_at
    FROM admin_invites
    WHERE token = ${token}
    LIMIT 1
  ` as Array<{ email: string; expires_at: string; used_at: string | null }>;

  const invite = rows[0];
  if (!invite) return c.json({ valid: false, error: "Invalid token" }, 404);
  if (invite.used_at) return c.json({ valid: false, error: "Token already used" }, 410);
  if (new Date(invite.expires_at) < new Date()) {
    return c.json({ valid: false, error: "Token expired" }, 410);
  }

  return c.json({ valid: true, email: invite.email });
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

/**
 * Consume the invite token and promote the authenticated user to admin.
 * The caller must be signed in (Bearer token required).
 */
adminInviteRouter.post(
  "/accept",
  requireAuth,
  zValidator("json", acceptInviteSchema),
  async (c) => {
    const { token } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const clerkId = c.get("user").clerkId;

    // Validate and consume the invite atomically
    const rows = await sql`
      UPDATE admin_invites
      SET used_at = NOW()
      WHERE token = ${token}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING email
    ` as Array<{ email: string }>;

    if (!rows[0]) {
      return c.json({ error: "Invalid, expired, or already-used token" }, 410);
    }

    // Promote the user in our DB
    await sql`
      UPDATE users SET role = 'admin' WHERE clerk_id = ${clerkId}
    `;

    // Sync role to Clerk metadata so frontend can read it from the JWT
    try {
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { role: "admin" },
      });
    } catch {
      // Non-fatal — DB is source of truth
    }

    const user = (await sql`
      SELECT * FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    ` as UserRow[])[0];

    await audit(sql, {
      action: "admin.invite_accepted",
      actorClerkId: clerkId,
      targetType: "admin_invite",
      targetId: token.slice(0, 8),
      metadata: { email: user?.email },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true });
  }
);
