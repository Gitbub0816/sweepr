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
 * Owner-only diagnostics — answers "which DB is the Worker really on, did the
 * schema apply, and what's the caller's resolved identity/role?" without
 * exposing secrets. Locked to the founding owner via the token's Clerk id.
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

export const adminDebugRouter = new Hono<AppBindings>();

adminDebugRouter.use("*", requireAuth);
adminDebugRouter.use("*", async (c, next) => {
  // Owner gate. The clerk_id allowlist alone breaks for owners signed in via
  // the SEPARATE admin Clerk instance (different user pool → different id),
  // so also accept a DB-verified super_admin role — server-controlled state
  // that only the owner self-heal path sets.
  if (!isOwnerClerkId(c.get("user").clerkId, c.env)) {
    const sql = getDb(c.env.DATABASE_URL);
    const rows = (await sql`
      SELECT role FROM users WHERE clerk_id = ${c.get("user").clerkId} LIMIT 1
    `) as Array<{ role: string }>;
    if (rows[0]?.role !== "super_admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
  }
  await next();
});

/** Mask a Postgres connection string down to host/db only. */
function maskDbUrl(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

adminDebugRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const tablesToCheck = [
    "users",
    "cleaners",
    "schema_migrations",
    "api_request_logs",
    "error_logs",
    "automation_runs",
  ];
  const tableExistence: Record<string, boolean> = {};
  for (const t of tablesToCheck) {
    const rows = await safe(
      sql`SELECT to_regclass(${"public." + t}) AS t`,
      [{ t: null }] as Array<{ t: string | null }>,
    );
    tableExistence[t] = (rows as Array<{ t: string | null }>)[0]?.t !== null;
  }

  const migrations = await safe(
    sql`SELECT filename FROM schema_migrations ORDER BY filename`,
    [] as Array<{ filename: string }>,
  );

  const roleCounts = await safe(
    sql`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY role`,
    [] as Array<{ role: string; n: number }>,
  );

  const me = await safe(
    sql`SELECT id, email, role FROM users WHERE clerk_id = ${authUser.clerkId} LIMIT 1`,
    [] as Array<{ id: string; email: string; role: string }>,
  );

  const apiLogs24h = await safe(
    sql`SELECT COUNT(*)::int AS n FROM api_request_logs WHERE logged_at > NOW() - INTERVAL '24 hours'`,
    [{ n: -1 }] as Array<{ n: number }>,
  );

  const errorCount = await safe(
    sql`SELECT COUNT(*)::int AS n FROM error_logs`,
    [{ n: -1 }] as Array<{ n: number }>,
  );

  return c.json({
    caller: {
      clerkId: authUser.clerkId,
      tokenEmail: authUser.email ?? null,
      isOwner: isOwnerClerkId(authUser.clerkId, c.env),
      dbRow: me[0] ?? null,
    },
    database: {
      host: maskDbUrl(c.env.DATABASE_URL),
      tables: tableExistence,
      migrationsApplied: (migrations as Array<{ filename: string }>).map((m) => m.filename),
      migrationCount: (migrations as Array<{ filename: string }>).length,
    },
    data: {
      usersByRole: roleCounts,
      apiRequestLogs24h: (apiLogs24h as Array<{ n: number }>)[0]?.n ?? -1,
      errorLogsTotal: (errorCount as Array<{ n: number }>)[0]?.n ?? -1,
    },
  });
});

/**
 * Probe Yardstik connectivity from the Worker's own egress. Answers, for each
 * host: does the configured key authenticate, and does Yardstik's edge accept
 * traffic from Cloudflare Workers at all? Uses a read-only GET (no candidate
 * or report is created). Never echoes the key beyond a short prefix.
 */
