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
 * Admin booking calendar API (calendar_date_rules, migration 106).
 *
 *   GET    /admin/calendar?from=&to=              rules + per-date conflict counts
 *   GET    /admin/calendar/day/:date              day detail: rules + bookings on that LOCAL date
 *   POST   /admin/calendar/rules                  bulk create (range + weekday filter → one row per date)
 *   PATCH  /admin/calendar/rules/:id              edit label/reason/values/active
 *   POST   /admin/calendar/rules/bulk-deactivate  deactivate a selection
 *   POST   /admin/calendar/rules/bulk-delete      delete a selection
 *
 * DISTINCT from /admin/schedule (scheduled_events — comms automations): this
 * calendar governs BOOKING availability and date pricing, not scheduled sends.
 *
 * Conflicts: blocking a date never touches existing bookings — instead every
 * blocked date reports how many live (non-cancelled) bookings' LOCAL calendar
 * dates fall on it (lib/localDate.ts recovers each booking's local date from
 * its arrival window; exact-time legacy bookings fall back to the UTC date),
 * and the day endpoint lists them so an admin can act manually. Area-scoped
 * blocks only count bookings whose address resolves to that area.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import { localBookingDate } from "../lib/localDate";
import {
  loadLiveServiceAreas,
  matchServiceArea,
  type ServiceAreaGeoRow,
} from "../lib/serviceAreaGeo";
import { expandRuleDates, formatRuleDate, type CalendarRuleRow } from "../lib/calendarRules";
import type { AppBindings } from "../types";

export const adminCalendarRouter = new Hono<AppBindings>();
adminCalendarRouter.use("*", requireAuth, requireAdmin);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateStr = z.string().regex(DATE_RE, "Expected YYYY-MM-DD");

/** Statuses that no longer occupy the date (excluded from conflict counts). */
const INACTIVE_BOOKING_STATUSES = ["cancelled_by_customer", "cancelled_by_cleaner", "refunded"];

interface BookingConflictRow {
  id: string;
  status: string;
  scheduled_at: string;
  arrival_window_start: string | null;
  service_type: string;
  total_price: number | null;
  customer_name: string | null;
  lat: string | number | null;
  lng: string | number | null;
}

/** Load live (non-cancelled) bookings whose instants could fall on any local
 *  date in [from, to] — padded a day each side so offset shifts can't miss. */
async function loadBookingsAround(
  sql: ReturnType<typeof getDb>,
  from: string,
  to: string,
): Promise<BookingConflictRow[]> {
  return (await sql`
    SELECT b.id, b.status, b.scheduled_at, b.arrival_window_start, b.service_type,
           b.total_price, a.lat, a.lng,
           TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))) AS customer_name
    FROM bookings b
    LEFT JOIN addresses a ON a.id = b.address_id
    LEFT JOIN customers cu ON cu.id = b.customer_id
    WHERE b.scheduled_at >= (${from}::date - INTERVAL '1 day')
      AND b.scheduled_at < (${to}::date + INTERVAL '2 days')
      AND b.status <> ALL(${INACTIVE_BOOKING_STATUSES})
  `) as BookingConflictRow[];
}

/** The booking's local calendar date (window-derived offset, UTC fallback). */
function bookingLocalDate(b: BookingConflictRow): string {
  return localBookingDate(
    new Date(b.scheduled_at).toISOString(),
    null,
    b.arrival_window_start,
  );
}

/** Does this booking fall under a block rule's scope? Platform-wide blocks
 *  cover every booking; area blocks only bookings resolved to that area. */
function bookingInBlockScope(
  b: BookingConflictRow,
  block: Pick<CalendarRuleRow, "service_area_id">,
  areas: ServiceAreaGeoRow[],
): boolean {
  if (block.service_area_id === null) return true;
  if (b.lat == null || b.lng == null) return false;
  return matchServiceArea(areas, Number(b.lat), Number(b.lng))?.id === block.service_area_id;
}

// ── Range view: rules + conflict counts ──────────────────────────────────────

adminCalendarRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return c.json({ error: "invalid_range", message: "Provide from and to as YYYY-MM-DD." }, 400);
  }

  const rules = (await sql`
    SELECT r.*, sa.name AS service_area_name
    FROM calendar_date_rules r
    LEFT JOIN service_areas sa ON sa.id = r.service_area_id
    WHERE r.rule_date >= ${from} AND r.rule_date <= ${to}
    ORDER BY r.rule_date ASC, r.created_at ASC
  `) as Array<CalendarRuleRow & { service_area_name: string | null }>;

  // Conflict counts, only where a block exists (the only kind with conflicts).
  const activeBlocks = rules.filter((r) => r.kind === "block" && r.active);
  const conflicts: Record<string, number> = {};
  if (activeBlocks.length > 0) {
    const [bookings, areas] = await Promise.all([
      loadBookingsAround(sql, from, to),
      loadLiveServiceAreas(sql),
    ]);
    const blocksByDate = new Map<string, typeof activeBlocks>();
    for (const blk of activeBlocks) {
      const key = formatRuleDate(blk.rule_date);
      blocksByDate.set(key, [...(blocksByDate.get(key) ?? []), blk]);
    }
    for (const b of bookings) {
      const date = bookingLocalDate(b);
      const blocks = blocksByDate.get(date);
      if (!blocks) continue;
      if (blocks.some((blk) => bookingInBlockScope(b, blk, areas))) {
        conflicts[date] = (conflicts[date] ?? 0) + 1;
      }
    }
  }

  return c.json({
    rules: rules.map((r) => ({ ...r, rule_date: formatRuleDate(r.rule_date) })),
    conflicts,
  });
});

// ── Day detail: rules + the bookings on that local date ──────────────────────

adminCalendarRouter.get("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_RE.test(date)) {
    return c.json({ error: "invalid_date", message: "Expected YYYY-MM-DD." }, 400);
  }
  const sql = getDb(c.env.DATABASE_URL);

  const rules = (await sql`
    SELECT r.*, sa.name AS service_area_name
    FROM calendar_date_rules r
    LEFT JOIN service_areas sa ON sa.id = r.service_area_id
    WHERE r.rule_date = ${date}
    ORDER BY r.created_at ASC
  `) as Array<CalendarRuleRow & { service_area_name: string | null }>;

  const [bookings, areas] = await Promise.all([
    loadBookingsAround(sql, date, date),
    loadLiveServiceAreas(sql),
  ]);
  const activeBlocks = rules.filter((r) => r.kind === "block" && r.active);

  const dayBookings = bookings
    .filter((b) => bookingLocalDate(b) === date)
    .map((b) => {
      const area =
        b.lat != null && b.lng != null
          ? matchServiceArea(areas, Number(b.lat), Number(b.lng))
          : null;
      return {
        id: b.id,
        status: b.status,
        scheduledAt: b.scheduled_at,
        arrivalWindowStart: b.arrival_window_start,
        serviceType: b.service_type,
        totalPriceCents: b.total_price,
        customerName: b.customer_name || null,
        serviceAreaName: area?.name ?? null,
        // True when an active block on this date covers this booking — these
        // are the rows the admin needs to act on manually.
        conflictsWithBlock: activeBlocks.some((blk) => bookingInBlockScope(b, blk, areas)),
      };
    })
    .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));

  return c.json({
    date,
    rules: rules.map((r) => ({ ...r, rule_date: formatRuleDate(r.rule_date) })),
    bookings: dayBookings,
  });
});

// ── Bulk create ──────────────────────────────────────────────────────────────

