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
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { generateTicketId, itTypeCode } from "../lib/ticketId";
import { sendEmail, SENDERS, TEMPLATES, formatEmailTimestamp } from "../lib/mailer";
import { getTicketContext } from "../lib/ticketContext";
import { inferIT } from "../lib/classify";
import { sanitizeText } from "../lib/sanitizeText";
import type { AppBindings } from "../types";

export const itTicketsRouter = new Hono<AppBindings>();
itTicketsRouter.use("*", requireAuth);

const CATEGORY = ["bug", "billing", "account", "technical", "feature_request", "safety", "other"] as const;
const PRIORITY = ["low", "normal", "high", "urgent"] as const;
const STATUS = ["open", "in_progress", "resolved", "closed"] as const;

/** Optional client-reported device info — shape agreed in the mail/security contract. */
const deviceSchema = z.object({
  platform: z.string().optional(),
  userAgent: z.string().optional(),
  viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  language: z.string().optional(),
  screen: z.object({ width: z.number(), height: z.number() }).optional(),
  deviceMemory: z.number().optional(),
  hardwareConcurrency: z.number().optional(),
  touch: z.boolean().optional(),
}).optional();

export interface ReporterTelemetry {
  consent: boolean | null;
  ip: string | null;
  userAgent: string | null;
  geo: Record<string, unknown> | null;
  device: Record<string, unknown> | null;
}

/**
 * Resolve tracking consent and (only when granted) the reporter's ip/ua/geo
 * telemetry for a "report a problem" ticket. Consent source is the most
 * recent `cookie_consents` row for the user, keyed by clerk_id → users.id,
 * using the `analytics` column as the tracking-consent signal.
 *
 * No consent row → `consent: null` (unknown/legacy) and nothing is stored.
 * `analytics = false` → `consent: false` and nothing is stored.
 * `analytics = true` → `consent: true` and ip/ua/geo/device are captured.
 *
 * This gate is about storing a REPORTER's own telemetry on their ticket —
 * it does not apply to security_events, which log attacker/request activity
 * under legitimate-interest security logging, not user tracking.
 */
export async function resolveReporterTelemetry(
  sql: ReturnType<typeof getDb>,
  c: { req: { header: (k: string) => string | undefined; raw: Request } },
  clerkId: string | null,
  device?: unknown,
): Promise<ReporterTelemetry> {
  let consent: boolean | null = null;
  if (clerkId) {
    try {
      const rows = (await sql`
        SELECT cc.analytics
        FROM cookie_consents cc
        JOIN users u ON u.id = cc.user_id
        WHERE u.clerk_id = ${clerkId}
        ORDER BY cc.consent_at DESC LIMIT 1
      `) as Array<{ analytics: boolean }>;
      if (rows[0]) consent = rows[0].analytics === true;
    } catch {
      consent = null;
    }
  }

  if (consent !== true) {
    return { consent, ip: null, userAgent: null, geo: null, device: null };
  }

  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;
  const cf = (c.req.raw as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  const geo = {
    country: (cf.country as string) ?? null,
    region: (cf.region as string) ?? null,
    city: (cf.city as string) ?? null,
    timezone: (cf.timezone as string) ?? null,
    colo: (cf.colo as string) ?? null,
    lat: (cf.latitude as string) ?? null,
    lng: (cf.longitude as string) ?? null,
  };
  return { consent, ip, userAgent, geo, device: (device as Record<string, unknown>) ?? null };
}

// ── Create (Report a problem) ─────────────────────────────────────────────────
const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(CATEGORY).default("other"),
  priority: z.enum(PRIORITY).optional(),
  app: z.enum(["customer", "cleaner", "admin", "service"]).optional(),
  context: z.record(z.unknown()).optional().refine(
    (v) => !v || JSON.stringify(v).length < 4096,
    { message: "context too large (max 4096 bytes)" },
  ),
  device: deviceSchema,
});

itTicketsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const { clerkId, email } = c.get("user");

  const title = sanitizeText(body.title, 200);
  const description = body.description ? sanitizeText(body.description, 5000) : null;
  const inf = inferIT(title, description ?? "");
  const gen = generateTicketId("IT", itTypeCode(body.category));
  const telemetry = await resolveReporterTelemetry(sql, c, clerkId, body.device);
  const rows = (await sql`
    INSERT INTO it_tickets (title, description, category, priority, source, app,
                            reporter_clerk_id, reporter_email, context,
                            ticket_id, case_code, ticket_prefix, encoded_date, encoded_time, issue_type, hex_suffix,
                            classification_confidence, classification_signals, auto_classified,
                            reporter_ip, reporter_user_agent, reporter_geo, reporter_device, telemetry_consent)
    VALUES (${title}, ${description}, ${body.category},
            ${body.priority ?? "normal"}, 'user_report', ${body.app ?? null},
            ${clerkId}, ${email ?? null}, ${JSON.stringify(body.context ?? {})},
            ${gen.ticketId}, ${gen.caseCode}, 'IT', ${gen.encodedDate}, ${gen.encodedTime}, ${gen.issueType}, ${gen.hex},
            ${inf.confidence}, ${JSON.stringify(inf.signals)}, ${inf.auto},
            ${telemetry.ip}, ${telemetry.userAgent}, ${telemetry.geo ? JSON.stringify(telemetry.geo) : null},
            ${telemetry.device ? JSON.stringify(telemetry.device) : null}, ${telemetry.consent})
    RETURNING id, ticket_number, case_code, ticket_id, status
  `) as Array<{ id: string; ticket_number: number; case_code: string; ticket_id: string; status: string }>;

  return c.json({ ok: true, ticket: rows[0] });
});

