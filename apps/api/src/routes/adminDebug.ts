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
  if (!isOwnerClerkId(c.get("user").clerkId, c.env)) {
    return c.json({ error: "Forbidden" }, 403);
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
