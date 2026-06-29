/**
 * Security inbox.
 *
 *   Public inbound (MailerSend inbound route → security@getsweepr.com):
 *     POST /security/inbound       creates a ticket + sends the auto-reply
 *
 *   Admin (super_admin):
 *     GET   /security/tickets            list (?status=)
 *     GET   /security/tickets/:id        ticket + thread
 *     POST  /security/tickets/:id/reply  manual response (Security_ManualResponse)
 *     PATCH /security/tickets/:id        update status/classification/owner
 *
 * Security requirements: auto-replies never disclose investigation details,
 * never confirm a vulnerability exists, and every action is logged immutably.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { sendEmail, SENDERS, TEMPLATES, formatEmailTimestamp } from "../lib/mailer";
import { generateTicketId } from "../lib/ticketId";
import { SECURITY_LABELS, securityTypeFromLabel } from "../lib/issueTypes";
import { inferSecurity } from "../lib/classify";
import { getTicketContext } from "../lib/ticketContext";
import type { AppBindings } from "../types";

export const securityRouter = new Hono<AppBindings>();

// Canonical security issue types (shared with the report form + admin UI).
const CLASSIFICATIONS = SECURITY_LABELS as readonly string[];

const STATUSES = [
  "Active", "Pending Review", "Awaiting Response", "Investigating", "Information Requested",
  "Resolved", "Closed", "Rejected", "Duplicate", "Unable to Reproduce",
] as const;


async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ── Inbound (public) ───────────────────────────────────────────────────────────
securityRouter.post("/inbound", async (c) => {
  const raw = await c.req.text();

  // Fail-closed: require the secret to be configured.
  if (!c.env.MAILERSEND_SECURITY_INBOUND_SECRET) return c.json({ error: "Inbound not configured" }, 503);
  const sig = c.req.header("signature") ?? c.req.header("x-mailersend-signature") ?? "";
  // Use crypto.subtle.verify for timing-safe HMAC comparison.
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(c.env.MAILERSEND_SECURITY_INBOUND_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const sigBytes = Uint8Array.from(sig.match(/[0-9a-f]{2}/gi)?.map((b) => parseInt(b, 16)) ?? []);
  const valid = sigBytes.length > 0 &&
    await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(raw));
  if (!valid) return c.json({ error: "bad signature" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw || "{}"); } catch { return c.json({ error: "bad json" }, 400); }
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const from = (data.from ?? {}) as { email?: string; name?: string };
  const senderEmail = from.email ?? (data.sender as string) ?? "";
  if (!senderEmail) return c.json({ ok: true }); // nothing to do
  const subject = (data.subject as string) ?? "(no subject)";
  const bodyText = (data.text as string) ?? (data.html ? stripHtml(data.html as string) : "");
  const messageId = (data.id as string) ?? (data.message_id as string) ?? null;
  const senderIp = (data.sender_ip as string) ?? c.req.header("CF-Connecting-IP") ?? null;

  const sql = getDb(c.env.DATABASE_URL);
  const inf = inferSecurity(subject, bodyText);
  const classification = inf.label;
  const receivedAt = new Date();
  const gen = generateTicketId("SR", securityTypeFromLabel(classification).code, receivedAt);

  const rows = (await sql`
    INSERT INTO security_tickets (
      sender_email, sender_name, sender_ip, subject, classification, inbound_message_id,
      received_at, ticket_number, ticket_id, case_code, ticket_prefix,
      encoded_date, encoded_time, issue_type, hex_suffix,
      classification_confidence, classification_signals, auto_classified
    )
    VALUES (
      ${senderEmail}, ${from.name ?? null}, ${senderIp}, ${subject}, ${classification}, ${messageId},
      ${receivedAt.toISOString()}, ${gen.ticketId}, ${gen.ticketId}, ${gen.caseCode}, 'SR',
      ${gen.encodedDate}, ${gen.encodedTime}, ${gen.issueType}, ${gen.hex},
      ${inf.confidence}, ${JSON.stringify(inf.signals)}, ${inf.auto}
    )
    RETURNING id, received_at
  `) as Array<{ id: string; received_at: string }>;
  const ticket = rows[0];

  await sql`
    INSERT INTO security_ticket_messages (ticket_id, direction, from_email, to_email, subject, body, message_id)
    VALUES (${ticket.id}, 'inbound', ${senderEmail}, 'security@getsweepr.com', ${subject}, ${bodyText}, ${messageId})
  `;

  // Auto-reply (best-effort).
  if (c.env.MAILERSEND_API_KEY) {
    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: senderEmail,
        subject: `Sweepr Security — Report Received (${gen.caseCode})`,
        from: SENDERS.SECURITY,
        replyTo: SENDERS.SECURITY,
        templateId: TEMPLATES.SECURITY_AUTOREPLY,
        variables: {
          // Public-facing Case Code is the primary identifier shown to reporters.
          security_ticket_number: gen.caseCode,
          received_at: formatEmailTimestamp(new Date(ticket.received_at)),
          security_classification: classification,
        },
      });
      await sql`UPDATE security_tickets SET auto_reply_sent_at = NOW() WHERE id = ${ticket.id}`;
      await sql`
        INSERT INTO security_ticket_messages (ticket_id, direction, from_email, to_email, subject, body, delivery_status)
        VALUES (${ticket.id}, 'auto_reply', 'security@getsweepr.com', ${senderEmail},
                ${`Sweepr Security — Report Received (${gen.caseCode})`}, 'Automated acknowledgement sent.', 'sent')
      `;
    } catch (err) {
      logger.error("security.autoreply failed", err, { caseCode: gen.caseCode });
    }
  }
  return c.json({ ok: true, case_code: gen.caseCode, ticket_id: gen.ticketId });
});

// ── Admin (super_admin) ─────────────────────────────────────────────────────────
const gate = [requireAuth, requireAdminRole("super_admin")] as const;

securityRouter.get("/tickets", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const q = c.req.query("q");
  const conds: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    // Search by Case Code, Ticket ID, hex suffix, classification, or sender.
    conds.push(`(case_code ILIKE ${p} OR ticket_id ILIKE ${p} OR hex_suffix ILIKE ${p} OR classification ILIKE ${p} OR sender_email ILIKE ${p})`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `SELECT id, case_code, ticket_id, sender_email, sender_name, subject, classification, status,
            case_owner, assigned_to, received_at, last_reply_at, auto_reply_sent_at,
            classification_confidence, classification_signals, auto_classified
     FROM security_tickets ${where}
     ORDER BY received_at DESC LIMIT 300`,
    params,
  );
  return c.json({ tickets: rows, classifications: CLASSIFICATIONS, statuses: STATUSES });
});

securityRouter.get("/tickets/:id", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const t = (await sql`SELECT * FROM security_tickets WHERE id = ${id} LIMIT 1`) as unknown[];
  if (!t[0]) return c.json({ error: "Not found" }, 404);
  const messages = (await sql`SELECT * FROM security_ticket_messages WHERE ticket_id = ${id} ORDER BY created_at ASC`) as unknown[];
  return c.json({ ticket: t[0], messages, classifications: CLASSIFICATIONS, statuses: STATUSES });
});

securityRouter.get("/tickets/:id/context", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const t = (await sql`SELECT id, sender_email FROM security_tickets WHERE id = ${id} LIMIT 1`) as Array<{ id: string; sender_email: string }>;
  if (!t[0]) return c.json({ error: "Not found" }, 404);
  const context = await getTicketContext(sql, t[0].sender_email, { kind: "security", ticketDbId: id });
  return c.json({ context });
});

securityRouter.post(
  "/tickets/:id/reply",
  ...gate,
  zValidator("json", z.object({
    body: z.string().min(1),
    status: z.enum(STATUSES).optional(),
    classification: z.string().optional(),
    assignedTo: z.string().optional(),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { body, status, classification, assignedTo } = c.req.valid("json");
    const rows = (await sql`SELECT * FROM security_tickets WHERE id = ${id} LIMIT 1`) as Array<Record<string, unknown>>;
    const ticket = rows[0];
    if (!ticket) return c.json({ error: "Not found" }, 404);

    const newStatus = status ?? "Awaiting Response";
    const newClass = classification ?? (ticket.classification as string);

    let delivery = "failed";
    if (c.env.MAILERSEND_API_KEY) {
      try {
        const caseCode = (ticket.case_code as string) ?? (ticket.ticket_id as string);
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: ticket.sender_email as string,
          subject: `Sweepr Security Update — ${caseCode}`,
          from: SENDERS.SECURITY,
          replyTo: SENDERS.SECURITY,
          templateId: TEMPLATES.SECURITY_MANUAL_RESPONSE,
          variables: {
            security_ticket_number: caseCode, // public Case Code
            generated_at: formatEmailTimestamp(),
            security_classification: newClass,
            case_status: newStatus,
            assigned_to: assignedTo ?? (ticket.assigned_to as string) ?? "Security Operations",
            response_body: body,
          },
        });
        delivery = "sent";
      } catch (err) {
        logger.error("security.manual_reply failed", err, { ticketId: id });
        return c.json({ error: "Email delivery failed." }, 502);
      }
    }

    await sql`
      INSERT INTO security_ticket_messages (ticket_id, direction, from_email, to_email, subject, body, delivery_status)
      VALUES (${id}, 'outbound', 'security@getsweepr.com', ${ticket.sender_email as string},
              ${`Sweepr Security Update — ${(ticket.case_code as string) ?? (ticket.ticket_id as string)}`}, ${body}, ${delivery})
    `;
    await sql`
      UPDATE security_tickets SET status = ${newStatus}, classification = ${newClass},
        assigned_to = COALESCE(${assignedTo ?? null}, assigned_to), last_reply_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
    `;
    return c.json({ ok: true });
  },
);

securityRouter.patch(
  "/tickets/:id",
  ...gate,
  zValidator("json", z.object({
    status: z.enum(STATUSES).optional(),
    classification: z.string().optional(),
    caseOwner: z.string().optional(),
    assignedTo: z.string().optional(),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const b = c.req.valid("json");
    const rows = (await sql`
      UPDATE security_tickets SET
        status = COALESCE(${b.status ?? null}, status),
        classification = COALESCE(${b.classification ?? null}, classification),
        case_owner = COALESCE(${b.caseOwner ?? null}, case_owner),
        assigned_to = COALESCE(${b.assignedTo ?? null}, assigned_to),
        updated_at = NOW()
      WHERE id = ${id} RETURNING id
    `) as Array<{ id: string }>;
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  },
);