itTicketsRouter.get("/mine", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { clerkId } = c.get("user");
  const rows = await sql`
    SELECT id, ticket_number, case_code, ticket_id, title, category, priority, status, created_at, updated_at
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

itTicketsRouter.get("/admin/:id/context", requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [t] = (await sql`SELECT id, reporter_email, related_error_id FROM it_tickets WHERE id = ${id} LIMIT 1`) as Array<{ id: string; reporter_email: string | null; related_error_id: string | null }>;
  if (!t) return c.json({ error: "Not found" }, 404);
  const context = await getTicketContext(sql, t.reporter_email, { kind: "it", ticketDbId: id, errorId: t.related_error_id });
  return c.json({ context });
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
    const commentBody = sanitizeText(c.req.valid("json").body, 5000);
    await sql`
      INSERT INTO it_ticket_comments (ticket_id, author_clerk_id, author_email, is_admin, body)
      VALUES (${id}, ${clerkId}, ${email ?? null}, TRUE, ${commentBody})
    `;
    await sql`UPDATE it_tickets SET updated_at = NOW() WHERE id = ${id}`;
    return c.json({ ok: true });
  },
);

/** Email the reporter a manual IT response (IT_Manual-Reply) + log a comment. */
itTicketsRouter.post(
  "/admin/:id/email-reply",
  requireAdmin,
  zValidator("json", z.object({
    body: z.string().min(1).max(8000),
    caseStatus: z.string().optional(),
    assignedTo: z.string().optional(),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { body, caseStatus, assignedTo } = c.req.valid("json");
    const { clerkId, email } = c.get("user");
    const [t] = (await sql`SELECT * FROM it_tickets WHERE id = ${id} LIMIT 1`) as Array<Record<string, unknown>>;
    if (!t) return c.json({ error: "Not found" }, 404);
    if (!t.reporter_email) return c.json({ error: "Ticket has no reporter email to reply to." }, 400);

    const caseCode = (t.case_code as string) ?? (t.ticket_id as string) ?? `IT_${String(t.ticket_number ?? "")}`;
    const classification = (t.category as string) ?? "Other";
    if (!c.env.MAILERSEND_API_KEY) return c.json({ error: "Email not configured — MAILERSEND_API_KEY is missing." }, 502);
    let delivery = "failed";
    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: t.reporter_email as string,
        subject: `Sweepr IT Update — ${caseCode}`,
        from: SENDERS.IT,
        replyTo: SENDERS.IT,
        templateId: TEMPLATES.IT_MANUAL_RESPONSE,
        // Template emails carry no local html/text — supply the actual reply
        // body so the Mail tab's Sent folder shows real content.
        text: body,
        variables: {
          case_code: caseCode,
          ticket_id: (t.ticket_id as string) ?? caseCode,
          generated_at: formatEmailTimestamp(),
          it_classification: classification,
          case_status: caseStatus ?? "Work In Progress",
          assigned_to: assignedTo ?? (t.assigned_to as string) ?? "IT Operations",
          response_body: body,
        },
      }, sql);
      delivery = "sent";
    } catch (err) {
      return c.json({ error: "Email delivery failed." }, 502);
    }
    await sql`
      INSERT INTO it_ticket_comments (ticket_id, author_clerk_id, author_email, is_admin, body)
      VALUES (${id}, ${clerkId}, ${email ?? null}, TRUE, ${`[Emailed reporter — ${delivery}]\n${body}`})
    `;
    await sql`UPDATE it_tickets SET assigned_to = COALESCE(${assignedTo ?? null}, assigned_to), updated_at = NOW() WHERE id = ${id}`;
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

  const gen = generateTicketId("IT", "BUG");
  const [row] = (await sql`
    INSERT INTO it_tickets (title, description, category, priority, source, app,
                            reporter_clerk_id, reporter_email, related_error_id, context,
                            ticket_id, case_code, ticket_prefix, encoded_date, encoded_time, issue_type, hex_suffix)
    VALUES (
      ${`Error: ${err.message.slice(0, 160)}`},
      ${`Auto-created from error log.\nPath: ${err.path ?? "—"}\nStatus: ${err.status_code ?? "—"}`},
      'bug', 'high', 'error', ${err.app ?? null}, ${clerkId}, ${email ?? null}, ${err.id},
      ${JSON.stringify({ errorId: err.id })},
      ${gen.ticketId}, ${gen.caseCode}, 'IT', ${gen.encodedDate}, ${gen.encodedTime}, ${gen.issueType}, ${gen.hex}
    )
    RETURNING id, ticket_number, case_code
  `) as Array<{ id: string; ticket_number: number; case_code: string }>;

  // Mark the error resolved now that it's tracked as a ticket.
  await sql`UPDATE error_logs SET resolved = true, resolved_at = NOW(), resolved_by = ${clerkId} WHERE id = ${errorId}`;

  return c.json({ ok: true, ticket: row });
});
