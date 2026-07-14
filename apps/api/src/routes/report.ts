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
 * Public "Report a problem" intake (IT + Security).
 *
 *   POST /report   { kind: "it"|"security", category (canonical label),
 *                    title, description?, app?, email?, context? }
 *
 * Optional auth: if a valid Bearer token is present, the submitter's Clerk id
 * and email are recorded. If not logged in, an email address is required.
 * IT → it_tickets (IT_ Case Code). Security → security_tickets (SR_ Case Code)
 * + auto-reply.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { verifyToken } from "@clerk/backend";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { sendEmail, SENDERS, TEMPLATES, formatEmailTimestamp } from "../lib/mailer";
import { generateTicketId } from "../lib/ticketId";
import { itTypeFromLabel, securityTypeFromLabel } from "../lib/issueTypes";
import { sanitizeText } from "../lib/sanitizeText";
import { resolveReporterTelemetry } from "./itTickets";
import { alertAdminsFromContext } from "../lib/adminAlerts";
import type { AppBindings } from "../types";

export const reportRouter = new Hono<AppBindings>();

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

const schema = z.object({
  kind: z.enum(["it", "security"]),
  category: z.string().min(1),       // canonical issue-type label
  title: z.string().min(3).max(200),
  description: z.string().max(8000).optional(),
  app: z.string().max(40).optional(),
  email: z.string().email().optional(),
  context: z.record(z.unknown()).optional(),
  device: deviceSchema,
});

/** Best-effort: resolve the submitter from a Bearer token if present. */
async function resolveSubmitter(c: { req: { header: (k: string) => string | undefined }; env: AppBindings["Bindings"] }) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = await verifyToken(header.slice(7), { secretKey: c.env.CLERK_SECRET_KEY });
    return { clerkId: payload.sub as string, email: (payload as { email?: string }).email };
  } catch {
    return null;
  }
}

/**
 * Priority support: an active Founding Member's report enters the queue at
 * elevated priority. Recognition perk only — it bumps queue position, it does
 * not assign a dedicated rep. Best-effort; falls back to normal on any error.
 */
