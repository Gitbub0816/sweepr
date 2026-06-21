import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCleanerByUserId, getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { haversineDistance } from "../lib/haversine";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const scheduleRouter = new Hono<AppBindings>();

scheduleRouter.use("*", requireAuth);

// ---------------------------------------------------------------------------
// Cleaner schedule management
// ---------------------------------------------------------------------------

scheduleRouter.get("/cleaner/:cleanerId", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = c.req.param("cleanerId");
  const rows = await sql`
    SELECT id, cleaner_id, slot_type, day_of_week,
           start_time::text AS start_time, end_time::text AS end_time,
           specific_date::text AS specific_date, is_active
    FROM cleaner_schedule
    WHERE cleaner_id = ${cleanerId} AND is_active = true
    ORDER BY day_of_week NULLS LAST, start_time
  `;
  return c.json({ slots: rows });
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
      // Toggle an immediate availability slot on.
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

    const days =
      input.slotType === "recurring"
        ? input.daysOfWeek ??
          (input.dayOfWeek != null ? [input.dayOfWeek] : [])
        : [null];

    const created: unknown[] = [];
    for (const day of days) {
      const rows = await sql`
        INSERT INTO cleaner_schedule
          (cleaner_id, slot_type, day_of_week, start_time, end_time, specific_date)
        VALUES (
          ${cleanerId}, ${input.slotType}, ${day},
          ${input.startTime ?? null}, ${input.endTime ?? null},
          ${input.specificDate ?? null}
        ) RETURNING id, slot_type, day_of_week,
                    start_time::text AS start_time, end_time::text AS end_time,
                    specific_date::text AS specific_date
      `;
      if (rows[0]) created.push(rows[0]);
    }
    return c.json({ slots: created }, 201);
  }
);

scheduleRouter.delete("/cleaner/:slotId", async (c) => {
  const { sql, cleanerId } = await currentCleanerId(c);
  if (!cleanerId) return c.json({ error: "Cleaner not found" }, 404);
  await sql`
    DELETE FROM cleaner_schedule
    WHERE id = ${c.req.param("slotId")} AND cleaner_id = ${cleanerId}
  `;
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

    if (available) {
      await sql`
        DELETE FROM cleaner_schedule
        WHERE cleaner_id = ${cleanerId} AND slot_type = 'available_now'
      `;
      await sql`
        INSERT INTO cleaner_schedule (cleaner_id, slot_type, is_active)
        VALUES (${cleanerId}, 'available_now', true)
      `;
    } else {
      await sql`
        DELETE FROM cleaner_schedule
        WHERE cleaner_id = ${cleanerId} AND slot_type = 'available_now'
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
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

    const rows = (await sql`
      SELECT cs.cleaner_id, cs.slot_type, cs.day_of_week,
             cs.start_time::text AS start_time, cs.end_time::text AS end_time,
             cs.specific_date::text AS specific_date,
             sa.center_lat, sa.center_lng, sa.radius_miles
      FROM cleaner_schedule cs
      JOIN cleaners cl ON cl.id = cs.cleaner_id
      LEFT JOIN cleaner_service_areas sa ON sa.cleaner_id = cs.cleaner_id
      WHERE cs.is_active = true
        AND cl.status IN ('approved', 'active')
        AND (
          (cs.slot_type = 'recurring' AND cs.day_of_week = ${dayOfWeek})
          OR (cs.slot_type = 'flexible' AND cs.specific_date = ${date})
        )
    `) as Array<{
      cleaner_id: string;
      start_time: string | null;
      end_time: string | null;
      center_lat: string | null;
      center_lng: string | null;
      radius_miles: number | null;
    }>;

    const windowCounts: Record<string, Set<string>> = {
      morning: new Set(),
      afternoon: new Set(),
      evening: new Set(),
    };

    for (const r of rows) {
      // Service-area proximity filter (when coordinates available).
      if (
        lat != null &&
        lng != null &&
        r.center_lat != null &&
        r.center_lng != null
      ) {
        const miles = haversineDistance(
          lat,
          lng,
          Number(r.center_lat),
          Number(r.center_lng)
        );
        if (miles > (r.radius_miles ?? 25)) continue;
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

    // Anonymized: only return whether each window has availability + a count.
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
