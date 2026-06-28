import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";
import type { UserRow } from "@sweepr/db";

export const adminRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
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
  // Run independently so one missing table/column can't blank the whole
  // dashboard. Each settled result falls back to a safe empty default.
  const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch { return fallback; }
  };
  const [statsRow, bookingsByStatus, recentBookings, recentAudit, waitlistCount, newsletterCount, cityRequestCount] = await Promise.all([
    settle(sql`
      SELECT
        (SELECT COUNT(*)::int FROM bookings) AS total_bookings,
        (SELECT COUNT(*)::int FROM bookings WHERE scheduled_at::date = CURRENT_DATE) AS bookings_today,
        (SELECT COUNT(*)::int FROM cleaners WHERE status = 'pending') AS pending_cleaners,
        (SELECT COUNT(*)::int FROM cleaners WHERE status = 'approved') AS active_cleaners,
        (SELECT COUNT(*)::int FROM cleaners) AS total_cleaners,
        (SELECT COUNT(*)::int FROM disputes WHERE status = 'open') AS open_disputes,
        (SELECT COUNT(*)::int FROM disputes) AS total_disputes,
        (SELECT COUNT(*)::int FROM users WHERE role = 'customer') AS total_customers,
        (SELECT COALESCE(SUM(amount), 0)::bigint FROM payments WHERE status = 'captured') AS total_revenue_cents,
        (SELECT COALESCE(SUM(amount), 0)::bigint FROM payments WHERE status = 'captured' AND created_at::date = CURRENT_DATE) AS revenue_today_cents
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT status, COUNT(*)::int AS count FROM bookings GROUP BY status ORDER BY count DESC
    `, [] as unknown[]),
    settle(sql`
      SELECT b.id, b.status, b.service_type, b.scheduled_at AS scheduled_for, b.created_at,
             u.email AS customer_email, c.first_name AS cleaner_name
      FROM bookings b
      LEFT JOIN customers cust ON cust.id = b.customer_id
      LEFT JOIN users u ON u.id = cust.user_id
      LEFT JOIN cleaners c ON c.id = b.cleaner_id
      ORDER BY b.created_at DESC LIMIT 10
    `, [] as unknown[]),
    settle(sql`
      SELECT action, actor_clerk_id, target_type, target_id, created_at
      FROM admin_audit_log ORDER BY created_at DESC LIMIT 20
    `, [] as unknown[]),
    settle(sql`SELECT COUNT(*)::int AS count FROM waitlist`, [{ count: 0 }]),
    settle(sql`SELECT COUNT(*)::int AS count FROM newsletter_subscribers`, [{ count: 0 }]),
    settle(sql`SELECT COUNT(*)::int AS count FROM city_requests`, [{ count: 0 }]),
  ]);

  return c.json({
    stats: (statsRow as Array<Record<string, unknown>>)[0],
    bookingsByStatus,
    recentBookings,
    recentAudit,
    waitlistCount: (waitlistCount as Array<{ count: number }>)[0]?.count ?? 0,
    newsletterCount: (newsletterCount as Array<{ count: number }>)[0]?.count ?? 0,
    cityRequestCount: (cityRequestCount as Array<{ count: number }>)[0]?.count ?? 0,
  });
});

// ---------------------------------------------------------------------------
// Cleaners list (all statuses)
// ---------------------------------------------------------------------------

adminRouter.get("/cleaners", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const cleaners = (await sql(
    `SELECT c.id, c.first_name, c.last_name, c.status,
           u.email, c.city, c.state, c.created_at,
           c.stripe_connect_status,
           (SELECT COUNT(*)::int FROM bookings b WHERE b.cleaner_id = c.id AND b.status = 'completed') AS completed_jobs,
           (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.cleaner_id = c.id) AS avg_rating
    FROM cleaners c
    LEFT JOIN users u ON u.id = c.user_id
    ${status ? "WHERE c.status = $1" : ""}
    ORDER BY c.created_at DESC
    LIMIT 200`,
    status ? [status] : []
  )) as unknown[];
  return c.json({ cleaners });
});

// ---------------------------------------------------------------------------
// Customers list
// ---------------------------------------------------------------------------

