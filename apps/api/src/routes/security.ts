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
import { recordWebhookSignatureFailure } from "../lib/webhookAuth";
import { alertAdminsFromContext } from "../lib/adminAlerts";
import type { AppBindings } from "../types";

export const securityRouter = new Hono<AppBindings>();

// Canonical security issue types (shared with the report form + admin UI).
const CLASSIFICATIONS = SECURITY_LABELS as readonly string[];

const STATUSES = [
  "Active", "Pending Review", "Awaiting Response", "Investigating", "Information Requested",
  "Resolved", "Closed", "Rejected", "Duplicate", "Unable to Reproduce",
] as const;

// SOC incident triage workflow, independent of the reporter-facing status.
const TRIAGE_STATES = ["open", "investigating", "contained", "resolved"] as const;


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
  if (!valid) {
    recordWebhookSignatureFailure(c, { source: "security_inbound" });
    return c.json({ error: "bad signature" }, 401);
  }

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

  alertAdminsFromContext(c, {
    category: "security",
    title: `New security ticket ${gen.caseCode}`,
    body: `${classification} — ${subject}\nFrom: ${senderEmail}`,
    linkPath: "/security",
    dedupeKey: gen.ticketId,
  });

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

// ── Security events (live telemetry: brute force, auth failures, rate limit
// strikes, webhook signature failures) ─────────────────────────────────────────

