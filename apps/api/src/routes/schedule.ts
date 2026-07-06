import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCleanerByUserId, getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { haversineDistance } from "../lib/haversine";
import { requireAuth } from "../middleware/auth";
import { getMergedSlots, getAvailabilityForDate } from "../lib/availability";
import type { AppBindings } from "../types";

export const scheduleRouter = new Hono<AppBindings>();

scheduleRouter.use("*", requireAuth);

// ---------------------------------------------------------------------------
// Cleaner schedule management.
//
// UNIFIED MODEL (see lib/availability.ts): weekly "recurring" hours live in
// `cleaner_availability` — the same rows the dashboard Availability tab edits
// and the customer booking-slots endpoint reads — so the Schedule page and the
// dashboard always show the same state. One-off "flexible" slots and the
// available_now flag stay in `cleaner_schedule`.
// ---------------------------------------------------------------------------

scheduleRouter.get("/me", async (c) => {
  const { sql, cleanerId } = await currentCleanerId(c);
  if (!cleanerId) return c.json({ slots: [], availableNow: false });
  const all = await getMergedSlots(sql, [cleanerId]);
  const availableNow = all.some((s) => s.slot_type === "available_now");
  return c.json({
    slots: all.filter((s) => s.slot_type !== "available_now"),
    availableNow,
  });
});

scheduleRouter.get("/cleaner/:cleanerId", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = c.req.param("cleanerId");
  const slots = await getMergedSlots(sql, [cleanerId]);
  return c.json({ slots: slots.filter((s) => s.slot_type !== "available_now") });
});

