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
 * User reports API (Trust & Safety) — the user-facing side of the formal
 * customer↔cleaner reporting system. Mounted at /reports (the public
 * "report a problem" intake at /report is unrelated).
 *
 * Reports are BOOKING-SCOPED: the reporter must be the booking's customer or
 * its assigned cleaner; the reported party is the counterpart on that booking.
 *
 *   POST /reports              submit a report (party + status-window checked)
 *   POST /reports/:id/photos   attach photo evidence (binary body; owner-only)
 *   GET  /reports/mine         my reports (optionally ?bookingId=); status
 *                              only — admin notes are NEVER exposed here
 *   GET  /reports/:id          one of my reports
 *
 * Photos land in the PRIVATE sweepr-report-objects bucket (REPORT_OBJECTS
 * binding). They are never publicly readable; retrieval is admin-only via
 * routes/adminReports.ts.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { getUserByClerkId } from "@sweepr/db";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { sanitizeText } from "../lib/sanitizeText";
import {
  REPORT_CATEGORIES,
  MAX_REPORT_PHOTOS,
  MAX_REPORT_PHOTO_BYTES,
  OPEN_REPORT_STATUSES,
  submitUserReport,
  validateReportPhoto,
  reportReference,
} from "../lib/userReports";
import { sendReportAcknowledgment } from "../lib/userReportNotify";
import type { AppBindings } from "../types";

export const reportsRouter = new Hono<AppBindings>();

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ── Submit ────────────────────────────────────────────────────────────────────

const submitSchema = z.object({
  bookingId: z.string().uuid(),
  category: z.enum(REPORT_CATEGORIES),
  description: z.string().min(10).max(5000),
});

reportsRouter.post("/", requireAuth, zValidator("json", submitSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const user = await getUserByClerkId(sql, clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);

  const result = await submitUserReport(sql, {
    bookingId: input.bookingId,
    callerUserId: user.id,
    category: input.category,
    description: sanitizeText(input.description, 5000),
  });

  if (!result.ok) {
    switch (result.code) {
      case "not_found":
        return c.json({ error: "Booking not found" }, 404);
      case "forbidden":
        return c.json({ error: "Only the customer or the assigned cleaner on this booking can file a report" }, 403);
      case "not_reportable":
        return c.json({ error: "Reports can be filed once a booking is confirmed" }, 400);
      case "duplicate":
        return c.json({ error: "You already have an open report for this booking" }, 409);
    }
  }

  const report = result.report;

  await audit(sql, {
    action: "report.submitted",
    actorClerkId: clerkId,
    targetType: "user_report",
    targetId: report.id,
    metadata: {
      bookingId: input.bookingId,
      category: input.category,
      reporterRole: report.reporterRole,
    },
    timestamp: new Date().toISOString(),
  });

  // Acknowledgment email to the reporter (best-effort, never blocks).
  const nameRows = (await sql`
    SELECT CASE WHEN ${report.reporterRole} = 'customer' THEN cu.first_name ELSE cl.first_name END AS first_name
    FROM users u
    LEFT JOIN customers cu ON cu.user_id = u.id
    LEFT JOIN cleaners cl ON cl.user_id = u.id
    WHERE u.id = ${user.id} LIMIT 1
  `) as Array<{ first_name: string | null }>;
  await sendReportAcknowledgment(sql, c.env, {
    email: user.email ?? null,
    firstName: nameRows[0]?.first_name ?? null,
    reporterRole: report.reporterRole,
    bookingId: input.bookingId,
    reportId: report.id,
  }).catch((err) => logger.error("report acknowledgment failed", err, { reportId: report.id }));

  return c.json({
    id: report.id,
    reference: reportReference(report.id),
    status: report.status,
    createdAt: report.createdAt,
  }, 201);
});

// ── Photo evidence upload (binary body) ──────────────────────────────────────

