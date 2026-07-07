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
 * Short-term rental management (customer-facing).
 *
 * Mounted at /rentals (requireAuth). Lets a host register properties, connect
 * SSRF-validated .ics calendars, view derived turnaround reservations, and
 * trigger a manual sync. Raw ICS is never returned — only derived fields.
 */
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCustomerByUserId, getUserByClerkId, upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { fetchCalendar, CalendarValidationError } from "../lib/calendarSecurity";
import { syncCalendarSource } from "../lib/calendarSync";
import { loadStrConfig } from "../lib/pricingConfig";
import { calculateTurnaroundPrice } from "@sweepr/utils";
import type { AppBindings } from "../types";

export const rentalsRouter = new Hono<AppBindings>();
rentalsRouter.use("*", requireAuth);

async function resolveCustomerId(c: Context<AppBindings>): Promise<string | null> {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user =
    (await getUserByClerkId(sql, authUser.clerkId)) ??
    (await upsertUser(sql, {
      clerkId: authUser.clerkId,
      email: authUser.email || `${authUser.clerkId}@noemail.sweepr.local`,
      role: "customer",
    }));
  const customer = await getCustomerByUserId(sql, user.id);
  return customer?.id ?? null;
}

// ── Pricing (customer-visible only) ──────────────────────────────────────────
rentalsRouter.get("/pricing", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadStrConfig(sql);
  const per = calculateTurnaroundPrice(cfg);
  return c.json({
    monthlyFee: cfg.monthlyConnectionFeeCents / 100,
    perTurnaround: per.totalOwed,
    currency: cfg.currency,
  });
});

// ── Properties ───────────────────────────────────────────────────────────────
rentalsRouter.get("/properties", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ properties: [] });

  const props = (await sql`
    SELECT p.id, p.nickname, p.street_address, p.city, p.state, p.zip,
           p.bedrooms, p.bathrooms, p.sqft, p.monthly_fee_cents, p.active,
           p.enrolled_at,
           COUNT(cs.id) FILTER (WHERE cs.id IS NOT NULL) AS source_count
    FROM short_term_rental_properties p
    LEFT JOIN calendar_sources cs ON cs.property_id = p.id
    WHERE p.customer_id = ${customerId}
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `) as Array<Record<string, unknown>>;

  return c.json({
    properties: props.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      address: [p.street_address, p.city, p.state, p.zip].filter(Boolean).join(", ") || null,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      sqft: p.sqft,
      monthlyFee: (p.monthly_fee_cents as number) / 100,
      active: p.active,
      enrolledAt: p.enrolled_at,
      sourceCount: Number(p.source_count),
    })),
  });
});

const propertySchema = z.object({
  nickname: z.string().min(1).max(120),
  streetAddress: z.string().max(200).optional(),
  unit: z.string().max(60).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(60).optional(),
  zip: z.string().max(20).optional(),
  bedrooms: z.number().int().min(0).max(30).optional(),
  bathrooms: z.number().min(0).max(30).optional(),
  sqft: z.number().int().min(0).max(50000).optional(),
});

rentalsRouter.post("/properties", zValidator("json", propertySchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ error: "No customer profile" }, 400);
  const b = c.req.valid("json");
  const cfg = await loadStrConfig(sql);

  // Created UNENROLLED (active=false): the monthly subscription and turnaround
  // booking only start after the host explicitly enrolls (accepts disclosures).
  const rows = (await sql`
    INSERT INTO short_term_rental_properties (
      customer_id, nickname, street_address, unit, city, state, zip,
      bedrooms, bathrooms, sqft, monthly_fee_cents, active
    ) VALUES (
      ${customerId}, ${b.nickname}, ${b.streetAddress ?? null}, ${b.unit ?? null},
      ${b.city ?? null}, ${b.state ?? null}, ${b.zip ?? null},
      ${b.bedrooms ?? null}, ${b.bathrooms ?? null}, ${b.sqft ?? null},
      ${cfg.monthlyConnectionFeeCents}, false
    ) RETURNING id
  `) as { id: string }[];
  return c.json({ id: rows[0].id });
});

// ── Enrollment (explicit, disclaimer-gated) ──────────────────────────────────
const enrollSchema = z.object({
  // The client must affirmatively accept the disclosures.
  acceptDisclosures: z.literal(true),
  disclaimerVersion: z.string().max(20).default("v1"),
});

