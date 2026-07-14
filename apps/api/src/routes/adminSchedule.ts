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
 * Admin schedule calendar API.
 *
 *   GET    /admin/schedule?from=&to=      events in a range
 *   GET    /admin/schedule/actions        automation catalog for the UI
 *   POST   /admin/schedule                create event (note or automation)
 *   PATCH  /admin/schedule/:id            edit / cancel / un-cancel
 *   DELETE /admin/schedule/:id            delete
 *   POST   /admin/schedule/:id/run-now    execute an automation immediately
 *   POST   /admin/schedule/import-ics     import events from an ICS feed URL (SSRF-safe)
 *   GET    /admin/schedule/export.ics     download the schedule as an ICS file
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import {
  SCHEDULED_ACTION_CATALOG,
  executeScheduledAction,
  type ScheduledEventRow,
} from "../lib/scheduledActions";
import { fetchCalendar, parseIcs, CalendarValidationError } from "../lib/calendarSecurity";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const adminScheduleRouter = new Hono<AppBindings>();
adminScheduleRouter.use("*", requireAuth, requireAdmin);

const ACTION_TYPES = SCHEDULED_ACTION_CATALOG.map((a) => a.type) as [string, ...string[]];

const eventSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().optional(),
  kind: z.enum(["note", "automation"]).default("note"),
  actionType: z.enum(ACTION_TYPES).nullable().optional(),
  actionPayload: z.record(z.unknown()).optional(),
});

adminScheduleRouter.get("/actions", (c) => c.json({ actions: SCHEDULED_ACTION_CATALOG }));

adminScheduleRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const from = c.req.query("from") ?? new Date(Date.now() - 45 * 86400_000).toISOString();
  const to = c.req.query("to") ?? new Date(Date.now() + 120 * 86400_000).toISOString();
  const rows = await sql`
    SELECT id, title, description, starts_at, ends_at, all_day, kind,
           action_type, action_payload, status, executed_at, result_note, created_at
    FROM scheduled_events
    WHERE starts_at >= ${from} AND starts_at <= ${to}
    ORDER BY starts_at ASC
    LIMIT 1000
  `;
  return c.json({ events: rows });
});

adminScheduleRouter.post("/", zValidator("json", eventSchema), async (c) => {
  const b = c.req.valid("json");
  if (b.kind === "automation" && !b.actionType) {
    return c.json({ error: "actionType is required for automations" }, 400);
  }
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    INSERT INTO scheduled_events
      (title, description, starts_at, ends_at, all_day, kind, action_type, action_payload, created_by)
    VALUES
      (${b.title}, ${b.description ?? null}, ${b.startsAt}, ${b.endsAt ?? null},
       ${b.allDay ?? false}, ${b.kind}, ${b.kind === "automation" ? b.actionType : null},
       ${JSON.stringify(b.actionPayload ?? {})}::jsonb, ${c.get("user").clerkId})
    RETURNING id
  `) as Array<{ id: string }>;
  return c.json({ id: rows[0].id }, 201);
});

const patchSchema = eventSchema.partial().extend({
  status: z.enum(["scheduled", "canceled"]).optional(),
});

adminScheduleRouter.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const id = c.req.param("id");
  const b = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    UPDATE scheduled_events SET
      title          = COALESCE(${b.title ?? null}, title),
      description    = COALESCE(${b.description ?? null}, description),
      starts_at      = COALESCE(${b.startsAt ?? null}, starts_at),
      ends_at        = COALESCE(${b.endsAt ?? null}, ends_at),
      all_day        = COALESCE(${b.allDay ?? null}, all_day),
      action_type    = COALESCE(${b.actionType ?? null}, action_type),
      action_payload = COALESCE(${b.actionPayload ? JSON.stringify(b.actionPayload) : null}::jsonb, action_payload),
      status         = COALESCE(${b.status ?? null}, status),
      updated_at     = NOW()
    WHERE id = ${id} AND status IN ('scheduled', 'canceled')
    RETURNING id
  `) as Array<{ id: string }>;
  if (rows.length === 0) return c.json({ error: "Not found or already executed" }, 404);
  return c.json({ ok: true });
});