async function isFoundingMemberByClerkId(
  sql: ReturnType<typeof getDb>,
  clerkId: string,
): Promise<boolean> {
  try {
    const rows = (await sql`
      SELECT 1
      FROM users u
      WHERE u.clerk_id = ${clerkId}
        AND (
          EXISTS (SELECT 1 FROM cleaners  cl WHERE cl.user_id = u.id AND cl.founding_member = TRUE AND cl.founding_member_revoked = FALSE)
          OR EXISTS (SELECT 1 FROM customers cu WHERE cu.user_id = u.id AND cu.founding_member = TRUE AND cu.founding_member_revoked = FALSE)
        )
      LIMIT 1
    `) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

reportRouter.post("/", zValidator("json", schema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const submitter = await resolveSubmitter(c);
  const email = submitter?.email ?? body.email;

  if (!email) {
    return c.json({ error: "An email address is required so we can follow up." }, 400);
  }

  const title = sanitizeText(body.title, 200);
  const description = body.description ? sanitizeText(body.description, 8000) : undefined;

  const telemetry = await resolveReporterTelemetry(sql, c, submitter?.clerkId ?? null, body.device);

  if (body.kind === "security") {
    const sec = securityTypeFromLabel(body.category);
    const receivedAt = new Date();
    const gen = generateTicketId("SR", sec.code, receivedAt);
    const rows = (await sql`
      INSERT INTO security_tickets (
        sender_email, classification, subject, source, reporter_clerk_id, received_at,
        ticket_number, ticket_id, case_code, ticket_prefix, encoded_date, encoded_time, issue_type, hex_suffix,
        reporter_ip, reporter_user_agent, reporter_geo, reporter_device, telemetry_consent
      ) VALUES (
        ${email}, ${body.category}, ${title}, 'in_app_report', ${submitter?.clerkId ?? null}, ${receivedAt.toISOString()},
        ${gen.ticketId}, ${gen.ticketId}, ${gen.caseCode}, 'SR', ${gen.encodedDate}, ${gen.encodedTime}, ${gen.issueType}, ${gen.hex},
        ${telemetry.ip}, ${telemetry.userAgent}, ${telemetry.geo ? JSON.stringify(telemetry.geo) : null},
        ${telemetry.device ? JSON.stringify(telemetry.device) : null}, ${telemetry.consent}
      ) RETURNING id
    `) as Array<{ id: string }>;
    await sql`
      INSERT INTO security_ticket_messages (ticket_id, direction, from_email, to_email, subject, body)
      VALUES (${rows[0].id}, 'inbound', ${email}, 'security@getsweepr.com', ${title}, ${description ?? ""})
    `;
    alertAdminsFromContext(c, {
      category: "security",
      title: `New security ticket ${gen.caseCode}`,
      body: `${body.category}, ${title}\nFrom: ${email}`,
      linkPath: "/security",
      dedupeKey: gen.ticketId,
    });
    if (c.env.MAILERSEND_API_KEY) {
      try {
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: email,
          subject: `Sweepr Security, Report Received (${gen.caseCode})`,
          from: SENDERS.SECURITY,
          replyTo: SENDERS.SECURITY,
          templateId: TEMPLATES.SECURITY_AUTOREPLY,
          variables: {
            security_ticket_number: gen.caseCode,
            received_at: formatEmailTimestamp(receivedAt),
            security_classification: body.category,
          },
        });
        await sql`UPDATE security_tickets SET auto_reply_sent_at = NOW() WHERE id = ${rows[0].id}`;
      } catch (err) {
        logger.error("report.security autoreply failed", err, { caseCode: gen.caseCode });
      }
    }
    return c.json({ ok: true, case_code: gen.caseCode, ticket_id: gen.ticketId, kind: "security" });
  }

  // IT report.
  const it = itTypeFromLabel(body.category);
  const gen = generateTicketId("IT", it.code);
  // Founding Members get priority support: their tickets enter the queue at
  // 'high' rather than 'normal' (queue position only — no dedicated rep).
  const priority = submitter?.clerkId && (await isFoundingMemberByClerkId(sql, submitter.clerkId))
    ? "high"
    : "normal";
  await sql`
    INSERT INTO it_tickets (
      title, description, category, priority, source, app, reporter_clerk_id, reporter_email, context,
      ticket_id, case_code, ticket_prefix, encoded_date, encoded_time, issue_type, hex_suffix,
      reporter_ip, reporter_user_agent, reporter_geo, reporter_device, telemetry_consent
    ) VALUES (
      ${title}, ${description ?? null}, ${it.dbCategory}, ${priority}, 'user_report', ${body.app ?? null},
      ${submitter?.clerkId ?? null}, ${email}, ${JSON.stringify({ ...(body.context ?? {}), classification: body.category })},
      ${gen.ticketId}, ${gen.caseCode}, 'IT', ${gen.encodedDate}, ${gen.encodedTime}, ${gen.issueType}, ${gen.hex},
      ${telemetry.ip}, ${telemetry.userAgent}, ${telemetry.geo ? JSON.stringify(telemetry.geo) : null},
      ${telemetry.device ? JSON.stringify(telemetry.device) : null}, ${telemetry.consent}
    )
  `;
  alertAdminsFromContext(c, {
    category: "it",
    title: `New IT ticket ${gen.caseCode}`,
    body: `${body.category}, ${title}\nFrom: ${email}`,
    linkPath: "/it-portal",
    dedupeKey: gen.ticketId,
  });
  if (c.env.MAILERSEND_API_KEY) {
    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: email,
        subject: `Sweepr IT, Request Received (${gen.caseCode})`,
        from: SENDERS.IT,
        replyTo: SENDERS.IT,
        templateId: TEMPLATES.IT_AUTOREPLY,
        variables: {
          case_code: gen.caseCode,
          ticket_id: gen.ticketId,
          received_at: formatEmailTimestamp(),
          it_classification: body.category,
        },
      });
    } catch (err) {
      logger.error("report.it autoreply failed", err, { caseCode: gen.caseCode });
    }
  }
  return c.json({ ok: true, case_code: gen.caseCode, ticket_id: gen.ticketId, kind: "it" });
});

/** Expose the canonical issue-type lists for the report form. */
reportRouter.get("/issue-types", async (c) => {
  const { IT_ISSUE_TYPES, SECURITY_ISSUE_TYPES } = await import("../lib/issueTypes");
  return c.json({
    it: IT_ISSUE_TYPES.map((t) => t.label),
    security: SECURITY_ISSUE_TYPES.map((t) => t.label),
  });
});
