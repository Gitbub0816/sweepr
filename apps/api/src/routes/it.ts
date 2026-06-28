/**
 * IT operations — user management + telemetry for IT staff.
 *
 *   GET  /it/users?email=        look up Clerk users by email
 *   POST /it/users/:id/reset-password   set a temporary password (Clerk)
 *   POST /it/users/:id/sign-in-link     generate a one-time sign-in link (Clerk)
 *   GET  /it/telemetry           lightweight API health + recent error summary
 *
 * Password reset / user management require IT-admin (or super_admin/owner).
 * Telemetry is visible to any admin.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireITAccess, requireITAdmin } from "../middleware/adminRoles";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const itRouter = new Hono<AppBindings>();
itRouter.use("*", requireAuth);

const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try { return await p; } catch { return fallback; }
};

// ── User lookup (IT admin) ────────────────────────────────────────────────────
itRouter.get("/users", requireITAdmin, async (c) => {
  const email = c.req.query("email")?.trim();
  if (!email) return c.json({ users: [] });
  const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
  try {
    const list = await clerk.users.getUserList({ emailAddress: [email], limit: 10 });
    const users = list.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses?.[0]?.emailAddress ?? null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      lastSignInAt: u.lastSignInAt ?? null,
      banned: u.banned ?? false,
      twoFactorEnabled: u.twoFactorEnabled ?? false,
    }));
    return c.json({ users });
  } catch (err) {
    logger.error("it.users.lookup_failed", err as Error);
    return c.json({ error: "Clerk lookup failed" }, 502);
  }
});

// ── Manual password reset (IT admin) ──────────────────────────────────────────
itRouter.post(
  "/users/:id/reset-password",
  requireITAdmin,
  zValidator("json", z.object({ password: z.string().min(8).max(100) })),
  async (c) => {
    const id = c.req.param("id");
    const { password } = c.req.valid("json");
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
    try {
      await clerk.users.updateUser(id, { password, skipPasswordChecks: true });
      logger.info("it.password_reset", { targetUserId: id, by: c.get("user").clerkId });
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reset failed";
      return c.json({ error: "reset_failed", message }, 502);
    }
  },
);

// ── One-time sign-in link (IT admin) — for account recovery support ───────────
itRouter.post("/users/:id/sign-in-link", requireITAdmin, async (c) => {
  const id = c.req.param("id");
  const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
  try {
    const token = await clerk.signInTokens.createSignInToken({ userId: id, expiresInSeconds: 30 * 60 });
    return c.json({ ok: true, token: token.token, url: token.url ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create sign-in link";
    return c.json({ error: "sign_in_link_failed", message }, 502);
  }
});

// ── Telemetry (any admin) ─────────────────────────────────────────────────────
itRouter.get("/telemetry", requireITAccess, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [api, errors, recentErrors, openTickets] = await Promise.all([
    settle(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors_5xx,
             ROUND(AVG(duration_ms))::int AS avg_ms,
             ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_ms
      FROM api_request_logs WHERE logged_at > NOW() - INTERVAL '24 hours'
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT COUNT(*) FILTER (WHERE resolved = false)::int AS open,
             COUNT(*) FILTER (WHERE resolved = false AND occurred_at > NOW() - INTERVAL '24 hours')::int AS last_24h
      FROM error_logs
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT id, source, app, level, message, path, status_code, occurred_at
      FROM error_logs WHERE resolved = false
      ORDER BY occurred_at DESC LIMIT 10
    `, [] as unknown[]),
    settle(sql`
      SELECT COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
             COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_at < NOW())::int AS past_due
      FROM it_tickets
    `, [{}] as Array<Record<string, unknown>>),
  ]);
  return c.json({
    api: (api as Array<Record<string, unknown>>)[0],
    errors: (errors as Array<Record<string, unknown>>)[0],
    recentErrors,
    tickets: (openTickets as Array<Record<string, unknown>>)[0],
  });
});
