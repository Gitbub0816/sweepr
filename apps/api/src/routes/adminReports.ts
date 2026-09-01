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
 * Admin user-reports API (Trust & Safety) — investigation console over the
 * formal customer↔cleaner reporting system. Mounted at /admin/reports.
 *
 *   GET  /admin/reports                     queue (filters: status/category/role)
 *   GET  /admin/reports/:id                 full detail (booking, parties,
 *                                           photos, investigation notes)
 *   GET  /admin/reports/:id/photos/:photoId stream evidence from the PRIVATE
 *                                           sweepr-report-objects bucket
 *   POST /admin/reports/:id/status          start review / reopen (lifecycle-checked)
 *   POST /admin/reports/:id/notes           add an investigation note
 *   POST /admin/reports/:id/resolve         close (requires resolution_action + note)
 *
 * Every mutation is audited (lib/audit.ts) and recorded as a system note so
 * the investigation timeline is complete. Screen slug: `reports`.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { sanitizeText } from "../lib/sanitizeText";
import {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  RESOLUTION_ACTIONS,
  applyReportTransition,
  reportReference,
} from "../lib/userReports";
import { sendReportResolutionNotice } from "../lib/userReportNotify";
import type { AppBindings } from "../types";

export const adminReportsRouter = new Hono<AppBindings>();

adminReportsRouter.use("*", requireAuth, requireAdmin);