const bulkCreateSchema = z
  .object({
    /** Explicit date selection (the admin grid's multi-select). When present,
     *  startDate/endDate/weekdays are ignored. */
    dates: z.array(dateStr).max(366).optional(),
    startDate: dateStr.optional(),
    /** Inclusive; defaults to startDate (single day). */
    endDate: dateStr.optional(),
    /** 0=Sun..6=Sat; empty/absent = every day in the range. */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    /** null/absent = platform-wide. */
    serviceAreaId: z.string().uuid().nullable().optional(),
    kind: z.enum(["block", "price_adjustment", "coupon"]),
    adjustmentType: z.enum(["percent", "flat"]).optional(),
    /** percent: whole percent (-90..300); flat: integer cents (± $2,000 cap). */
    adjustmentValue: z.number().int().optional(),
    couponKind: z.enum(["percent_off", "amount_off"]).optional(),
    /** percent_off: 1..100; amount_off: cents (≤ $500 cap). */
    couponValue: z.number().int().optional(),
    label: z.string().trim().min(1).max(120),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if ((!v.dates || v.dates.length === 0) && !v.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide either dates[] or a startDate." });
    }
    if (v.kind === "price_adjustment") {
      if (!v.adjustmentType || !v.adjustmentValue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Price adjustments need a type and a non-zero value." });
      } else if (v.adjustmentType === "percent" && (v.adjustmentValue < -90 || v.adjustmentValue > 300)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percent adjustments must be between -90 and 300." });
      } else if (v.adjustmentType === "flat" && Math.abs(v.adjustmentValue) > 200_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Flat adjustments are capped at $2,000." });
      }
    }
    if (v.kind === "coupon") {
      if (!v.couponKind || !v.couponValue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Coupon rules need a coupon kind and value." });
      } else if (v.couponKind === "percent_off" && (v.couponValue < 1 || v.couponValue > 100)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percent-off coupons must be between 1 and 100." });
      } else if (v.couponKind === "amount_off" && (v.couponValue < 1 || v.couponValue > 50_000)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amount-off coupons are capped at $500." });
      }
    }
  });

