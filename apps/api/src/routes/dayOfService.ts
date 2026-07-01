/**
 * Day-of-Service API
 *
 * Handles the real-time operational flow for an active cleaning job:
 *   cleaner: start-route → arrival-ping → start-clean → upload-photos → finish-clean → checkout-photo
 *   customer: real-time status/location reads, access code reveal after arrival
 *
 * Security properties:
 *   - Full address is only confirmed readable after booking is confirmed (not matching)
 *   - Access codes are only returned after GPS arrival verification (within GPS_ARRIVAL_THRESHOLD_M)
 *   - Location pings are stored for 72 h then purged
 *   - Checkout photo required before job can transition to "completed"
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import { encryptSecret, decryptSecret, requireEncryptionKey } from "../lib/crypto";
import { canUploadPhotos, getBookingAuthCtx } from "../lib/bookingAuthorization";
import { isValidTransition } from "../lib/statusMachine";
import type { AppBindings } from "../types";

export const dayOfServiceRouter = new Hono<AppBindings>();

dayOfServiceRouter.use("*", requireAuth);

const GPS_ARRIVAL_THRESHOLD_M = 150; // metres

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface BookingRow {
  id: string;
  status: string;
  day_status: string | null;
  cleaner_id: string | null;
  customer_id: string | null;
  address_lat: number | null;
  address_lng: number | null;
  arrival_verified_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
}

// ─── CLEANER: Start Route ─────────────────────────────────────────────────────
// Cleaner taps "Start Route" — transitions booking to day_status=en_route.
// Full address is revealed to cleaner at this point.
dayOfServiceRouter.post(
  "/bookings/:id/start-route",
  zValidator("json", z.object({ lat: z.number(), lng: z.number() })),
  async (c) => {
    const bookingId = c.req.param("id");
    const { lat, lng } = c.req.valid("json");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT b.id, b.status, b.day_status, b.cleaner_id,
             cl.user_id AS cleaner_user_id,
             a.lat AS address_lat, a.lng AS address_lng,
             a.street AS address_line1, a.city AS address_city,
             a.state AS address_state, a.zip AS address_zip
      FROM bookings b
      JOIN cleaners cl ON cl.id = b.cleaner_id
      JOIN addresses a ON a.id = b.address_id
      WHERE b.id = ${bookingId}
    `) as Array<BookingRow & { cleaner_user_id: string }>;

    const booking = rows[0];
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    if (booking.status !== "confirmed") return c.json({ error: "Booking is not in confirmed state" }, 400);
    if (booking.day_status && booking.day_status !== "en_route") {
      return c.json({ error: "Cannot start route from current state" }, 400);
    }

    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
    const cleaner = (await sql`SELECT id FROM cleaners WHERE user_id = ${users[0]?.id}`) as Array<{ id: string }>;
    if (!cleaner[0] || cleaner[0].id !== booking.cleaner_id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // P1-5: Enforce configurable address reveal timing window.
    const revealSettings = (await sql`
      SELECT reveal_hours_before, allow_same_day_only FROM address_reveal_settings WHERE active = TRUE LIMIT 1
    `) as Array<{ reveal_hours_before: number; allow_same_day_only: boolean }>;
    const settings = revealSettings[0] ?? { reveal_hours_before: 4, allow_same_day_only: true };

    const scheduledRows = (await sql`SELECT scheduled_at FROM bookings WHERE id = ${bookingId}`) as Array<{ scheduled_at: string | null }>;
    const scheduledAt = scheduledRows[0]?.scheduled_at ? new Date(scheduledRows[0].scheduled_at) : null;

    if (scheduledAt) {
      const now = new Date();
      const revealWindowStart = new Date(scheduledAt.getTime() - settings.reveal_hours_before * 60 * 60 * 1000);

      if (settings.allow_same_day_only) {
        const sameDay = now.toDateString() === scheduledAt.toDateString();
        if (!sameDay) {
          return c.json({ error: "Address is not yet available — must be same day as scheduled clean" }, 403);
        }
      }

      if (now < revealWindowStart) {
        const hoursUntil = Math.ceil((revealWindowStart.getTime() - now.getTime()) / (60 * 60 * 1000));
        return c.json({ error: `Address is not yet available — available ${hoursUntil}h before scheduled start` }, 403);
      }
    }

    await sql`
      UPDATE bookings SET
        day_status = 'en_route',
        cleaner_lat = ${lat},
        cleaner_lng = ${lng},
        address_revealed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    await audit(sql, {
      action: "booking.start_route",
      actorClerkId: clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { lat, lng },
      timestamp: new Date().toISOString(),
    });

    return c.json({
      ok: true,
      day_status: "en_route",
      address: {
        line1: booking.address_line1,
        city: booking.address_city,
        state: booking.address_state,
        zip: booking.address_zip,
      },
    });
  }
);

// ─── CLEANER: Location Ping ───────────────────────────────────────────────────
dayOfServiceRouter.post(
  "/bookings/:id/location",
  zValidator("json", z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy_m: z.number().optional(),
    heading: z.number().optional(),
    speed_kmh: z.number().optional(),
  })),
  async (c) => {
    const bookingId = c.req.param("id");
    const { lat, lng, accuracy_m, heading, speed_kmh } = c.req.valid("json");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT b.id, b.day_status, b.cleaner_id, b.arrival_verified_at,
             a.lat AS address_lat, a.lng AS address_lng
      FROM bookings b
      JOIN addresses a ON a.id = b.address_id
      WHERE b.id = ${bookingId}
    `) as Array<{ id: string; day_status: string | null; cleaner_id: string; arrival_verified_at: string | null; address_lat: number | null; address_lng: number | null }>;

    const booking = rows[0];
    if (!booking) return c.json({ error: "Not found" }, 404);

    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
    const cleaner = (await sql`SELECT id FROM cleaners WHERE user_id = ${users[0]?.id}`) as Array<{ id: string }>;
    if (!cleaner[0] || cleaner[0].id !== booking.cleaner_id) return c.json({ error: "Forbidden" }, 403);

    await sql`
      INSERT INTO cleaner_location_pings (booking_id, cleaner_id, lat, lng, accuracy_m, heading, speed_kmh)
      VALUES (${bookingId}, ${booking.cleaner_id}, ${lat}, ${lng}, ${accuracy_m ?? null}, ${heading ?? null}, ${speed_kmh ?? null})
    `;

    // Auto-verify arrival if within threshold and not already verified
    let arrivalJustVerified = false;
    if (!booking.arrival_verified_at && booking.address_lat && booking.address_lng) {
      const dist = haversineM(lat, lng, booking.address_lat, booking.address_lng);
      if (dist <= GPS_ARRIVAL_THRESHOLD_M) {
        await sql`
          UPDATE bookings SET
            day_status = 'arrived',
            arrival_verified_at = NOW(),
            updated_at = NOW()
          WHERE id = ${bookingId} AND arrival_verified_at IS NULL
        `;
        arrivalJustVerified = true;
      }
    }

    return c.json({ ok: true, arrival_verified: arrivalJustVerified });
  }
);

// ─── CLEANER: Start Clean ─────────────────────────────────────────────────────
// Requires arrival to be GPS-verified. After this, access code is available.
dayOfServiceRouter.post(
  "/bookings/:id/start-clean",
  async (c) => {
    const bookingId = c.req.param("id");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT b.id, b.day_status, b.cleaner_id, b.arrival_verified_at
      FROM bookings b WHERE b.id = ${bookingId}
    `) as Array<{ id: string; day_status: string | null; cleaner_id: string; arrival_verified_at: string | null }>;

    const booking = rows[0];
    if (!booking) return c.json({ error: "Not found" }, 404);
    if (!booking.arrival_verified_at) return c.json({ error: "GPS arrival must be verified first" }, 400);
    if (booking.day_status !== "arrived") return c.json({ error: "Must be in arrived state" }, 400);

    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
    const cleaner = (await sql`SELECT id FROM cleaners WHERE user_id = ${users[0]?.id}`) as Array<{ id: string }>;
    if (!cleaner[0] || cleaner[0].id !== booking.cleaner_id) return c.json({ error: "Forbidden" }, 403);

    await sql`
      UPDATE bookings SET
        day_status = 'in_progress',
        started_at = NOW(),
        access_code_revealed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    // Fetch and decrypt access codes — only revealed after GPS arrival confirmed.
    const rawCodes = (await sql`
      SELECT code_type, code_value, code_value_encrypted, notes
      FROM booking_access_codes WHERE booking_id = ${bookingId}
    `) as Array<{ code_type: string; code_value: string | null; code_value_encrypted: string | null; notes: string | null }>;

    const encryptionKey = requireEncryptionKey(c.env.ACCESS_CODE_ENCRYPTION_KEY, c.env.ENVIRONMENT);
    const codes = await Promise.all(rawCodes.map(async (code) => {
      let decryptedValue: string | null = null;
      if (code.code_value_encrypted && encryptionKey) {
        try {
          decryptedValue = await decryptSecret(code.code_value_encrypted, encryptionKey);
        } catch {
          // Decryption failed — do not expose raw bytes; treat as unavailable.
          decryptedValue = null;
        }
      } else if (!code.code_value_encrypted) {
        // Legacy plaintext row (pre-encryption migration); return as-is.
        decryptedValue = code.code_value;
      }
      // Never include encrypted payload in response — only decrypted value or null.
      return { code_type: code.code_type, code_value: decryptedValue, notes: code.notes };
    }));

    // Audit includes booking/cleaner context and IP but never the raw code value.
    await audit(sql, {
      action: "access_code.revealed",
      actorClerkId: clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: {
        code_count: codes.length,
        arrival_verified_at: booking.arrival_verified_at,
      },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    await audit(sql, {
      action: "booking.start_clean",
      actorClerkId: clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: {},
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, day_status: "in_progress", access_codes: codes });
  }
);

// ─── CLEANER: Finish Clean ────────────────────────────────────────────────────
// Transitions to awaiting_checkout — checkout photo required before completion.
dayOfServiceRouter.post(
  "/bookings/:id/finish-clean",
  async (c) => {
    const bookingId = c.req.param("id");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT b.id, b.day_status, b.cleaner_id FROM bookings b WHERE b.id = ${bookingId}
    `) as Array<{ id: string; day_status: string | null; cleaner_id: string }>;

    const booking = rows[0];
    if (!booking) return c.json({ error: "Not found" }, 404);
    if (booking.day_status !== "in_progress") return c.json({ error: "Must be in_progress" }, 400);

    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
    const cleaner = (await sql`SELECT id FROM cleaners WHERE user_id = ${users[0]?.id}`) as Array<{ id: string }>;
    if (!cleaner[0] || cleaner[0].id !== booking.cleaner_id) return c.json({ error: "Forbidden" }, 403);

    await sql`
      UPDATE bookings SET
        day_status = 'awaiting_checkout',
        updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    return c.json({ ok: true, day_status: "awaiting_checkout" });
  }
);

// ─── CLEANER: Submit Checkout Photo + Complete ────────────────────────────────
// Checkout photo storage key is required. Transitions to completed.
dayOfServiceRouter.post(
  "/bookings/:id/complete",
  zValidator("json", z.object({
    checkout_photo_key: z.string().min(1),
  })),
  async (c) => {
    const bookingId = c.req.param("id");
    const { checkout_photo_key } = c.req.valid("json");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT b.id, b.day_status, b.status, b.cleaner_id, b.customer_id, b.started_at
      FROM bookings b WHERE b.id = ${bookingId}
    `) as Array<{ id: string; day_status: string | null; status: string; cleaner_id: string; customer_id: string; started_at: string | null }>;

    const booking = rows[0];
    if (!booking) return c.json({ error: "Not found" }, 404);
    if (booking.day_status !== "awaiting_checkout") return c.json({ error: "Must be awaiting_checkout" }, 400);

    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
    const cleaner = (await sql`SELECT id FROM cleaners WHERE user_id = ${users[0]?.id}`) as Array<{ id: string }>;
    if (!cleaner[0] || cleaner[0].id !== booking.cleaner_id) return c.json({ error: "Forbidden" }, 403);

    // P0-4: Load configurable photo requirements from DB.
    const reqRows = (await sql`
      SELECT minimum_before_photos, minimum_after_photos, require_checkout_photo
      FROM job_completion_requirements WHERE active = TRUE LIMIT 1
    `) as Array<{ minimum_before_photos: number; minimum_after_photos: number; require_checkout_photo: boolean }>;
    const req = reqRows[0] ?? { minimum_before_photos: 3, minimum_after_photos: 3, require_checkout_photo: true };

    const now = new Date();

    // Validate photo minimums BEFORE inserting checkout photo (avoids orphaned rows on retry).
    const beforeCount = (await sql`
      SELECT COUNT(*)::int AS c FROM booking_photos WHERE booking_id = ${bookingId} AND photo_type = 'before'
    `) as Array<{ c: number }>;
    const afterCount = (await sql`
      SELECT COUNT(*)::int AS c FROM booking_photos WHERE booking_id = ${bookingId} AND photo_type = 'after'
    `) as Array<{ c: number }>;

    if ((beforeCount[0]?.c ?? 0) < req.minimum_before_photos) {
      return c.json({ error: `At least ${req.minimum_before_photos} before photos are required (have ${beforeCount[0]?.c ?? 0})` }, 400);
    }
    if ((afterCount[0]?.c ?? 0) < req.minimum_after_photos) {
      return c.json({ error: `At least ${req.minimum_after_photos} after photos are required (have ${afterCount[0]?.c ?? 0})` }, 400);
    }

    // Validate storage key is scoped to this booking (guards against key-injection across bookings).
    if (!checkout_photo_key.startsWith(`bookings/${bookingId}/`)) {
      return c.json({ error: "Invalid storage key for booking" }, 400);
    }

    // Idempotent upsert — safe if cleaner retries completion.
    await sql`
      INSERT INTO booking_photos (booking_id, photo_type, storage_key, uploaded_by)
      VALUES (${bookingId}, 'checkout', ${checkout_photo_key}, ${clerkId})
      ON CONFLICT (booking_id, photo_type) DO UPDATE SET
        storage_key = EXCLUDED.storage_key,
        uploaded_by = EXCLUDED.uploaded_by
    `;

    const durationMins = booking.started_at
      ? Math.round((now.getTime() - new Date(booking.started_at).getTime()) / 60000)
      : null;

    // Guard against completing a booking that's been moved to a terminal
    // state (disputed/refunded/cancelled) by a race with another flow.
    if (!isValidTransition(booking.status, "completed")) {
      return c.json({ error: `Cannot complete a booking in '${booking.status}' status` }, 409);
    }

    await sql`
      UPDATE bookings SET
        day_status = 'completed',
        status = 'completed',
        completed_at = ${now.toISOString()},
        updated_at = NOW()
      WHERE id = ${bookingId} AND status = ${booking.status}
    `;

    await sql`
      INSERT INTO job_completion_packages
        (booking_id, cleaner_id, customer_id, started_at, completed_at, duration_mins,
         before_photo_count, after_photo_count, checkout_photo_key)
      VALUES
        (${bookingId}, ${booking.cleaner_id}, ${booking.customer_id},
         ${booking.started_at}, ${now.toISOString()}, ${durationMins},
         ${beforeCount[0]?.c ?? 0}, ${afterCount[0]?.c ?? 0}, ${checkout_photo_key})
      ON CONFLICT (booking_id) DO NOTHING
    `;

    await audit(sql, {
      action: "booking.completed",
      actorClerkId: clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { duration_mins: durationMins, checkout_photo_key },
      timestamp: now.toISOString(),
    });

    return c.json({ ok: true, day_status: "completed", duration_mins: durationMins });
  }
);

// ─── CLEANER/CUSTOMER: Upload Photo ──────────────────────────────────────────
dayOfServiceRouter.post(
  "/bookings/:id/photos",
  zValidator("json", z.object({
    photo_type: z.enum(["before", "after", "checkout", "damage"]),
    storage_key: z.string().min(1),
    room_label: z.string().optional(),
  })),
  async (c) => {
    const bookingId = c.req.param("id");
    const { photo_type, storage_key, room_label } = c.req.valid("json");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const ctx = await getBookingAuthCtx(sql, bookingId, clerkId);
    if (!ctx) return c.json({ error: "Not found" }, 404);
    if (!canUploadPhotos(ctx)) {
      return c.json({ error: "Forbidden — photos can only be uploaded during an active job" }, 403);
    }

    // Guard against cross-booking storage key injection.
    if (!storage_key.startsWith(`bookings/${bookingId}/`)) {
      return c.json({ error: "Invalid storage key for booking" }, 400);
    }

    await sql`
      INSERT INTO booking_photos (booking_id, photo_type, storage_key, room_label, uploaded_by)
      VALUES (${bookingId}, ${photo_type}, ${storage_key}, ${room_label ?? null}, ${clerkId})
    `;

    return c.json({ ok: true });
  }
);

// ─── CLEANER/CUSTOMER: Get Booking Status ────────────────────────────────────
// Returns real-time booking state and last known cleaner location.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

dayOfServiceRouter.get("/bookings/:id/live", async (c) => {
  const bookingId = c.req.param("id");
  const clerkId = c.get("user").clerkId;
  const sql = getDb(c.env.DATABASE_URL);

  // Non-UUID ids (e.g. seed/demo "job_501") can't exist — avoid a Postgres
  // uuid cast error (500); treat as not found.
  if (!UUID_RE.test(bookingId)) return c.json({ error: "Not found" }, 404);

  const rows = (await sql`
    SELECT b.id, b.status, b.day_status, b.cleaner_id, b.customer_id,
           b.arrival_verified_at, b.started_at, b.completed_at,
           b.address_revealed_at, b.access_code_revealed_at,
           b.scheduled_at, b.total_price, b.service_type,
           a.lat AS address_lat, a.lng AS address_lng,
           a.street AS address_street, a.city AS address_city,
           a.state AS address_state, a.zip AS address_zip,
           cl.first_name AS cleaner_first, cl.last_name AS cleaner_last,
           cust.user_id AS customer_user_id, u_cl.clerk_id AS cleaner_clerk_id
    FROM bookings b
    LEFT JOIN addresses a ON a.id = b.address_id
    LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
    LEFT JOIN customers cust ON cust.id = b.customer_id
    LEFT JOIN users u_cl ON u_cl.id = cl.user_id
    WHERE b.id = ${bookingId}
  `) as Array<{
    id: string; status: string; day_status: string | null;
    cleaner_id: string | null; customer_id: string | null;
    arrival_verified_at: string | null; started_at: string | null;
    completed_at: string | null; address_revealed_at: string | null;
    access_code_revealed_at: string | null; scheduled_at: string | null;
    total_price: number | null; service_type: string | null;
    address_lat: number | null; address_lng: number | null;
    address_street: string | null; address_city: string | null;
    address_state: string | null; address_zip: string | null;
    cleaner_first: string | null; cleaner_last: string | null;
    customer_user_id: string | null; cleaner_clerk_id: string | null;
  }>;

  const booking = rows[0];
  if (!booking) return c.json({ error: "Not found" }, 404);

  // Verify caller is customer or cleaner for this booking
  const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
  const userId = users[0]?.id;
  const isCleaner = booking.cleaner_clerk_id === clerkId;
  const isCustomer = booking.customer_user_id === userId;
  if (!isCleaner && !isCustomer) return c.json({ error: "Forbidden" }, 403);

  // Latest location ping
  const pings = (await sql`
    SELECT lat, lng, created_at FROM cleaner_location_pings
    WHERE booking_id = ${bookingId}
    ORDER BY created_at DESC LIMIT 1
  `) as Array<{ lat: number; lng: number; created_at: string }>;

  const photos = (await sql`
    SELECT id, photo_type, room_label, created_at FROM booking_photos
    WHERE booking_id = ${bookingId}
    ORDER BY created_at ASC
  `) as Array<{ id: string; photo_type: string; room_label: string | null; created_at: string }>;

  // Access codes: only revealed to the cleaner after they've been unlocked
  // (access_code_revealed_at set, i.e. GPS arrival confirmed).
  let accessCodes: Array<{ code_type: string; code_value: string | null; notes: string | null }> = [];
  if (isCleaner && booking.access_code_revealed_at) {
    const rawCodes = (await sql`
      SELECT code_type, code_value, code_value_encrypted, notes
      FROM booking_access_codes WHERE booking_id = ${bookingId}
    `) as Array<{ code_type: string; code_value: string | null; code_value_encrypted: string | null; notes: string | null }>;
    const encryptionKey = requireEncryptionKey(c.env.ACCESS_CODE_ENCRYPTION_KEY, c.env.ENVIRONMENT);
    accessCodes = await Promise.all(rawCodes.map(async (code) => {
      let decryptedValue: string | null = null;
      if (code.code_value_encrypted && encryptionKey) {
        try {
          decryptedValue = await decryptSecret(code.code_value_encrypted, encryptionKey);
        } catch {
          decryptedValue = null;
        }
      } else if (!code.code_value_encrypted) {
        decryptedValue = code.code_value;
      }
      return { code_type: code.code_type, code_value: decryptedValue, notes: code.notes };
    }));
  }

  // Address is only revealed once address_revealed_at has been set (start-route).
  const address = isCleaner && booking.address_revealed_at && booking.address_street
    ? {
        street: booking.address_street,
        city: booking.address_city,
        state: booking.address_state,
        zip: booking.address_zip,
        lat: booking.address_lat,
        lng: booking.address_lng,
      }
    : undefined;

  return c.json({
    booking: {
      id: booking.id,
      status: booking.status,
      day_status: booking.day_status,
      scheduled_at: booking.scheduled_at,
      arrival_verified_at: booking.arrival_verified_at,
      started_at: booking.started_at,
      completed_at: booking.completed_at,
      total_price: booking.total_price,
      service_type: booking.service_type,
      cleaner_name: [booking.cleaner_first, booking.cleaner_last].filter(Boolean).join(" ") || null,
      address,
      access_codes: accessCodes,
      photos,
    },
    last_location: pings[0] ?? null,
    photos,
  });
});

// ─── CUSTOMER: Save Access Code ───────────────────────────────────────────────
dayOfServiceRouter.post(
  "/bookings/:id/access-code",
  zValidator("json", z.object({
    code_type: z.enum(["lockbox", "keypad", "doorcode", "building", "garage", "other"]),
    code_value: z.string().min(1).max(100),
    notes: z.string().max(500).optional(),
  })),
  async (c) => {
    const bookingId = c.req.param("id");
    const { code_type, code_value, notes } = c.req.valid("json");
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT b.id FROM bookings b
      JOIN customers cust ON cust.id = b.customer_id
      JOIN users u ON u.id = cust.user_id AND u.clerk_id = ${clerkId}
      WHERE b.id = ${bookingId}
    `) as Array<{ id: string }>;
    if (!rows[0]) return c.json({ error: "Forbidden" }, 403);

    // Production: reject if encryption key is missing. Dev: warn and fall back to plaintext.
    const encryptionKey = requireEncryptionKey(c.env.ACCESS_CODE_ENCRYPTION_KEY, c.env.ENVIRONMENT);

    let encryptedValue: string | null = null;
    let plaintextValue: string | null = code_value;

    if (encryptionKey) {
      encryptedValue = await encryptSecret(code_value, encryptionKey);
      plaintextValue = null;
    }

    await sql`
      INSERT INTO booking_access_codes
        (booking_id, code_type, code_value, code_value_encrypted, encryption_version, notes, created_by)
      VALUES
        (${bookingId}, ${code_type}, ${plaintextValue}, ${encryptedValue},
         ${encryptionKey ? "v1" : null}, ${notes ?? null}, ${clerkId})
      ON CONFLICT (booking_id) DO UPDATE SET
        code_type            = EXCLUDED.code_type,
        code_value           = EXCLUDED.code_value,
        code_value_encrypted = EXCLUDED.code_value_encrypted,
        encryption_version   = EXCLUDED.encryption_version,
        notes                = EXCLUDED.notes,
        updated_at           = NOW()
    `;

    return c.json({ ok: true });
  }
);