const createSlotSchema = z.object({
  slotType: z.enum(["recurring", "flexible", "available_now"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  specificDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Resolve current cleaner row from the authed user. */
async function currentCleanerId(c: {
  env: { DATABASE_URL: string };
  get: (k: "user") => { clerkId: string };
}) {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return { sql, cleanerId: null as string | null };
  const cleaner = await getCleanerByUserId(sql, user.id);
  return { sql, cleanerId: cleaner?.id ?? null };
}

scheduleRouter.post(
  "/cleaner",
  zValidator("json", createSlotSchema),
  async (c) => {
    const input = c.req.valid("json");
    const { sql, cleanerId } = await currentCleanerId(c);
    if (!cleanerId) return c.json({ error: "Cleaner not found" }, 404);

    if (input.slotType === "available_now") {
      await sql`
        UPDATE cleaner_schedule SET is_active = false
        WHERE cleaner_id = ${cleanerId} AND slot_type = 'available_now'
      `;
      const rows = await sql`
        INSERT INTO cleaner_schedule (cleaner_id, slot_type, is_active)
        VALUES (${cleanerId}, 'available_now', true)
        RETURNING id
      `;
      return c.json({ slots: rows }, 201);
    }

    if (input.slotType === "recurring") {
      // Weekly hours → cleaner_availability (shared with the dashboard tab and
      // the customer slots endpoint). One row per day of week, upserted.
      const days =
        input.daysOfWeek ?? (input.dayOfWeek != null ? [input.dayOfWeek] : []);
      if (days.length === 0 || !input.startTime || !input.endTime) {
        return c.json({ error: "daysOfWeek, startTime and endTime are required" }, 400);
      }
      const created: unknown[] = [];
      for (const day of days) {
        const rows = await sql`
          INSERT INTO cleaner_availability (cleaner_id, day_of_week, start_time, end_time, active)
          VALUES (${cleanerId}, ${day}, ${input.startTime}, ${input.endTime}, true)
          ON CONFLICT (cleaner_id, day_of_week)
          DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                        active = true, updated_at = NOW()
          RETURNING id, day_of_week,
                    start_time::text AS start_time, end_time::text AS end_time
        `;
        if (rows[0]) created.push({ ...rows[0], slot_type: "recurring", specific_date: null });
      }
      return c.json({ slots: created }, 201);
    }

    // Flexible one-off slot for a specific date.
    if (!input.specificDate || !input.startTime || !input.endTime) {
      return c.json({ error: "specificDate, startTime and endTime are required" }, 400);
    }
    const rows = await sql`
      INSERT INTO cleaner_schedule
        (cleaner_id, slot_type, day_of_week, start_time, end_time, specific_date)
      VALUES (
        ${cleanerId}, 'flexible', NULL,
        ${input.startTime}, ${input.endTime}, ${input.specificDate}
      ) RETURNING id, slot_type, day_of_week,
                  start_time::text AS start_time, end_time::text AS end_time,
                  specific_date::text AS specific_date
    `;
    return c.json({ slots: rows }, 201);
  }
);

scheduleRouter.delete("/cleaner/:slotId", async (c) => {
  const { sql, cleanerId } = await currentCleanerId(c);
  if (!cleanerId) return c.json({ error: "Cleaner not found" }, 404);
  const slotId = c.req.param("slotId");
  // The id may belong to either store — try weekly first, then one-offs.
  const weekly = (await sql`
    DELETE FROM cleaner_availability
    WHERE id = ${slotId} AND cleaner_id = ${cleanerId}
    RETURNING id
  `) as { id: string }[];
  if (!weekly[0]) {
    await sql`
      DELETE FROM cleaner_schedule
      WHERE id = ${slotId} AND cleaner_id = ${cleanerId}
    `;
  }
  return c.json({ ok: true });
});

const availableNowSchema = z.object({ available: z.boolean() });

scheduleRouter.post(
  "/available-now",
  zValidator("json", availableNowSchema),
  async (c) => {
    const { sql, cleanerId } = await currentCleanerId(c);
    if (!cleanerId) return c.json({ error: "Cleaner not found" }, 404);
    const { available } = c.req.valid("json");

    await sql`
      DELETE FROM cleaner_schedule
      WHERE cleaner_id = ${cleanerId} AND slot_type = 'available_now'
    `;
    if (available) {
      await sql`
        INSERT INTO cleaner_schedule (cleaner_id, slot_type, is_active)
        VALUES (${cleanerId}, 'available_now', true)
      `;
    }
    return c.json({ available });
  }
);

// ---------------------------------------------------------------------------
// Customer-facing availability (anonymized)
// ---------------------------------------------------------------------------

const WINDOWS: Record<string, { start: number; end: number }> = {
  morning: { start: 8 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 16 * 60 },
  evening: { start: 16 * 60, end: 20 * 60 },
};

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
}

const availabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  serviceType: z.string().optional(),
});

scheduleRouter.get(
  "/availability",
  zValidator("query", availabilityQuery),
  async (c) => {
    const { date, lat, lng } = c.req.valid("query");
    const sql = getDb(c.env.DATABASE_URL);

    // Unified read model: weekly + flexible − blocked dates.
    const rows = await getAvailabilityForDate(sql, date);

    // Optional service-area proximity filter.
    let areaByCleaner: Map<string, Array<{ lat: number; lng: number; radius: number }>> | null = null;
    if (lat != null && lng != null && rows.length > 0) {
      const ids = Array.from(new Set(rows.map((r) => r.cleaner_id)));
      const areas = (await sql`
        SELECT cleaner_id, center_lat, center_lng, radius_miles
        FROM cleaner_service_areas WHERE cleaner_id = ANY(${ids})
      `) as Array<{ cleaner_id: string; center_lat: string | null; center_lng: string | null; radius_miles: number | null }>;
      if (areas.length > 0) {
        areaByCleaner = new Map();
        for (const a of areas) {
          if (a.center_lat == null || a.center_lng == null) continue;
          const list = areaByCleaner.get(a.cleaner_id) ?? [];
          list.push({ lat: Number(a.center_lat), lng: Number(a.center_lng), radius: a.radius_miles ?? 25 });
          areaByCleaner.set(a.cleaner_id, list);
        }
      }
    }

    const windowCounts: Record<string, Set<string>> = {
      morning: new Set(),
      afternoon: new Set(),
      evening: new Set(),
    };

    for (const r of rows) {
      if (areaByCleaner) {
        const areas = areaByCleaner.get(r.cleaner_id);
        // No configured areas → serves everywhere (matches assignment rule).
        if (areas && areas.length > 0) {
          const within = areas.some(
            (a) => haversineDistance(lat as number, lng as number, a.lat, a.lng) <= a.radius,
          );
          if (!within) continue;
        }
      }

      const start = timeToMinutes(r.start_time);
      const end = timeToMinutes(r.end_time);
      if (start == null || end == null) continue;

      for (const [name, w] of Object.entries(WINDOWS)) {
        if (start < w.end && end > w.start) {
          windowCounts[name].add(r.cleaner_id);
        }
      }
    }

    return c.json({
      date,
      windows: {
        morning: { available: windowCounts.morning.size > 0, count: windowCounts.morning.size },
        afternoon: {
          available: windowCounts.afternoon.size > 0,
          count: windowCounts.afternoon.size,
        },
        evening: { available: windowCounts.evening.size > 0, count: windowCounts.evening.size },
      },
    });
  }
);