adminRouter.get("/customers", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const customers = (await sql`
    SELECT u.id, u.email, cust.first_name, cust.last_name, u.created_at,
           COUNT(DISTINCT b.id)::int AS booking_count,
           COALESCE(SUM(p.amount), 0)::bigint AS lifetime_cents
    FROM users u
    JOIN customers cust ON cust.user_id = u.id
    LEFT JOIN bookings b ON b.customer_id = cust.id
    LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'captured'
    WHERE u.role = 'customer' OR u.role IS NULL
    GROUP BY u.id, cust.first_name, cust.last_name
    ORDER BY u.created_at DESC
    LIMIT 200
  `) as unknown[];
  return c.json({ customers });
});

// ---------------------------------------------------------------------------
// Jobs / bookings list
// ---------------------------------------------------------------------------

adminRouter.get("/jobs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);

  const jobs = (await sql(
    `SELECT b.id, b.status, b.service_type, b.scheduled_at AS scheduled_for, b.created_at,
           a.street AS address_line1, a.city AS address_city, a.state AS address_state,
           u.email AS customer_email,
           c.first_name AS cleaner_first, c.last_name AS cleaner_last,
           p.amount AS amount_cents
    FROM bookings b
    LEFT JOIN addresses a ON a.id = b.address_id
    LEFT JOIN customers cust ON cust.id = b.customer_id
    LEFT JOIN users u ON u.id = cust.user_id
    LEFT JOIN cleaners c ON c.id = b.cleaner_id
    LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'captured'
    ${status ? "WHERE b.status = $1" : ""}
    ORDER BY b.created_at DESC
    LIMIT ${status ? "$2" : "$1"} OFFSET ${status ? "$3" : "$2"}`,
    status ? [status, limit, offset] : [limit, offset]
  )) as unknown[];

  const totalRows = (await sql(
    `SELECT COUNT(*)::int AS total FROM bookings ${status ? "WHERE status = $1" : ""}`,
    status ? [status] : []
  )) as Array<{ total: number }>;

  return c.json({ jobs, total: totalRows[0]?.total ?? 0 });
});

// ---------------------------------------------------------------------------
// Audit event log (analytics / security feed)
// ---------------------------------------------------------------------------

adminRouter.get("/events", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const action = c.req.query("action");
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);

  const events = (await sql(
    `SELECT
      id, action, actor_clerk_id, target_type, target_id,
      metadata, ip_address, user_agent, created_at
    FROM admin_audit_log
    ${action ? "WHERE action = $1" : ""}
    ORDER BY created_at DESC
    LIMIT ${action ? "$2" : "$1"} OFFSET ${action ? "$3" : "$2"}`,
    action ? [action, limit, offset] : [limit, offset]
  )) as unknown[];

  const totalRows = (await sql(
    `SELECT COUNT(*)::int AS total FROM admin_audit_log ${action ? "WHERE action = $1" : ""}`,
    action ? [action] : []
  )) as Array<{ total: number }>;

  return c.json({ events, total: totalRows[0]?.total ?? 0 });
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

  const sqlAudit = getDb(c.env.DATABASE_URL);
  await audit(sqlAudit, {
    action: "cleaner.approved",
    actorClerkId: c.get("user").clerkId,
    targetType: "cleaner",
    targetId: id,
    metadata: { userId: cleaner.user_id },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

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

    await audit(sql, {
      action: "cleaner.rejected",
      actorClerkId: c.get("user").clerkId,
      targetType: "cleaner",
      targetId: id,
      metadata: { reason: reason ?? null, userId: cleaner.user_id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, status: "rejected" });
  }
);

// ─── Disputes ─────────────────────────────────────────────────────────────────

adminRouter.get("/disputes", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const rows = status
    ? await sql`
      SELECT d.id, d.booking_id, d.reason, d.description, d.status, d.resolution,
             d.created_at, d.resolved_at, b.service_type, b.scheduled_at, b.total_price,
             cu.first_name AS customer_first, cu.last_name AS customer_last, ucu.email AS customer_email,
             cl.first_name AS cleaner_first, cl.last_name AS cleaner_last
      FROM disputes d
      LEFT JOIN bookings b ON b.id = d.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN users ucu ON ucu.id = cu.user_id
      LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
      WHERE d.status = ${status}
      ORDER BY d.created_at DESC`
    : await sql`
      SELECT d.id, d.booking_id, d.reason, d.description, d.status, d.resolution,
             d.created_at, d.resolved_at, b.service_type, b.scheduled_at, b.total_price,
             cu.first_name AS customer_first, cu.last_name AS customer_last, ucu.email AS customer_email,
             cl.first_name AS cleaner_first, cl.last_name AS cleaner_last
      FROM disputes d
      LEFT JOIN bookings b ON b.id = d.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN users ucu ON ucu.id = cu.user_id
      LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
      ORDER BY d.created_at DESC`;
  return c.json({ disputes: rows });
});