adminDebugRouter.get("/yardstik", async (c) => {
  const key = c.env.YARDSTIK_API_KEY ?? "";
  const hosts = [
    "https://api.yardstik.com",
    "https://api.yardstik-staging.com",
  ];
  const results = [];
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/webhook_types`, {
        headers: {
          Authorization: `Account ${key}`,
          Accept: "application/json",
          "User-Agent": "Sweepr-API/1.0 (+https://getsweepr.com)",
        },
      });
      const body = await res.text().catch(() => "");
      results.push({ host, status: res.status, body: body.slice(0, 300) });
    } catch (err) {
      results.push({ host, status: 0, body: `fetch failed: ${String(err).slice(0, 200)}` });
    }
  }
  return c.json({
    keyPresent: Boolean(key),
    keyPrefix: key ? key.slice(0, 8) : null,
    configuredYardstikUrl: c.env.YARDSTIK_API_URL ?? "(unset — defaults to https://api.yardstik.com)",
    accountPackageId: c.env.YARDSTIK_ACCOUNT_PACKAGE_ID ?? "(unset)",
    results,
  });
});

/**
 * One-click Sentry verification: sends a synthetic test event through the same
 * recordError → forwardToSentry pipeline every real error uses. If SENTRY_DSN
 * is set correctly, a "Sweepr Sentry test event" appears in Sentry Issues
 * within seconds (this also satisfies Sentry's "waiting for first error"
 * onboarding gate).
 */
adminDebugRouter.get("/sentry-test", async (c) => {
  const dsnPresent = Boolean(c.env.SENTRY_DSN);
  if (!dsnPresent) {
    return c.json({
      ok: false,
      dsnPresent,
      hint: "Set the DSN first: printf 'https://…' | wrangler secret put SENTRY_DSN (in apps/api). Copy it from Sentry → Settings → Projects → javascript-nextjs → Client Keys (DSN).",
    });
  }
  const { recordError } = await import("../lib/errorLog");
  const sql = getDb(c.env.DATABASE_URL);
  await recordError(
    sql,
    {
      source: "server",
      app: "api",
      level: "error",
      message: "Sweepr Sentry test event — integration verified",
      errorName: "SentryTestEvent",
      path: "/admin/debug/sentry-test",
      method: "GET",
      fingerprint: "sentry-test-event",
      context: { triggeredBy: c.get("user").clerkId, at: new Date().toISOString() },
    },
    c.env,
  );
  return c.json({
    ok: true,
    dsnPresent,
    note: "Test event sent through the real pipeline — check Sentry Issues (and the admin Errors feed).",
  });
});

/**
 * Dump a cleaner's Stripe Connect state — both what we have locally and what
 * Stripe reports live — so we can see exactly what Stripe is waiting on when a
 * cleaner shows "not set up" after onboarding. Owner-only (router is gated).
 * Resolve target by ?email= or ?cleanerId=, else defaults to the owner's own
 * cleaner row (by known owner clerk_ids).
 */
adminDebugRouter.get("/stripe-connect", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const email = c.req.query("email");
  const cleanerIdParam = c.req.query("cleanerId");

  const rows = (await sql`
    SELECT c.id AS cleaner_id, c.status AS cleaner_status, c.stripe_connect_id,
           u.clerk_id, u.email
    FROM cleaners c
    JOIN users u ON u.id = c.user_id
    WHERE (${cleanerIdParam}::uuid IS NULL OR c.id = ${cleanerIdParam}::uuid)
      AND (${email ?? null}::text IS NULL OR LOWER(u.email) = LOWER(${email ?? null}))
      AND (
        ${cleanerIdParam ?? null} IS NOT NULL
        OR ${email ?? null} IS NOT NULL
        OR u.clerk_id IN ('user_3FpgxE7zcTHU3eAfCJrLV2t0qQC', 'user_3FTuNlZwiqHjvLxQIS76lw5ehMB')
      )
    ORDER BY c.created_at
    LIMIT 5
  `) as Array<{
    cleaner_id: string; cleaner_status: string; stripe_connect_id: string | null;
    clerk_id: string; email: string;
  }>;

  const { getStripe } = await import("../lib/stripe");
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  const out = [];
  for (const r of rows) {
    const local = (await sql`
      SELECT stripe_account_id, status, charges_enabled, payouts_enabled, details_submitted
      FROM stripe_connected_accounts WHERE cleaner_id = ${r.cleaner_id}
    `) as Array<Record<string, unknown>>;

    let live: Record<string, unknown> | null = null;
    if (r.stripe_connect_id) {
      try {
        const a = await stripe.accounts.retrieve(r.stripe_connect_id);
        live = {
          id: a.id,
          charges_enabled: a.charges_enabled,
          payouts_enabled: a.payouts_enabled,
          details_submitted: a.details_submitted,
          // requirements is what Stripe is still waiting on (empty = fully done)
          requirements_currently_due: a.requirements?.currently_due ?? [],
          requirements_past_due: a.requirements?.past_due ?? [],
          requirements_pending_verification: a.requirements?.pending_verification ?? [],
          disabled_reason: a.requirements?.disabled_reason ?? null,
        };
      } catch (err) {
        live = { error: String(err).slice(0, 300) };
      }
    }

    out.push({
      cleaner_id: r.cleaner_id,
      cleaner_status: r.cleaner_status,
      clerk_id: r.clerk_id,
      email: r.email,
      stripe_connect_id: r.stripe_connect_id,
      localRow: local[0] ?? null,
      stripeLive: live,
    });
  }

  return c.json({ count: out.length, cleaners: out });
});