// ── Queue ─────────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  category: z.enum(REPORT_CATEGORIES).optional(),
  role: z.enum(["customer", "cleaner"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

interface ListRow {
  id: string;
  booking_id: string;
  reporter_role: "customer" | "cleaner";
  category: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
  booking_status: string;
  scheduled_at: string | null;
  photo_count: number;
  rep_cust_name: string | null;
  rep_clean_name: string | null;
  tgt_cust_name: string | null;
  tgt_clean_name: string | null;
}

function partyNames(r: ListRow): { reporterName: string | null; reportedName: string | null } {
  // The reporter's display name comes from their role's profile table; the
  // reported party is the counterpart role on the same booking.
  return r.reporter_role === "customer"
    ? { reporterName: r.rep_cust_name, reportedName: r.tgt_clean_name }
    : { reporterName: r.rep_clean_name, reportedName: r.tgt_cust_name };
}

adminReportsRouter.get("/", zValidator("query", listQuerySchema), async (c) => {
  const q = c.req.valid("query");
  const sql = getDb(c.env.DATABASE_URL);
  const limit = q.limit ?? 100;

  const rows = (await sql`
    SELECT ur.id, ur.booking_id, ur.reporter_role, ur.category, ur.status,
           ur.created_at, ur.resolved_at, ur.resolution_action,
           b.status AS booking_status, b.scheduled_at,
           (SELECT COUNT(*)::int FROM user_report_photos p WHERE p.report_id = ur.id) AS photo_count,
           NULLIF(TRIM(CONCAT(rep_c.first_name, ' ', rep_c.last_name)), '') AS rep_cust_name,
           NULLIF(TRIM(CONCAT(rep_l.first_name, ' ', rep_l.last_name)), '') AS rep_clean_name,
           NULLIF(TRIM(CONCAT(tgt_c.first_name, ' ', tgt_c.last_name)), '') AS tgt_cust_name,
           NULLIF(TRIM(CONCAT(tgt_l.first_name, ' ', tgt_l.last_name)), '') AS tgt_clean_name
    FROM user_reports ur
    JOIN bookings b ON b.id = ur.booking_id
    LEFT JOIN customers rep_c ON rep_c.user_id = ur.reporter_user_id
    LEFT JOIN cleaners  rep_l ON rep_l.user_id = ur.reporter_user_id
    LEFT JOIN customers tgt_c ON tgt_c.user_id = ur.reported_user_id
    LEFT JOIN cleaners  tgt_l ON tgt_l.user_id = ur.reported_user_id
    WHERE (${q.status ?? null}::text IS NULL OR ur.status = ${q.status ?? null})
      AND (${q.category ?? null}::text IS NULL OR ur.category = ${q.category ?? null})
      AND (${q.role ?? null}::text IS NULL OR ur.reporter_role = ${q.role ?? null})
    ORDER BY ur.created_at DESC
    LIMIT ${limit}
  `) as ListRow[];

  return c.json({
    reports: rows.map((r) => {
      const names = partyNames(r);
      return {
        id: r.id,
        reference: reportReference(r.id),
        bookingId: r.booking_id,
        reporterRole: r.reporter_role,
        category: r.category,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        resolutionAction: r.resolution_action,
        bookingStatus: r.booking_status,
        scheduledAt: r.scheduled_at,
        photoCount: r.photo_count,
        reporterName: names.reporterName,
        reportedName: names.reportedName,
      };
    }),
  });
});

// ── Detail ────────────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.string().uuid() });

adminReportsRouter.get("/:id", zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = (await sql`
    SELECT ur.id, ur.booking_id, ur.reporter_role, ur.category, ur.status,
           ur.description, ur.resolution_action, ur.resolution_note,
           ur.resolved_by, ur.resolved_at, ur.created_at, ur.updated_at,
           ur.reporter_user_id, ur.reported_user_id,
           b.status AS booking_status, b.scheduled_at, b.service_type, b.total_price,
           a.street AS addr_street, a.city AS addr_city, a.state AS addr_state, a.zip AS addr_zip,
           rep_u.email AS reporter_email, tgt_u.email AS reported_email,
           NULLIF(TRIM(CONCAT(rep_c.first_name, ' ', rep_c.last_name)), '') AS rep_cust_name,
           NULLIF(TRIM(CONCAT(rep_l.first_name, ' ', rep_l.last_name)), '') AS rep_clean_name,
           NULLIF(TRIM(CONCAT(tgt_c.first_name, ' ', tgt_c.last_name)), '') AS tgt_cust_name,
           NULLIF(TRIM(CONCAT(tgt_l.first_name, ' ', tgt_l.last_name)), '') AS tgt_clean_name
    FROM user_reports ur
    JOIN bookings b ON b.id = ur.booking_id
    LEFT JOIN addresses a ON a.id = b.address_id
    JOIN users rep_u ON rep_u.id = ur.reporter_user_id
    JOIN users tgt_u ON tgt_u.id = ur.reported_user_id
    LEFT JOIN customers rep_c ON rep_c.user_id = ur.reporter_user_id
    LEFT JOIN cleaners  rep_l ON rep_l.user_id = ur.reporter_user_id
    LEFT JOIN customers tgt_c ON tgt_c.user_id = ur.reported_user_id
    LEFT JOIN cleaners  tgt_l ON tgt_l.user_id = ur.reported_user_id
    WHERE ur.id = ${id}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return c.json({ error: "Not found" }, 404);

  const reporterRole = r.reporter_role as "customer" | "cleaner";
  const reporterName = (reporterRole === "customer" ? r.rep_cust_name : r.rep_clean_name) as string | null;
  const reportedName = (reporterRole === "customer" ? r.tgt_clean_name : r.tgt_cust_name) as string | null;

  const photos = (await sql`
    SELECT id, content_type, size_bytes, created_at
    FROM user_report_photos WHERE report_id = ${id} ORDER BY created_at ASC
  `) as Array<{ id: string; content_type: string; size_bytes: number; created_at: string }>;

  const notes = (await sql`
    SELECT n.id, n.admin_clerk_id, n.note, n.created_at, u.email AS admin_email
    FROM user_report_notes n
    LEFT JOIN users u ON u.clerk_id = n.admin_clerk_id
    WHERE n.report_id = ${id}
    ORDER BY n.created_at ASC
  `) as Array<{ id: string; admin_clerk_id: string; note: string; created_at: string; admin_email: string | null }>;

  return c.json({
    report: {
      id: r.id,
      reference: reportReference(r.id as string),
      bookingId: r.booking_id,
      reporterRole,
      category: r.category,
      status: r.status,
      description: r.description,
      resolutionAction: r.resolution_action,
      resolutionNote: r.resolution_note,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      reporter: { userId: r.reporter_user_id, name: reporterName, email: r.reporter_email },
      reported: { userId: r.reported_user_id, name: reportedName, email: r.reported_email },
      booking: {
        id: r.booking_id,
        status: r.booking_status,
        scheduledAt: r.scheduled_at,
        serviceType: r.service_type,
        totalPrice: r.total_price,
        address: [r.addr_street, r.addr_city, r.addr_state, r.addr_zip].filter(Boolean).join(", ") || null,
      },
      photos: photos.map((p) => ({
        id: p.id,
        contentType: p.content_type,
        sizeBytes: p.size_bytes,
        createdAt: p.created_at,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        author: n.admin_email ?? n.admin_clerk_id,
        note: n.note,
        createdAt: n.created_at,
      })),
    },
  });
});

// ── Evidence streaming (private bucket; admin eyes only) ─────────────────────

const photoParam = z.object({ id: z.string().uuid(), photoId: z.string().uuid() });

adminReportsRouter.get("/:id/photos/:photoId", zValidator("param", photoParam), async (c) => {
  const { id, photoId } = c.req.valid("param");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = (await sql`
    SELECT storage_key, content_type FROM user_report_photos
    WHERE id = ${photoId} AND report_id = ${id} LIMIT 1
  `) as Array<{ storage_key: string; content_type: string }>;
  const photo = rows[0];
  if (!photo) return c.json({ error: "Not found" }, 404);

  const obj = await c.env.REPORT_OBJECTS.get(photo.storage_key);
  if (!obj) return c.json({ error: "Not found" }, 404);

  return c.body(obj.body, 200, {
    "Content-Type": photo.content_type,
    // Private evidence: cache only in the admin's browser, briefly.
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": "inline",
  });
});

// ── Shared helpers ────────────────────────────────────────────────────────────

async function addSystemNote(
  sql: ReturnType<typeof getDb>,
  reportId: string,
  actorClerkId: string,
  note: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO user_report_notes (report_id, admin_clerk_id, note)
      VALUES (${reportId}, ${actorClerkId}, ${note})
    `;
  } catch (err) {
    logger.error("user report system note failed", err, { reportId });
  }
}

// ── Status transition (start review / reopen) ────────────────────────────────

const statusSchema = z.object({
  // Terminal statuses (action_taken/dismissed) must go through /resolve so a
  // resolution action + note are always captured.
  status: z.literal("under_review"),
});

adminReportsRouter.post("/:id/status", zValidator("param", idParam), zValidator("json", statusSchema), async (c) => {
  const { id } = c.req.valid("param");
  const { status } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const result = await applyReportTransition(sql, { reportId: id, toStatus: status });
  if (!result.ok) {
    if (result.code === "not_found") return c.json({ error: "Not found" }, 404);
    if (result.code === "conflict") return c.json({ error: "The report changed underneath you. Reload and try again." }, 409);
    return c.json({ error: result.error ?? "Invalid transition" }, 400);
  }

  await addSystemNote(sql, id, clerkId, `Status changed from ${result.fromStatus} to ${status}.`);
  await audit(sql, {
    action: "report.status_changed",
    actorClerkId: clerkId,
    targetType: "user_report",
    targetId: id,
    metadata: { from: result.fromStatus, to: status },
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true, status });
});

// ── Investigation notes ───────────────────────────────────────────────────────

const noteSchema = z.object({ note: z.string().min(1).max(4000) });

adminReportsRouter.post("/:id/notes", zValidator("param", idParam), zValidator("json", noteSchema), async (c) => {
  const { id } = c.req.valid("param");
  const { note } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const exists = (await sql`
    SELECT id FROM user_reports WHERE id = ${id} LIMIT 1
  `) as Array<{ id: string }>;
  if (!exists[0]) return c.json({ error: "Not found" }, 404);

  const clean = sanitizeText(note, 4000);
  if (!clean) return c.json({ error: "Note cannot be empty" }, 400);

  const inserted = (await sql`
    INSERT INTO user_report_notes (report_id, admin_clerk_id, note)
    VALUES (${id}, ${clerkId}, ${clean})
    RETURNING id, created_at
  `) as Array<{ id: string; created_at: string }>;

  await audit(sql, {
    action: "report.note_added",
    actorClerkId: clerkId,
    targetType: "user_report",
    targetId: id,
    metadata: { noteId: inserted[0].id },
    timestamp: new Date().toISOString(),
  });

  return c.json({ id: inserted[0].id, createdAt: inserted[0].created_at }, 201);
});

// ── Resolve ───────────────────────────────────────────────────────────────────

const resolveSchema = z.object({
  outcome: z.enum(["action_taken", "dismissed"]),
  resolutionAction: z.enum(RESOLUTION_ACTIONS),
  resolutionNote: z.string().min(5).max(4000),
});

adminReportsRouter.post("/:id/resolve", zValidator("param", idParam), zValidator("json", resolveSchema), async (c) => {
  const { id } = c.req.valid("param");
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const result = await applyReportTransition(sql, {
    reportId: id,
    toStatus: input.outcome,
    resolutionAction: input.resolutionAction,
    resolutionNote: sanitizeText(input.resolutionNote, 4000),
    resolvedByClerkId: clerkId,
  });
  if (!result.ok) {
    if (result.code === "not_found") return c.json({ error: "Not found" }, 404);
    if (result.code === "conflict") return c.json({ error: "The report changed underneath you. Reload and try again." }, 409);
    return c.json({ error: result.error ?? "Invalid transition" }, 400);
  }

  await addSystemNote(
    sql, id, clerkId,
    `Resolved as ${input.outcome.replace(/_/g, " ")} (${input.resolutionAction.replace(/_/g, " ")}).`,
  );
  await audit(sql, {
    action: "report.resolved",
    actorClerkId: clerkId,
    targetType: "user_report",
    targetId: id,
    metadata: {
      from: result.fromStatus,
      outcome: input.outcome,
      resolutionAction: input.resolutionAction,
    },
    timestamp: new Date().toISOString(),
  });

  // Resolution notice to the reporter (best-effort). The reported party is
  // deliberately NOT emailed.
  const infoRows = (await sql`
    SELECT ur.booking_id, ur.reporter_role, u.email,
           CASE WHEN ur.reporter_role = 'customer' THEN cu.first_name ELSE cl.first_name END AS first_name
    FROM user_reports ur
    JOIN users u ON u.id = ur.reporter_user_id
    LEFT JOIN customers cu ON cu.user_id = ur.reporter_user_id
    LEFT JOIN cleaners cl ON cl.user_id = ur.reporter_user_id
    WHERE ur.id = ${id} LIMIT 1
  `) as Array<{ booking_id: string; reporter_role: "customer" | "cleaner"; email: string | null; first_name: string | null }>;
  const info = infoRows[0];
  if (info) {
    await sendReportResolutionNotice(sql, c.env, {
      email: info.email,
      firstName: info.first_name,
      reporterRole: info.reporter_role,
      bookingId: info.booking_id,
      reportId: id,
      outcome: input.outcome,
    }).catch((err) => logger.error("report resolution notice failed", err, { reportId: id }));
  }

  return c.json({ ok: true, status: input.outcome });
});