rentalsRouter.post("/properties/:id/enroll", zValidator("json", enrollSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  if (!(await assertOwnsProperty(c, id))) return c.json({ error: "Not found" }, 404);
  const { disclaimerVersion } = c.req.valid("json");
  const cfg = await loadStrConfig(sql);

  // Snapshot the current monthly fee at enrollment time.
  await sql`
    UPDATE short_term_rental_properties
    SET active = true, enrolled_at = NOW(),
        enrollment_disclaimer_version = ${disclaimerVersion},
        monthly_fee_cents = ${cfg.monthlyConnectionFeeCents},
        updated_at = NOW()
    WHERE id = ${id}
  `;
  return c.json({ ok: true, enrolled: true });
});

rentalsRouter.post("/properties/:id/unenroll", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  if (!(await assertOwnsProperty(c, id))) return c.json({ error: "Not found" }, 404);
  await sql`
    UPDATE short_term_rental_properties
    SET active = false, updated_at = NOW()
    WHERE id = ${id}
  `;
  return c.json({ ok: true, enrolled: false });
});

async function assertOwnsProperty(c: Context<AppBindings>, propertyId: string): Promise<boolean> {
  const sql = getDb(c.env.DATABASE_URL);
  const customerId = await resolveCustomerId(c);
  if (!customerId) return false;
  const rows = (await sql`
    SELECT 1 FROM short_term_rental_properties WHERE id = ${propertyId} AND customer_id = ${customerId} LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

rentalsRouter.delete("/properties/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  if (!(await assertOwnsProperty(c, id))) return c.json({ error: "Not found" }, 404);
  // Cascade removes calendar_sources + imported_calendar_reservations.
  await sql`DELETE FROM short_term_rental_properties WHERE id = ${id}`;
  return c.json({ ok: true });
});

// ── Calendar validation (server-side, SSRF-safe) ─────────────────────────────
const validateSchema = z.object({ icsUrl: z.string().min(1).max(2000) });

rentalsRouter.post(
  "/validate-calendar",
  rateLimit({ keyPrefix: "rentals-validate", by: "user", limit: 20, windowMs: 900_000, strict: true }),
  zValidator("json", validateSchema),
  async (c) => {
    const { icsUrl } = c.req.valid("json");
    try {
      const { reservations } = await fetchCalendar(icsUrl);
      const upcoming = reservations.filter((r) => r.end && r.end.slice(0, 10) >= new Date().toISOString().slice(0, 10));
      return c.json({ ok: true, eventCount: reservations.length, upcomingCount: upcoming.length });
    } catch (err) {
      const message =
        err instanceof CalendarValidationError ? err.message : "We couldn't validate that calendar URL.";
      return c.json({ ok: false, error: message }, 400);
    }
  },
);

// ── Calendar sources ─────────────────────────────────────────────────────────
const sourceSchema = z.object({
  propertyId: z.string().uuid(),
  provider: z.enum(["airbnb", "vrbo", "booking_com", "google_calendar", "pms", "other"]),
  icsUrl: z.string().min(1).max(2000),
  autoBook: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(60).max(180).optional(),
});

rentalsRouter.post(
  "/calendars",
  rateLimit({ keyPrefix: "rentals-connect", by: "user", limit: 20, windowMs: 900_000, strict: true }),
  zValidator("json", sourceSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const b = c.req.valid("json");
    if (!(await assertOwnsProperty(c, b.propertyId))) return c.json({ error: "Not found" }, 404);

    // Mandatory server-side validation before we ever store the URL.
    try {
      await fetchCalendar(b.icsUrl);
    } catch (err) {
      const message =
        err instanceof CalendarValidationError ? err.message : "We couldn't validate that calendar URL.";
      return c.json({ error: message }, 400);
    }

    const rows = (await sql`
      INSERT INTO calendar_sources (property_id, provider, ics_url, auto_book, sync_interval_minutes)
      VALUES (${b.propertyId}, ${b.provider}, ${b.icsUrl}, ${b.autoBook ?? false}, ${b.syncIntervalMinutes ?? 120})
      RETURNING id
    `) as { id: string }[];

    // Kick an immediate first sync so the host sees turnovers right away.
    await syncCalendarSource(sql, rows[0].id);
    return c.json({ id: rows[0].id });
  },
);

rentalsRouter.get("/calendars", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ sources: [] });
  const rows = (await sql`
    SELECT cs.id, cs.property_id, cs.provider, cs.auto_book, cs.sync_interval_minutes,
           cs.status, cs.last_synced_at, cs.last_sync_error, cs.last_sync_event_count
    FROM calendar_sources cs
    JOIN short_term_rental_properties p ON p.id = cs.property_id
    WHERE p.customer_id = ${customerId}
    ORDER BY cs.created_at DESC
  `) as Array<Record<string, unknown>>;
  // NOTE: ics_url is intentionally omitted — never expose the feed URL back.
  return c.json({
    sources: rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      provider: r.provider,
      autoBook: r.auto_book,
      syncIntervalMinutes: r.sync_interval_minutes,
      status: r.status,
      lastSyncedAt: r.last_synced_at,
      lastSyncError: r.last_sync_error,
      lastSyncEventCount: r.last_sync_event_count,
    })),
  });
});

rentalsRouter.post("/calendars/:id/sync", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ error: "No customer" }, 400);
  const owns = (await sql`
    SELECT 1 FROM calendar_sources cs
    JOIN short_term_rental_properties p ON p.id = cs.property_id
    WHERE cs.id = ${id} AND p.customer_id = ${customerId} LIMIT 1
  `) as unknown[];
  if (!owns.length) return c.json({ error: "Not found" }, 404);
  const outcome = await syncCalendarSource(sql, id);
  return c.json(outcome, outcome.ok ? 200 : 400);
});

rentalsRouter.delete("/calendars/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ error: "No customer" }, 400);
  const rows = (await sql`
    DELETE FROM calendar_sources cs
    USING short_term_rental_properties p
    WHERE cs.id = ${id} AND cs.property_id = p.id AND p.customer_id = ${customerId}
    RETURNING cs.id
  `) as { id: string }[];
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Review-first approval: book a pending turnaround ─────────────────────────
rentalsRouter.post("/reservations/:id/book", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ error: "No customer" }, 400);

  const rows = (await sql`
    SELECT r.id, r.property_id, r.checkout_date::text AS checkout_date, r.cleaning_status,
           p.active
    FROM imported_calendar_reservations r
    JOIN short_term_rental_properties p ON p.id = r.property_id
    WHERE r.id = ${id} AND p.customer_id = ${customerId}
    LIMIT 1
  `) as Array<{ id: string; property_id: string; checkout_date: string; cleaning_status: string; active: boolean }>;
  const resv = rows[0];
  if (!resv) return c.json({ error: "Not found" }, 404);
  if (resv.cleaning_status !== "pending") {
    return c.json({ error: "already_handled", message: "This turnover is already booked or dismissed." }, 409);
  }
  if (!resv.active) {
    return c.json({ error: "not_enrolled", message: "Enroll this property before booking turnovers." }, 400);
  }

  const { createTurnaroundBooking } = await import("../lib/calendarSync");
  const bookingId = await createTurnaroundBooking(sql, resv.property_id, resv.checkout_date);
  if (!bookingId) return c.json({ error: "booking_failed", message: "We couldn't book this turnover. Please try again." }, 500);
  await sql`
    UPDATE imported_calendar_reservations
    SET cleaning_status = 'scheduled', booking_id = ${bookingId}, updated_at = NOW()
    WHERE id = ${resv.id}
  `;
  return c.json({ ok: true, bookingId });
});

// Dismiss a pending turnover (host doesn't want a clean for this checkout).
rentalsRouter.post("/reservations/:id/skip", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ error: "No customer" }, 400);
  const rows = (await sql`
    UPDATE imported_calendar_reservations r
    SET cleaning_status = 'skipped', updated_at = NOW()
    FROM short_term_rental_properties p
    WHERE r.id = ${id} AND r.property_id = p.id AND p.customer_id = ${customerId}
      AND r.cleaning_status = 'pending'
    RETURNING r.id
  `) as { id: string }[];
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Derived reservations (turnovers) ─────────────────────────────────────────
rentalsRouter.get("/reservations", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const customerId = await resolveCustomerId(c);
  if (!customerId) return c.json({ reservations: [] });
  const rows = (await sql`
    SELECT r.id, r.property_id, r.summary, r.checkin_date, r.checkout_date,
           r.cleaning_status, r.booking_id, p.nickname
    FROM imported_calendar_reservations r
    JOIN short_term_rental_properties p ON p.id = r.property_id
    WHERE p.customer_id = ${customerId} AND r.checkout_date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY r.checkout_date ASC
    LIMIT 300
  `) as Array<Record<string, unknown>>;
  return c.json({
    reservations: rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      propertyNickname: r.nickname,
      summary: r.summary,
      checkinDate: r.checkin_date,
      checkoutDate: r.checkout_date,
      cleaningStatus: r.cleaning_status,
      bookingId: r.booking_id,
    })),
  });
});