adminRouter.get("/disputes/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`
    SELECT d.id, d.booking_id, d.reason, d.description, d.status, d.resolution,
           d.created_at, d.resolved_at, b.service_type, b.scheduled_at, b.total_price,
           cu.first_name AS customer_first, cu.last_name AS customer_last, ucu.email AS customer_email,
           cl.first_name AS cleaner_first, cl.last_name AS cleaner_last
    FROM disputes d
    LEFT JOIN bookings b ON b.id = d.booking_id
    LEFT JOIN customers cu ON cu.id = b.customer_id
    LEFT JOIN users ucu ON ucu.id = cu.user_id
    LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
    WHERE d.id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ dispute: rows[0] });
});

adminRouter.post(
  "/disputes/:id/resolve",
  zValidator("json", z.object({ status: z.enum(["open", "investigating", "resolved", "refunded", "denied"]), resolution: z.string().max(2000).optional() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { status, resolution } = c.req.valid("json");
    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${c.get("user").clerkId}`) as Array<{ id: string }>;
    const resolvedTerminal = status === "resolved" || status === "refunded" || status === "denied";
    const rows = (await sql`
      UPDATE disputes SET
        status = ${status},
        resolution = COALESCE(${resolution ?? null}, resolution),
        resolved_by = ${resolvedTerminal ? users[0]?.id ?? null : null},
        resolved_at = ${resolvedTerminal ? new Date().toISOString() : null}
      WHERE id = ${id} RETURNING id, status
    `) as Array<{ id: string; status: string }>;
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true, dispute: rows[0] });
  }
);

// ─── Job (booking) detail ─────────────────────────────────────────────────────
adminRouter.get("/jobs/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`
    SELECT b.*,
      cu.first_name AS customer_first, cu.last_name AS customer_last, ucu.email AS customer_email, cu.phone AS customer_phone,
      cl.id AS cleaner_id, cl.first_name AS cleaner_first, cl.last_name AS cleaner_last,
      a.street, a.unit, a.city, a.state, a.zip
    FROM bookings b
    LEFT JOIN customers cu ON cu.id = b.customer_id
    LEFT JOIN users ucu ON ucu.id = cu.user_id
    LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
    LEFT JOIN addresses a ON a.id = b.address_id
    WHERE b.id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ job: rows[0] });
});

adminRouter.patch(
  "/jobs/:id",
  zValidator("json", z.object({ status: z.string().max(40).optional(), cleaner_id: z.string().uuid().nullable().optional() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { status, cleaner_id } = c.req.valid("json");
    // cleaner_id: undefined => leave unchanged; null => unassign; value => assign.
    const setCleaner = cleaner_id !== undefined;
    const rows = (await sql`
      UPDATE bookings SET
        status = COALESCE(${status ?? null}, status),
        cleaner_id = CASE WHEN ${setCleaner} THEN ${cleaner_id ?? null}::uuid ELSE cleaner_id END,
        updated_at = NOW()
      WHERE id = ${id} RETURNING id, status, cleaner_id
    `) as Array<Record<string, unknown>>;
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true, job: rows[0] });
  }
);

// ─── Application (cleaner) detail ──────────────────────────────────────────────
adminRouter.get("/applications/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`
    SELECT cl.*, u.email, u.clerk_id
    FROM cleaners cl
    LEFT JOIN users u ON u.id = cl.user_id
    WHERE cl.id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ application: rows[0] });
});