adminScheduleRouter.delete("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  await sql`DELETE FROM scheduled_events WHERE id = ${c.req.param("id")}`;
  return c.json({ ok: true });
});

adminScheduleRouter.post("/:id/run-now", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  // Claim exactly like the cron so double-clicks / cron races can't dual-fire.
  const claimed = (await sql`
    UPDATE scheduled_events SET status = 'executed', executed_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND kind = 'automation' AND status = 'scheduled'
    RETURNING id, title, action_type, action_payload, starts_at
  `) as unknown as ScheduledEventRow[];
  if (claimed.length === 0) return c.json({ error: "Not found, not an automation, or already run" }, 404);

  try {
    const note = await executeScheduledAction(sql, c.env, claimed[0]);
    await sql`UPDATE scheduled_events SET result_note = ${note} WHERE id = ${id}`;
    return c.json({ ok: true, result: note });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`UPDATE scheduled_events SET status = 'failed', result_note = ${msg.slice(0, 500)} WHERE id = ${id}`;
    logger.error("schedule.run_now_failed", err, { id });
    return c.json({ error: msg }, 502);
  }
});

// ── ICS ───────────────────────────────────────────────────────────────────────

adminScheduleRouter.post(
  "/import-ics",
  zValidator("json", z.object({ url: z.string().url() })),
  async (c) => {
    const { url } = c.req.valid("json");
    try {
      // fetchCalendar is the SSRF-hardened fetcher (public-IP + content checks).
      const result = await fetchCalendar(url);
      const events = parseIcs(result.body) ?? [];
      const sql = getDb(c.env.DATABASE_URL);
      let imported = 0;
      for (const ev of events.slice(0, 200)) {
        if (!ev.start) continue;
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(ev.start);
        await sql`
          INSERT INTO scheduled_events (title, description, starts_at, ends_at, all_day, kind, created_by)
          VALUES (${ev.summary ?? "(imported event)"},
                  ${ev.externalUid ? `Imported from ICS (UID ${ev.externalUid})` : "Imported from ICS"},
                  ${dateOnly ? `${ev.start}T00:00:00Z` : ev.start},
                  ${ev.end ? (/^\d{4}-\d{2}-\d{2}$/.test(ev.end) ? `${ev.end}T00:00:00Z` : ev.end) : null},
                  ${dateOnly}, 'note', ${c.get("user").clerkId})
        `;
        imported++;
      }
      return c.json({ ok: true, imported, found: events.length });
    } catch (err) {
      if (err instanceof CalendarValidationError) return c.json({ error: err.message }, 400);
      logger.error("schedule.import_ics_failed", err, { url });
      return c.json({ error: "Could not fetch or parse that calendar" }, 502);
    }
  },
);

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

adminScheduleRouter.get("/export.ics", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, title, description, starts_at, ends_at, all_day, kind, action_type, status
    FROM scheduled_events
    WHERE status != 'canceled'
    ORDER BY starts_at ASC
    LIMIT 2000
  `) as Array<{
    id: string; title: string; description: string | null; starts_at: string;
    ends_at: string | null; all_day: boolean; kind: string; action_type: string | null; status: string;
  }>;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sweepr//Admin Schedule//EN",
    "X-WR-CALNAME:Sweepr Admin Schedule",
  ];
  for (const r of rows) {
    const desc = [r.description, r.kind === "automation" ? `[automation: ${r.action_type}, ${r.status}]` : null]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@getsweepr.com`,
      `DTSTAMP:${icsStamp(new Date().toISOString())}`,
      r.all_day
        ? `DTSTART;VALUE=DATE:${r.starts_at.slice(0, 10).replace(/-/g, "")}`
        : `DTSTART:${icsStamp(r.starts_at)}`,
      ...(r.ends_at ? [r.all_day ? `DTEND;VALUE=DATE:${r.ends_at.slice(0, 10).replace(/-/g, "")}` : `DTEND:${icsStamp(r.ends_at)}`] : []),
      `SUMMARY:${icsEscape(r.title)}`,
      ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sweepr-schedule.ics"',
    },
  });
});