// The console sends `since` as a relative token (1h/24h/7d/30d/all) OR an ISO
// timestamp. Normalize to an ISO string (or null for "all"/unbounded).
function resolveSince(raw: string | undefined): string | null {
  if (!raw || raw === "all") return null;
  const m = /^(\d+)([hd])$/.exec(raw);
  if (m) {
    const n = parseInt(m[1], 10);
    const ms = m[2] === "h" ? n * 3600_000 : n * 86_400_000;
    return new Date(Date.now() - ms).toISOString();
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

securityRouter.get("/events", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const type = c.req.query("type");
  const severity = c.req.query("severity");
  const ip = c.req.query("ip");
  const q = c.req.query("q");
  const since = resolveSince(c.req.query("since"));
  const resolvedParam = c.req.query("resolved");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10) || 0;

  const conds: string[] = [];
  const params: unknown[] = [];
  if (type) { params.push(type); conds.push(`event_type = $${params.length}`); }
  if (severity) { params.push(severity); conds.push(`severity = $${params.length}`); }
  if (ip) { params.push(ip); conds.push(`ip = $${params.length}`); }
  if (since) { params.push(since); conds.push(`occurred_at >= $${params.length}::timestamptz`); }
  if (resolvedParam === "true" || resolvedParam === "false") {
    params.push(resolvedParam === "true");
    conds.push(`resolved = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    conds.push(`(ip ILIKE ${p} OR path ILIKE ${p} OR user_agent ILIKE ${p} OR country ILIKE ${p} OR city ILIKE ${p})`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `SELECT id, occurred_at, event_type, severity, ip, path, method, clerk_id, user_agent,
            country, region, city, colo, asn, details, resolved, resolved_at, resolved_by
     FROM security_events ${where}
     ORDER BY occurred_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return c.json({ events: rows, limit, offset });
});

securityRouter.get("/events/summary", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const since = resolveSince(c.req.query("since")) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // The preceding window of equal length, for delta comparisons.
  const sinceMs = Date.parse(since);
  const windowMs = Math.max(Date.now() - sinceMs, 60_000);
  const prevSince = new Date(sinceMs - windowMs).toISOString();

  const [totalRow, byType, topIpsRaw, last24hRow, prevTotalRow, prevByType] = await Promise.all([
    sql`SELECT COUNT(*)::int AS total FROM security_events WHERE occurred_at >= ${since}::timestamptz`,
    sql`
      SELECT event_type, COUNT(*)::int AS count
      FROM security_events WHERE occurred_at >= ${since}::timestamptz
      GROUP BY event_type ORDER BY count DESC
    `,
    sql`
      SELECT ip, COUNT(*)::int AS count,
             MAX(occurred_at) AS last_seen,
             (ARRAY_AGG(country ORDER BY occurred_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
             (ARRAY_AGG(city ORDER BY occurred_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS city,
             ARRAY_AGG(DISTINCT event_type) AS types,
             COUNT(*) FILTER (WHERE event_type IN ('auth_failure', 'rate_limit_exceeded'))::int AS strike_count
      FROM security_events
      WHERE occurred_at >= ${since}::timestamptz AND ip IS NOT NULL
      GROUP BY ip
      ORDER BY count DESC LIMIT 10
    `,
    sql`
      SELECT COUNT(*)::int AS count FROM security_events
      WHERE occurred_at >= NOW() - INTERVAL '24 hours'
    `,
    sql`
      SELECT COUNT(*)::int AS total FROM security_events
      WHERE occurred_at >= ${prevSince}::timestamptz AND occurred_at < ${since}::timestamptz
    `,
    sql`
      SELECT event_type, COUNT(*)::int AS count
      FROM security_events
      WHERE occurred_at >= ${prevSince}::timestamptz AND occurred_at < ${since}::timestamptz
      GROUP BY event_type
    `,
  ]) as [
    Array<{ total: number }>,
    Array<{ event_type: string; count: number }>,
    Array<{ ip: string; count: number; last_seen: string; country: string | null; city: string | null; types: string[]; strike_count: number }>,
    Array<{ count: number }>,
    Array<{ total: number }>,
    Array<{ event_type: string; count: number }>,
  ];

  const topIps = topIpsRaw.map((r) => ({
    ip: r.ip,
    count: r.count,
    country: r.country,
    city: r.city,
    lastSeen: r.last_seen,
    types: r.types,
    suspectedBruteForce: r.strike_count >= 10,
  }));

  return c.json({
    total: totalRow[0]?.total ?? 0,
    byType,
    topIps,
    last24h: last24hRow[0]?.count ?? 0,
    prevTotal: prevTotalRow[0]?.total ?? 0,
    prevByType,
  });
});

securityRouter.post("/events/:id/resolve", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const { clerkId } = c.get("user");
  const rows = (await sql`
    UPDATE security_events SET resolved = true, resolved_at = NOW(), resolved_by = ${clerkId}
    WHERE id = ${id} RETURNING id
  `) as Array<{ id: string }>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

securityRouter.post(
  "/events/resolve-by-ip",
  ...gate,
  zValidator("json", z.object({ ip: z.string().min(1) })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { ip } = c.req.valid("json");
    const { clerkId } = c.get("user");
    const rows = (await sql`
      UPDATE security_events SET resolved = true, resolved_at = NOW(), resolved_by = ${clerkId}
      WHERE ip = ${ip} AND resolved = false RETURNING id
    `) as Array<{ id: string }>;
    return c.json({ ok: true, count: rows.length });
  },
);

// ── IP blocklist (enforced edge-side by middleware/blocklist.ts) ──────────────
securityRouter.get("/blocklist", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, ip, reason, created_by, created_at, expires_at
    FROM ip_blocklist ORDER BY created_at DESC LIMIT 500
  `;
  return c.json({ blocklist: rows });
});

securityRouter.post(
  "/blocklist",
  ...gate,
  zValidator("json", z.object({
    ip: z.string().min(3).max(64).regex(/^[0-9a-fA-F:.]+$/, "Not a valid IP address"),
    reason: z.string().max(500).optional(),
    expiresAt: z.string().nullable().optional(),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { ip, reason, expiresAt } = c.req.valid("json");
    const { clerkId, email } = c.get("user");
    const rows = (await sql`
      INSERT INTO ip_blocklist (ip, reason, created_by, expires_at)
      VALUES (${ip}, ${reason ?? null}, ${email ?? clerkId}, ${expiresAt ?? null})
      ON CONFLICT (ip) DO UPDATE SET
        reason = EXCLUDED.reason,
        created_by = EXCLUDED.created_by,
        expires_at = EXCLUDED.expires_at
      RETURNING id, ip, reason, created_by, created_at, expires_at
    `) as Array<Record<string, unknown>>;
    return c.json({ ok: true, entry: rows[0] });
  },
);

securityRouter.delete("/blocklist/:id", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`DELETE FROM ip_blocklist WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

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
            triage_state, case_owner, assigned_to, received_at, last_reply_at, auto_reply_sent_at,
            classification_confidence, classification_signals, auto_classified,
            reporter_ip, reporter_user_agent, reporter_geo, reporter_device, telemetry_consent
     FROM security_tickets ${where}
     ORDER BY received_at DESC LIMIT 300`,
    params,
  );
  return c.json({ tickets: rows, classifications: CLASSIFICATIONS, statuses: STATUSES, triageStates: TRIAGE_STATES });
});

securityRouter.get("/tickets/:id", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const t = (await sql`SELECT * FROM security_tickets WHERE id = ${id} LIMIT 1`) as unknown[];
  if (!t[0]) return c.json({ error: "Not found" }, 404);
  const messages = (await sql`SELECT * FROM security_ticket_messages WHERE ticket_id = ${id} ORDER BY created_at ASC`) as unknown[];
  return c.json({ ticket: t[0], messages, classifications: CLASSIFICATIONS, statuses: STATUSES, triageStates: TRIAGE_STATES });
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
          // Template emails carry no local html/text — supply the actual
          // reply body so the Mail tab's Sent folder shows real content.
          text: body,
          variables: {
            security_ticket_number: caseCode, // public Case Code
            generated_at: formatEmailTimestamp(),
            security_classification: newClass,
            case_status: newStatus,
            assigned_to: assignedTo ?? (ticket.assigned_to as string) ?? "Security Operations",
            response_body: body,
          },
        }, sql);
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
    triageState: z.enum(TRIAGE_STATES).optional(),
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
        triage_state = COALESCE(${b.triageState ?? null}, triage_state),
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
