/**
 * IT ticketing — user-submitted "Report a problem" requests + admin help desk.
 *
 * User-facing (any authenticated app user):
 *   POST /it-tickets               create a ticket ("Report a problem")
 *   GET  /it-tickets/mine          list my own tickets
 *
 * Admin help desk (admin/owner only):
 *   GET   /it-tickets/admin                list (?view=open|past_due|resolved|closed)
 *   GET   /it-tickets/admin/:id            ticket detail + comments
 *   PATCH /it-tickets/admin/:id            update status/priority/assignee/due
 *   POST  /it-tickets/admin/:id/comments   add an admin comment
 *   POST  /it-tickets/admin/from-error/:errorId   create a ticket from an error
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createMiddleware } from "hono/factory";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

export const itTicketsRouter = new Hono<AppBindings>();
itTicketsRouter.use("*", requireAuth);

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

const CATEGORY = ["bug", "billing", "account", "technical", "feature_request", "safety", "other"] as const;
const PRIORITY = ["low", "normal", "high", "urgent"] as const;
const STATUS = ["open", "in_progress", "resolved", "closed"] as const;

// ── Create (Report a problem) ─────────────────────────────────────────────────
const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(CATEGORY).default("other"),
  priority: z.enum(PRIORITY).optional(),
  app: z.enum(["customer", "cleaner", "admin", "service"]).optional(),
  context: z.record(z.unknown()).optional(),
});

itTicketsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const { clerkId, email } = c.get("user");

  const rows = (await sql`
    INSERT INTO it_tickets (title, description, category, priority, source, app,
                            reporter_clerk_id, reporter_email, context)
    VALUES (${body.title}, ${body.description ?? null}, ${body.category},
            ${body.priority ?? "normal"}, 'user_report', ${body.app ?? null},
            ${clerkId}, ${email ?? null}, ${JSON.stringify(body.context ?? {})})
    RETURNING id, ticket_number, status
  `) as Array<{ id: string; ticket_number: number; status: string }>;

  return c.json({ ok: true, ticket: rows[0] });
});

itTicketsRouter.get("/mine", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { clerkId } = c.get("user");
  const rows = await sql`
    SELECT id, ticket_number, title, category, priority, status, created_at, updated_at
    FROM it_tickets WHERE reporter_clerk_id = ${clerkId}
    ORDER BY created_at DESC LIMIT 100
  `;
  return c.json({ tickets: rows });
});

// ── Admin help desk ──────────────────────────────────────────────────────────
itTicketsRouter.get("/admin", requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const view = c.req.query("view") ?? "open";

  let rows;
  if (view === "past_due") {
    rows = await sql`
      SELECT * FROM it_tickets
      WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < NOW()
      ORDER BY due_at ASC`;
  } else if (view === "open") {
    rows = await sql`
      SELECT * FROM it_tickets
      WHERE status IN ('open','in_progress')
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at DESC`;
  } else {
    const status = view === "closed" ? "closed" : "resolved";
    rows = await sql`SELECT * FROM it_tickets WHERE status = ${status} ORDER BY updated_at DESC LIMIT 200`;
  }

  const counts = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < NOW())::int AS past_due,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE status = 'closed')::int AS closed
    FROM it_tickets`;

  return c.json({ tickets: rows, counts: (counts as Array<Record<string, number>>)[0] });
});

itTicketsRouter.get("/admin/:id", requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [ticket] = (await sql`SELECT * FROM it_tickets WHERE id = ${id}`) as Array<Record<string, unknown>>;
  if (!ticket) return c.json({ error: "Not found" }, 404);
  const comments = await sql`
    SELECT id, author_email, is_admin, body, created_at
    FROM it_ticket_comments WHERE ticket_id = ${id} ORDER BY created_at ASC`;
  return c.json({ ticket, comments });
});

const updateSchema = z.object({
  status: z.enum(STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  assigned_to: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
});

itTicketsRouter.patch("/admin/:id", requireAdmin, zValidator("json", updateSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const b = c.req.valid("json");
  // undefined => leave column unchanged; null => set NULL. Nested sql`` fragments
  // don't compose in the Neon HTTP client, so gate with a boolean flag instead.
  const setAssigned = b.assigned_to !== undefined;
  const setDue = b.due_at !== undefined;

  const [row] = (await sql`
    UPDATE it_tickets SET
      status      = COALESCE(${b.status ?? null}, status),
      priority    = COALESCE(${b.priority ?? null}, priority),
      assigned_to = CASE WHEN ${setAssigned} THEN ${b.assigned_to ?? null} ELSE assigned_to END,
      due_at      = CASE WHEN ${setDue} THEN ${b.due_at ?? null}::timestamptz ELSE due_at END,
      resolved_at = CASE WHEN ${b.status ?? null} = 'resolved' THEN NOW() ELSE resolved_at END,
      closed_at   = CASE WHEN ${b.status ?? null} = 'closed' THEN NOW() ELSE closed_at END,
      updated_at  = NOW()
    WHERE id = ${id}
    RETURNING id, status
  `) as Array<{ id: string; status: string }>;
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, ticket: row });
});

itTicketsRouter.post(
  "/admin/:id/comments",
  requireAdmin,
  zValidator("json", z.object({ body: z.string().min(1).max(5000) })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { clerkId, email } = c.get("user");
    await sql`
      INSERT INTO it_ticket_comments (ticket_id, author_clerk_id, author_email, is_admin, body)
      VALUES (${id}, ${clerkId}, ${email ?? null}, TRUE, ${c.req.valid("json").body})
    `;
    await sql`UPDATE it_tickets SET updated_at = NOW() WHERE id = ${id}`;
    return c.json({ ok: true });
  },
);

itTicketsRouter.post("/admin/from-error/:errorId", requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const errorId = c.req.param("errorId");
  const { clerkId, email } = c.get("user");

  const [err] = (await sql`
    SELECT id, app, message, path, status_code FROM error_logs WHERE id = ${errorId}
  `) as Array<{ id: string; app: string | null; message: string; path: string | null; status_code: number | null }>;
  if (!err) return c.json({ error: "Error not found" }, 404);

  const [row] = (await sql`
    INSERT INTO it_tickets (title, description, category, priority, source, app,
                            reporter_clerk_id, reporter_email, related_error_id, context)
    VALUES (
      ${`Error: ${err.message.slice(0, 160)}`},
      ${`Auto-created from error log.\nPath: ${err.path ?? "—"}\nStatus: ${err.status_code ?? "—"}`},
      'bug', 'high', 'error', ${err.app ?? null}, ${clerkId}, ${email ?? null}, ${err.id},
      ${JSON.stringify({ errorId: err.id })}
    )
    RETURNING id, ticket_number
  `) as Array<{ id: string; ticket_number: number }>;

  // Mark the error resolved now that it's tracked as a ticket.
  await sql`UPDATE error_logs SET resolved = true, resolved_at = NOW(), resolved_by = ${clerkId} WHERE id = ${errorId}`;

  return c.json({ ok: true, ticket: row });
});