reportsRouter.post("/:id/photos", requireAuth, async (c) => {
  const reportId = c.req.param("id");
  if (!z.string().uuid().safeParse(reportId).success) {
    return c.json({ error: "Not found" }, 404);
  }
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const user = await getUserByClerkId(sql, clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);

  // Owner + open-window check. 404 (not 403) for reports the caller doesn't
  // own, so report ids can't be probed for existence.
  const rows = (await sql`
    SELECT ur.id, ur.status,
           (SELECT COUNT(*)::int FROM user_report_photos p WHERE p.report_id = ur.id) AS photo_count
    FROM user_reports ur
    WHERE ur.id = ${reportId} AND ur.reporter_user_id = ${user.id}
    LIMIT 1
  `) as Array<{ id: string; status: string; photo_count: number }>;
  const report = rows[0];
  if (!report) return c.json({ error: "Not found" }, 404);
  if (!OPEN_REPORT_STATUSES.includes(report.status as (typeof OPEN_REPORT_STATUSES)[number])) {
    return c.json({ error: "This report is closed and can no longer accept photos" }, 400);
  }

  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();

  // Fail fast on an oversized declared length before buffering the body.
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_REPORT_PHOTO_BYTES) {
    return c.json({ error: "Each photo must be 10MB or smaller" }, 413);
  }

  const body = await c.req.arrayBuffer();
  const check = validateReportPhoto({
    contentType,
    sizeBytes: body.byteLength,
    existingCount: report.photo_count,
  });
  if (!check.ok) return c.json({ error: check.error }, 400);

  const ext = EXT_BY_TYPE[contentType] ?? "jpg";
  const storageKey = `reports/${reportId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await c.env.REPORT_OBJECTS.put(storageKey, body, {
    httpMetadata: { contentType },
  });

  const inserted = (await sql`
    INSERT INTO user_report_photos (report_id, storage_key, content_type, size_bytes)
    VALUES (${reportId}, ${storageKey}, ${contentType}, ${body.byteLength})
    RETURNING id, created_at
  `) as Array<{ id: string; created_at: string }>;

  return c.json({
    id: inserted[0].id,
    photoCount: report.photo_count + 1,
    maxPhotos: MAX_REPORT_PHOTOS,
  }, 201);
});

// ── My reports ────────────────────────────────────────────────────────────────

interface MyReportRow {
  id: string;
  booking_id: string;
  category: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  photo_count: number;
}

function presentMyReport(r: MyReportRow) {
  // Status + own submission only. resolution_note / admin notes never leave
  // the admin surface; the resolution email carries the reporter-safe wording.
  return {
    id: r.id,
    reference: reportReference(r.id),
    bookingId: r.booking_id,
    category: r.category,
    status: r.status,
    description: r.description,
    photoCount: r.photo_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
  };
}

const mineQuerySchema = z.object({ bookingId: z.string().uuid().optional() });

reportsRouter.get("/mine", requireAuth, zValidator("query", mineQuerySchema), async (c) => {
  const { bookingId } = c.req.valid("query");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ reports: [] });

  const rows = (bookingId
    ? await sql`
        SELECT ur.id, ur.booking_id, ur.category, ur.status, ur.description,
               ur.created_at, ur.updated_at, ur.resolved_at,
               (SELECT COUNT(*)::int FROM user_report_photos p WHERE p.report_id = ur.id) AS photo_count
        FROM user_reports ur
        WHERE ur.reporter_user_id = ${user.id} AND ur.booking_id = ${bookingId}
        ORDER BY ur.created_at DESC
      `
    : await sql`
        SELECT ur.id, ur.booking_id, ur.category, ur.status, ur.description,
               ur.created_at, ur.updated_at, ur.resolved_at,
               (SELECT COUNT(*)::int FROM user_report_photos p WHERE p.report_id = ur.id) AS photo_count
        FROM user_reports ur
        WHERE ur.reporter_user_id = ${user.id}
        ORDER BY ur.created_at DESC
        LIMIT 100
      `) as MyReportRow[];

  return c.json({ reports: rows.map(presentMyReport) });
});

reportsRouter.get("/:id", requireAuth, async (c) => {
  const reportId = c.req.param("id");
  if (!z.string().uuid().safeParse(reportId).success) {
    return c.json({ error: "Not found" }, 404);
  }
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Not found" }, 404);

  const rows = (await sql`
    SELECT ur.id, ur.booking_id, ur.category, ur.status, ur.description,
           ur.created_at, ur.updated_at, ur.resolved_at,
           (SELECT COUNT(*)::int FROM user_report_photos p WHERE p.report_id = ur.id) AS photo_count
    FROM user_reports ur
    WHERE ur.id = ${reportId} AND ur.reporter_user_id = ${user.id}
    LIMIT 1
  `) as MyReportRow[];
  if (!rows[0]) return c.json({ error: "Not found" }, 404);

  return c.json({ report: presentMyReport(rows[0]) });
});
