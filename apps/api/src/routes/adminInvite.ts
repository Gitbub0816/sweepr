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
import { sendEmail, SENDERS, TEMPLATES, formatEmailTimestamp } from "../lib/mailer";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  finance: "Finance Admin",
  ops: "Operations Admin",
  trainer: "Training Admin",
  it: "IT Administrator",
  support: "Support",
};
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
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
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
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

const ADMIN_ROLES = ["super_admin", "admin", "ops", "finance", "trainer", "support", "it"] as const;

const createInviteSchema = z.object({
  email: z.string().email(),
  adminRole: z.enum(ADMIN_ROLES).default("admin"),
});

/** Create a one-time invite link and email it to the recipient. */
adminInviteRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  zValidator("json", createInviteSchema),
  async (c) => {
    const { email, adminRole } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const actorClerkId = c.get("user").clerkId;

    const token = generateToken();

    await sql`
      INSERT INTO admin_invites (token, email, created_by, admin_role, expires_at)
      VALUES (
        ${token},
        ${email.toLowerCase()},
        ${actorClerkId},
        ${adminRole},
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

    // Inviter display name (we store emails, not names).
    const inviterRows = (await sql`SELECT email FROM users WHERE clerk_id = ${actorClerkId} LIMIT 1`) as Array<{ email: string }>;
    const inviterName = c.get("user").email ?? inviterRows[0]?.email ?? "A Sweepr administrator";
    const roleLabel = ROLE_LABELS[adminRole] ?? "Administrator";
    const expiresAt = formatEmailTimestamp(new Date(Date.now() + 168 * 3600_000)); // generation + 168h

    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: email,
        subject: "You've been invited to Sweepr Admin",
        from: SENDERS.ADMIN,
        replyTo: SENDERS.SECURITY,
        templateId: TEMPLATES.ADMIN_INVITE,
        variables: {
          inviter_name: inviterName,
          admin_role: roleLabel,
          invite_url: link,
          invite_expires_at: expiresAt,
        },
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

    // Peek at the invite first (without consuming) to validate email match.
    const peekRows = await sql`
      SELECT email, admin_role FROM admin_invites
      WHERE token = ${token} AND used_at IS NULL AND expires_at > NOW()
      LIMIT 1
    ` as Array<{ email: string; admin_role: string }>;

    if (!peekRows[0]) {
      return c.json({ error: "Invalid, expired, or already-used token" }, 410);
    }

    // Guard: the signed-in user's email must match the invite email.
    const callerEmail = (c.get("user").email ?? "").toLowerCase();
    const inviteEmail = peekRows[0].email.toLowerCase();
    if (callerEmail && callerEmail !== inviteEmail) {
      return c.json({ error: "This invitation was sent to a different email address." }, 403);
    }

    // Now consume atomically.
    const rows = await sql`
      UPDATE admin_invites
      SET used_at = NOW()
      WHERE token = ${token}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING email, admin_role
    ` as Array<{ email: string; admin_role: string }>;

    if (!rows[0]) {
      return c.json({ error: "Invalid, expired, or already-used token" }, 410);
    }

    const grantedRole = rows[0].admin_role ?? "admin";
    // super_admin uses the dedicated role column; all other admin roles use 'admin'.
    const userRole = grantedRole === "super_admin" ? "super_admin" : "admin";

    // Promote the user in our DB
    await sql`
      UPDATE users SET role = ${userRole}, admin_role = ${grantedRole}
      WHERE clerk_id = ${clerkId}
    `;

    // Sync role to Clerk metadata so frontend can read it from the JWT
    try {
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { role: userRole, adminRole: grantedRole },
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

/**
 * Sync the caller's DB role to Clerk publicMetadata.
 * Used when a user was manually promoted via SQL and needs their Clerk
 * session to reflect the role without going through the invite flow.
 */
adminInviteRouter.post("/sync-role", requireAuth, async (c) => {
  const clerkId = c.get("user").clerkId;
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT role FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  ` as Array<{ role: string }>;

  const role = rows[0]?.role;
  if (!role || (role !== "admin" && role !== "super_admin")) {
    return c.json({ error: "No admin role found in database" }, 403);
  }

  const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
  await clerk.users.updateUserMetadata(clerkId, {
    publicMetadata: { role },
  });

  return c.json({ ok: true, role });
});

// ─── Admin user management ────────────────────────────────────────────────────

/** List all admin users. */
adminInviteRouter.get("/admins", requireAuth, requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const admins = await sql`
    SELECT id, email, role, admin_role, created_at, updated_at
    FROM users
    WHERE role IN ('admin', 'super_admin')
    ORDER BY created_at DESC
  `;
  return c.json({ admins });
});

const updateRoleSchema = z.object({
  adminRole: z.enum(["super_admin", "admin", "ops", "finance", "trainer", "support"]),
});

/** Change an admin user's role. Requires super_admin or admin. */
adminInviteRouter.patch(
  "/admins/:userId/role",
  requireAuth,
  requireAdmin,
  zValidator("json", updateRoleSchema),
  async (c) => {
    const userId = c.req.param("userId");
    const { adminRole } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const actorClerkId = c.get("user").clerkId;

    const updated = await sql`
      UPDATE users SET admin_role = ${adminRole}, updated_at = NOW()
      WHERE id = ${userId} AND role IN ('admin', 'super_admin')
      RETURNING id, email, admin_role
    ` as { id: string; email: string; admin_role: string }[];

    if (!updated[0]) return c.json({ error: "Admin not found" }, 404);

    // Sync to Clerk metadata.
    try {
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      const clerkUser = await sql`
        SELECT clerk_id FROM users WHERE id = ${userId} LIMIT 1
      ` as { clerk_id: string }[];
      if (clerkUser[0]) {
        await clerk.users.updateUserMetadata(clerkUser[0].clerk_id, {
          publicMetadata: { role: "admin", adminRole },
        });
      }
    } catch { /* non-fatal */ }

    await audit(sql, {
      action: "user.role_changed",
      actorClerkId,
      targetType: "user",
      targetId: userId,
      metadata: { newAdminRole: adminRole },
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, user: updated[0] });
  }
);