adminCalendarRouter.post("/rules", zValidator("json", bulkCreateSchema), async (c) => {
  const b = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  // Explicit selection (grid multi-select) wins; otherwise expand the range +
  // weekday filter server-side (one auditable row per date either way).
  const startDate = b.startDate ?? b.dates?.[0] ?? "";
  const endDate = b.endDate ?? startDate;
  const dates =
    b.dates && b.dates.length > 0
      ? Array.from(new Set(b.dates)).sort()
      : expandRuleDates(startDate, endDate, b.weekdays);
  if (dates.length === 0) {
    return c.json({ error: "empty_selection", message: "The range and weekday filter select no dates." }, 400);
  }
  if (dates.length > 366) {
    return c.json({ error: "range_too_large", message: "A single rule set covers at most one year of dates." }, 400);
  }

  const serviceAreaId = b.serviceAreaId ?? null;
  if (serviceAreaId) {
    const area = (await sql`
      SELECT id FROM service_areas WHERE id = ${serviceAreaId} LIMIT 1
    `) as Array<{ id: string }>;
    if (!area[0]) return c.json({ error: "unknown_service_area" }, 400);
  }

  const actorClerkId = c.get("user").clerkId;
  const createdIds: string[] = [];
  let skipped = 0;
  for (const date of dates) {
    // ON CONFLICT against uq_calendar_date_rules_scope: an active rule of this
    // kind already governs (date, scope) — skip rather than stack (stacking
    // semantics documented in migration 106). The zero-uuid fold MUST be a
    // literal (not a bind param) so Postgres can structurally match the
    // partial index expression and infer the arbiter.
    const rows = (await sql`
      INSERT INTO calendar_date_rules (
        rule_date, service_area_id, kind, adjustment_type, adjustment_value,
        coupon_kind, coupon_value, label, reason, created_by
      ) VALUES (
        ${date}, ${serviceAreaId}, ${b.kind},
        ${b.kind === "price_adjustment" ? b.adjustmentType : null},
        ${b.kind === "price_adjustment" ? b.adjustmentValue : null},
        ${b.kind === "coupon" ? b.couponKind : null},
        ${b.kind === "coupon" ? b.couponValue : null},
        ${b.label}, ${b.reason ?? null}, ${actorClerkId}
      )
      ON CONFLICT (rule_date, COALESCE(service_area_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
        WHERE active
      DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;
    if (rows[0]) createdIds.push(rows[0].id);
    else skipped++;
  }

  await audit(sql, {
    action: "admin.action",
    actorClerkId,
    targetType: "calendar_date_rule",
    targetId: createdIds[0] ?? "none",
    metadata: {
      event: "calendar_rules_created",
      kind: b.kind,
      explicitDates: b.dates && b.dates.length > 0 ? b.dates.length : null,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      weekdays: b.weekdays ?? null,
      serviceAreaId,
      label: b.label,
      adjustmentType: b.adjustmentType ?? null,
      adjustmentValue: b.adjustmentValue ?? null,
      couponKind: b.couponKind ?? null,
      couponValue: b.couponValue ?? null,
      created: createdIds.length,
      skipped,
    },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true, created: createdIds.length, skipped, ids: createdIds }, 201);
});

// ── Edit one rule ────────────────────────────────────────────────────────────

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
    active: z.boolean().optional(),
    adjustmentType: z.enum(["percent", "flat"]).optional(),
    adjustmentValue: z.number().int().optional(),
    couponKind: z.enum(["percent_off", "amount_off"]).optional(),
    couponValue: z.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

adminCalendarRouter.patch("/rules/:id", zValidator("json", patchSchema), async (c) => {
  const id = c.req.param("id");
  const b = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  const cur = (await sql`
    SELECT * FROM calendar_date_rules WHERE id = ${id} LIMIT 1
  `) as CalendarRuleRow[];
  if (!cur[0]) return c.json({ error: "not_found" }, 404);

  try {
    const rows = (await sql`
      UPDATE calendar_date_rules SET
        label = ${b.label ?? cur[0].label},
        reason = ${b.reason === undefined ? cur[0].reason : b.reason},
        active = ${b.active ?? cur[0].active},
        adjustment_type = ${cur[0].kind === "price_adjustment" ? (b.adjustmentType ?? cur[0].adjustment_type) : cur[0].adjustment_type},
        adjustment_value = ${cur[0].kind === "price_adjustment" ? (b.adjustmentValue ?? cur[0].adjustment_value) : cur[0].adjustment_value},
        coupon_kind = ${cur[0].kind === "coupon" ? (b.couponKind ?? cur[0].coupon_kind) : cur[0].coupon_kind},
        coupon_value = ${cur[0].kind === "coupon" ? (b.couponValue ?? cur[0].coupon_value) : cur[0].coupon_value},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `) as CalendarRuleRow[];

    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "calendar_date_rule",
      targetId: id,
      metadata: { event: "calendar_rule_updated", changes: b, kind: cur[0].kind, ruleDate: formatRuleDate(cur[0].rule_date) },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ rule: rows[0] });
  } catch (err) {
    // Re-activating can collide with another active rule for the same
    // (date, scope, kind) — surface it as a conflict, not a 500.
    if (/uq_calendar_date_rules_scope/.test((err as Error)?.message ?? "")) {
      return c.json(
        { error: "rule_conflict", message: "Another active rule of this kind already covers that date and scope." },
        409,
      );
    }
    throw err;
  }
});

// ── Bulk deactivate / delete ─────────────────────────────────────────────────

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

adminCalendarRouter.post("/rules/bulk-deactivate", zValidator("json", idsSchema), async (c) => {
  const { ids } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    UPDATE calendar_date_rules SET active = FALSE, updated_at = NOW()
    WHERE id = ANY(${ids}) AND active = TRUE
    RETURNING id
  `) as Array<{ id: string }>;

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "calendar_date_rule",
    targetId: ids[0],
    metadata: { event: "calendar_rules_deactivated", requested: ids.length, deactivated: rows.length },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true, deactivated: rows.length });
});

adminCalendarRouter.post("/rules/bulk-delete", zValidator("json", idsSchema), async (c) => {
  const { ids } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    DELETE FROM calendar_date_rules WHERE id = ANY(${ids}) RETURNING id
  `) as Array<{ id: string }>;

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "calendar_date_rule",
    targetId: ids[0],
    metadata: { event: "calendar_rules_deleted", requested: ids.length, deleted: rows.length },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true, deleted: rows.length });
});
