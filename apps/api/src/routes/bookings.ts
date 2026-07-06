import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getBooking,
  getCustomerByUserId,
  getUserByClerkId,
  upsertUser,
  listBookingsForCustomer,
  updateBookingStatus,
} from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { rankCleanersForBooking } from "../lib/matching";
import { initiateAssignment, handleOfferResponse } from "../lib/assignment";
import { sendNotification } from "../lib/notifications";
import { rateLimit } from "../middleware/rateLimit";
import { assertValidTransition } from "../lib/statusMachine";
import { audit } from "../lib/audit";
import { serverTrack } from "../lib/posthog";
import { logger } from "../lib/logger";
import { assertBookingAccess } from "../lib/bookingAccess";
import { checkInsurance } from "../lib/cleanerRequirements";
import { calculateBookingPrice, getAddOnCatalogue } from "../lib/pricingEngine";
import { resolveBookingPricing, storeQuoteSnapshot } from "../lib/resolvePricing";
import { recordLedgerEntry, applyBookingPriceAdjustment } from "../lib/bookingLedger";
import { normalizedGreylistKey } from "../lib/scopeReviewEngine";
import { getStripe } from "../lib/stripe";
import { isAddOnIncludedInPackage, getAddOn } from "@sweepr/utils";
import type { CleaningLevel, ServiceType } from "@sweepr/types";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

export const bookingsRouter = new Hono<AppBindings>();

const createSchema = z.object({
  serviceType: z.enum(["standard", "deep", "move_in_out", "recurring"]),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  sqft: z.number().int().min(100).max(20000),
  homeType: z.enum(["apartment", "house", "condo", "townhouse", "other"]),
  hasPets: z.boolean().default(false),
  heavyMess: z.boolean().default(false),
  suppliesNeeded: z.boolean().default(false),
  parkingNotes: z.string().max(500).optional(),
  entryNotes: z.string().max(500).optional(),
  addOnKeys: z.array(z.string().max(50)).max(20).default([]),
  scheduledAt: z.string().datetime(),
  // Optional 2-hour arrival window ("HH:MM", 24h) chosen from
  // GET /cleaners/availability-slots. When present, scheduledAt's date is
  // combined with arrivalWindowStart as the authoritative arrival instant and
  // both bounds are persisted so cleaners/customers see the window. Absent
  // entirely for backward compat with clients that book an exact time.
  arrivalWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  arrivalWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  addressId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  // Customer-declared cleaning level drives the scope-review level surcharge.
  // Defaults to 'refresh' (no surcharge) for backward compatibility with
  // clients that predate the level picker.
  cleaningLevel: z
    .enum(["refresh", "extra_attention", "significant_attention"])
    .default("refresh"),
  // Room-by-room condition selections (Clean My Home flow). When present these
  // drive the authoritative price via the room-condition engine, superseding
  // the service-type + cleaning-level model.
  rooms: z
    .array(
      z.object({
        roomType: z.enum(["kitchen", "bathroom", "bedroom", "living_room"]),
        level: z.enum(["level_1", "level_2", "level_3", "level_4"]),
      }),
    )
    .max(8)
    .optional(),
  // Client must NOT submit prices — server always calculates.
});

type CreateInput = z.infer<typeof createSchema>;

/**
 * Authoritative room-condition pricing (Clean My Home flow). Returns null when
 * the client didn't send room selections (legacy clients / other flows).
 * Money in cents; config comes from the admin Cleaning Pricing page.
 */
async function roomConditionPricing(
  sql: ReturnType<typeof getDb>,
  input: CreateInput,
): Promise<{
  totalCents: number;
  baseCents: number;
  addOnsCents: number;
  feeCents: number;
  taxCents: number;
  lineItems: Array<{ label: string; cents: number }>;
} | null> {
  if (!input.rooms || input.rooms.length === 0) return null;
  const { loadHomeCleaningConfig } = await import("../lib/pricingConfig");
  const { calculateHomeCleaningPrice } = await import("@sweepr/utils");
  const cfg = await loadHomeCleaningConfig(sql);
  const homeType = input.homeType === "other" ? "house" : input.homeType;
  const result = calculateHomeCleaningPrice(
    {
      property: {
        homeType: homeType as never,
        sqft: input.sqft,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
      },
      rooms: input.rooms,
      addOnKeys: input.addOnKeys,
    },
    cfg,
  );
  const b = result.internalBreakdown;
  return {
    totalCents: b.totalCents,
    baseCents: b.baseFeeCents,
    addOnsCents: b.addOnsCents,
    // Rounding delta rides with the service fee so line totals reconcile.
    feeCents: b.feeCents + b.roundingDeltaCents,
    taxCents: b.taxCents,
    lineItems: b.lineItems.map((li) => ({ label: li.label, cents: li.amountCents })),
  };
}

/**
 * Load the level-surcharge percentages from site_settings (TEXT key/value).
 * refresh is always 0%. Missing/invalid rows fall back to the migration
 * defaults so pricing never silently drops the surcharge.
 */
async function loadLevelSurchargePcts(
  sql: ReturnType<typeof getDb>,
): Promise<{ extra_attention: number; significant_attention: number }> {
  const rows = (await sql`
    SELECT key, value FROM site_settings
    WHERE key IN (
      'scope_review.level_surcharge_extra_attention_pct',
      'scope_review.level_surcharge_significant_attention_pct'
    )
  `) as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const extra = map.get("scope_review.level_surcharge_extra_attention_pct");
  const sig = map.get("scope_review.level_surcharge_significant_attention_pct");
  return {
    extra_attention: Number.isFinite(extra) ? (extra as number) : 15,
    significant_attention: Number.isFinite(sig) ? (sig as number) : 35,
  };
}

/** Surcharge in cents for a given level, computed on the pre-surcharge total. */
function computeLevelSurchargeCents(
  level: CleaningLevel,
  baseTotalCents: number,
  pcts: { extra_attention: number; significant_attention: number },
): number {
  const pct =
    level === "extra_attention"
      ? pcts.extra_attention
      : level === "significant_attention"
        ? pcts.significant_attention
        : 0;
  return Math.round((baseTotalCents * pct) / 100);
}

/** True if `err` is the unique-violation from migration 062's dedupe index. */
function isDuplicateBookingViolation(err: unknown): boolean {
  // The Neon serverless driver often wraps the underlying Postgres error and
  // exposes code/constraint on a nested `.cause`, so walk the chain (up to 5
  // deep) rather than only inspecting the top-level error — otherwise a real
  // duplicate-slot conflict is not recognized and surfaces as a 500.
  let cur: unknown = err;
  for (let depth = 0; cur != null && depth < 5; depth++) {
    const e = cur as { code?: string; constraint?: string; message?: string; cause?: unknown };
    if (e.constraint === "uq_bookings_customer_slot_active") return true;
    if (/uq_bookings_customer_slot_active/.test(e.message ?? "")) return true;
    cur = e.cause;
  }
  return false;
}

// Customers may only cancel via the status endpoint.
const statusSchema = z.object({
  status: z.enum(["cancelled_by_customer"]),
});

bookingsRouter.use("*", requireAuth);

bookingsRouter.post(
  "/",
  rateLimit({ limit: 10, windowMs: 60 * 60_000, keyPrefix: "booking-create" }),
  zValidator("json", createSchema),
  async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = (await getUserByClerkId(sql, authUser.clerkId)) ??
    await upsertUser(sql, { clerkId: authUser.clerkId, email: authUser.email || `${authUser.clerkId}@noemail.sweepr.local`, role: "customer" });
  await sql`INSERT INTO customers (user_id) SELECT ${user.id} WHERE NOT EXISTS (SELECT 1 FROM customers WHERE user_id = ${user.id})`;
  const customer = await getCustomerByUserId(sql, user.id);
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  // Account-status gate: suspended/banned customers may not book. Lazily reset a
  // suspension whose window has elapsed (suspended → normal) before deciding.
  const statusRows = (await sql`
    SELECT account_status, account_status_until FROM customers WHERE id = ${customer.id} LIMIT 1
  `) as Array<{ account_status: string | null; account_status_until: string | null }>;
  const acct = statusRows[0];
  let accountStatus = acct?.account_status ?? "normal";
  if (
    accountStatus === "suspended" &&
    acct?.account_status_until &&
    new Date(acct.account_status_until).getTime() <= Date.now()
  ) {
    await sql`
      UPDATE customers SET account_status = 'normal', account_status_until = NULL,
        account_status_reason = NULL, updated_at = NOW() WHERE id = ${customer.id}
    `;
    accountStatus = "normal";
  }
  if (accountStatus === "suspended" || accountStatus === "banned") {
    return c.json(
      { error: "account_restricted", message: "Your account is not able to book at this time. Please contact support." },
      403,
    );
  }

  // Address greylist gate (unit-aware normalized key). Generic message — never
  // reveal that an address is greylisted.
  if (input.addressId) {
    // IDOR guard: the address MUST belong to this customer's user. Without this
    // a customer could book a cleaner to another user's address by guessing its
    // id. Scope the lookup by user_id (same pattern customerProfile uses).
    const addrRows = (await sql`
      SELECT street, unit, zip FROM addresses
      WHERE id = ${input.addressId} AND user_id = ${user.id} LIMIT 1
    `) as Array<{ street: string | null; unit: string | null; zip: string | null }>;
    if (!addrRows[0]) {
      return c.json({ error: "invalid_address", message: "That address isn't on your account." }, 400);
    }
    const addr = addrRows[0];
    if (addr?.street && addr?.zip) {
      const key = normalizedGreylistKey(addr.street, addr.unit, addr.zip);
      const greylisted = (await sql`
        SELECT 1 FROM address_greylist
        WHERE normalized_key = ${key} AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1
      `) as Array<{ "?column?": number }>;
      if (greylisted[0]) {
        return c.json({ error: "address_unavailable", message: "We're unable to service this address." }, 403);
      }
    }
  }

  // Add-on / package integrity: never bill for an add-on that is already
  // included in the selected package's scope (would be duplicate billing).
  const includedDupes = input.addOnKeys.filter((key) =>
    isAddOnIncludedInPackage(key, input.serviceType as ServiceType),
  );
  if (includedDupes.length > 0) {
    return c.json(
      {
        error: "addon_included_in_package",
        message: `These add-ons are already included in the ${input.serviceType} package and cannot be added: ${includedDupes.join(", ")}`,
      },
      400,
    );
  }

  // Server-side price calculation — client values are never trusted.
  // Precedence: room-condition engine (Clean My Home flow, when `rooms` sent)
  // → active algorithmic pricing rule → legacy calculator.
  const roomPrice = await roomConditionPricing(sql, input);
  const price = calculateBookingPrice(input);
  let resolved = null;
  if (!roomPrice) {
    try {
      resolved = await resolveBookingPricing(sql, input);
    } catch (err) {
      logger.error("resolveBookingPricing failed", err, {});
    }
  }
  const baseTotalPrice = roomPrice
    ? roomPrice.totalCents
    : resolved
      ? resolved.breakdown.customer_total_cents
      : price.totalPrice;
  const basePrice = roomPrice ? roomPrice.baseCents : resolved ? resolved.breakdown.base_fee_cents : price.basePrice;
  const addonsTotal = roomPrice ? roomPrice.addOnsCents : resolved ? resolved.breakdown.add_ons_total_cents : price.addonsTotal;
  const cleanerPayout = resolved ? resolved.breakdown.estimated_cleaner_payout_cents : null;

  // Cleaning-level surcharge (scope review). The room-condition engine prices
  // per-room conditions directly, so the level surcharge only applies to the
  // legacy/rule paths — applying both would double-charge for dirtiness.
  const levelPcts = await loadLevelSurchargePcts(sql);
  const levelSurchargeCents = roomPrice
    ? 0
    : computeLevelSurchargeCents(input.cleaningLevel, baseTotalPrice, levelPcts);
  const totalPrice = baseTotalPrice + levelSurchargeCents;

  // When an arrival window was chosen, the scheduled instant is the booked
  // date combined with the window's start time (UTC, matching how the rest
  // of the matching/availability code reads scheduled_at). Falls back to the
  // client-provided exact scheduledAt when no window is supplied, preserving
  // full backward compatibility with older clients.
  let effectiveScheduledAt = input.scheduledAt;
  if (input.arrivalWindowStart) {
    const datePart = new Date(input.scheduledAt).toISOString().slice(0, 10);
    effectiveScheduledAt = `${datePart}T${input.arrivalWindowStart}:00.000Z`;
  }

  // Duplicate-submit guard: a partial unique index on
  // (customer_id, address_id, scheduled_at) for non-terminal bookings (see
  // migration 062) makes a double-click's second INSERT fail with 23505
  // instead of silently creating a second booking (and, downstream, a second
  // PaymentIntent). On that race we return the booking the first request just
  // created rather than erroring the customer's screen.
  let created: BookingRow | undefined;
  try {
    const rows = (await sql`
      INSERT INTO bookings (
        customer_id, address_id, status, service_type, bedrooms, bathrooms,
        sqft, home_type, scheduled_at, base_price, addons_total, service_fee,
        tax, total_price, notes, cleaning_level, cleaning_level_surcharge_cents,
        pricing_rule_id, pricing_rule_version, pricing_line_items_json, estimated_cleaner_payout_cents,
        arrival_window_start, arrival_window_end
      ) VALUES (
        ${customer.id}, ${input.addressId ?? null}, 'booked', ${input.serviceType},
        ${input.bedrooms}, ${input.bathrooms}, ${input.sqft}, ${input.homeType},
        ${effectiveScheduledAt}, ${basePrice}, ${addonsTotal},
        ${roomPrice ? roomPrice.feeCents : resolved ? 0 : price.serviceFee},
        ${roomPrice ? roomPrice.taxCents : resolved ? 0 : price.tax}, ${totalPrice}, ${input.notes ?? null},
        ${input.cleaningLevel}, ${levelSurchargeCents},
        ${resolved ? resolved.ruleId : null}, ${resolved ? resolved.ruleVersion : null},
        ${roomPrice
          ? JSON.stringify([...roomPrice.lineItems, { label: "rooms", rooms: input.rooms }])
          : resolved
            ? JSON.stringify(resolved.breakdown.line_items)
            : null}, ${cleanerPayout},
        ${input.arrivalWindowStart ?? null}, ${input.arrivalWindowEnd ?? null}
      ) RETURNING *
    `) as BookingRow[];
    created = rows[0];
  } catch (err) {
    if (!isDuplicateBookingViolation(err)) throw err;
    // Look up the row the concurrent (winning) request created. In a true
    // simultaneous double-submit the winner may not have COMMITTED yet when we
    // get here, so its row isn't visible on this connection — retry a few times
    // with a short backoff instead of surfacing a 500 to the customer.
    let existingRows = [] as BookingRow[];
    for (let attempt = 0; attempt < 4; attempt++) {
      existingRows = (await sql`
        SELECT * FROM bookings
        WHERE customer_id = ${customer.id}
          AND COALESCE(address_id, '00000000-0000-0000-0000-000000000000') = COALESCE(${input.addressId ?? null}, '00000000-0000-0000-0000-000000000000')
          AND scheduled_at = ${effectiveScheduledAt}
          AND status NOT IN ('cancelled_by_customer', 'cancelled_by_cleaner', 'cancelled', 'refunded')
        LIMIT 1
      `) as BookingRow[];
      if (existingRows[0]) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    if (existingRows[0]) {
      // The customer resubmitted for the same slot with (possibly) new room
      // conditions / add-ons. Refresh the existing draft's pricing to the freshly
      // computed values so the amount create-intent charges (booking.total_price)
      // always matches the review-step quote — never a stale earlier total.
      // Only safe while the booking hasn't been paid/confirmed yet.
      if (existingRows[0].status === "booked") {
        const refreshed = (await sql`
          UPDATE bookings SET
            service_type = ${input.serviceType},
            bedrooms = ${input.bedrooms}, bathrooms = ${input.bathrooms},
            sqft = ${input.sqft}, home_type = ${input.homeType},
            base_price = ${basePrice}, addons_total = ${addonsTotal},
            service_fee = ${roomPrice ? roomPrice.feeCents : resolved ? 0 : price.serviceFee},
            tax = ${roomPrice ? roomPrice.taxCents : resolved ? 0 : price.tax},
            total_price = ${totalPrice}, cleaning_level = ${input.cleaningLevel},
            cleaning_level_surcharge_cents = ${levelSurchargeCents},
            pricing_line_items_json = ${roomPrice
              ? JSON.stringify([...roomPrice.lineItems, { label: "rooms", rooms: input.rooms }])
              : resolved ? JSON.stringify(resolved.breakdown.line_items) : null},
            notes = ${input.notes ?? null}, updated_at = NOW()
          WHERE id = ${existingRows[0].id}
          RETURNING *
        `) as BookingRow[];
        return c.json({ booking: refreshed[0] ?? existingRows[0] }, 201);
      }
      return c.json({ booking: existingRows[0] }, 201);
    }
    throw err;
  }
  if (!created) return c.json({ error: "Failed to create booking" }, 500);

  // Seed the append-only price ledger with the itemized initial quote.
  try {
    await recordLedgerEntry(sql, {
      bookingId: created.id,
      eventType: "initial_quote",
      previousTotalCents: 0,
      adjustmentCents: totalPrice,
      newTotalCents: totalPrice,
      reason: `Initial quote (${input.cleaningLevel}); base ${baseTotalPrice}¢ + level surcharge ${levelSurchargeCents}¢`,
      source: "system",
    });
  } catch (err) {
    logger.error("initial_quote ledger write failed", err, { bookingId: created.id });
  }

  // Persist the immutable quote snapshot and stamp it on the booking.
  if (resolved) {
    try {
      const quoteId = await storeQuoteSnapshot(sql, resolved, { customerId: customer.id, bookingId: created.id });
      await sql`UPDATE bookings SET pricing_quote_id = ${quoteId} WHERE id = ${created.id}`;
    } catch (err) {
      logger.error("storeQuoteSnapshot failed", err, { bookingId: created.id });
    }
  }

  // Booking confirmed -> notify customer.
  await sendNotification(sql, user.id, {
    type: "booking_confirmed",
    title: "Booking confirmed",
    body: `Your ${input.serviceType} clean is booked. We're finding you a cleaner.`,
    data: { href: `/bookings/${created.id}` },
  });

  await audit(sql, {
    action: "booking.created",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking",
    targetId: created.id,
    metadata: { serviceType: input.serviceType, totalPrice: price.totalPrice },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  await serverTrack(c.env, "booking_confirmed", c.get("user").clerkId, {
    bookingId: created.id,
    serviceType: input.serviceType,
    totalPrice: price.totalPrice,
  });

  // Silent auto-assignment: rank cleaners and offer to the best match.
  try {
    await initiateAssignment(sql, created.id);
  } catch (err) {
    logger.error("initiateAssignment failed", err, { bookingId: created.id });
  }

  return c.json({ booking: created }, 201);
});

bookingsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  // Collapsed from 3 sequential round-trips (user -> customer -> bookings)
  // into a single JOIN; scoping is identical (bookings for the customer
  // owned by this clerk user), just resolved in one query.
  const bookings = (await sql`
    SELECT bookings.* FROM bookings
    JOIN customers ON customers.id = bookings.customer_id
    JOIN users ON users.id = customers.user_id
    WHERE users.clerk_id = ${c.get("user").clerkId}
    ORDER BY bookings.created_at DESC
  `) as BookingRow[];
  return c.json({ bookings });
});

/** Quote endpoint — returns server-calculated price without creating a booking. */
bookingsRouter.post("/quote", zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const catalogue = getAddOnCatalogue();
  const levelPcts = await loadLevelSurchargePcts(sql);

  // Room-condition engine (Clean My Home flow) — authoritative when rooms sent.
  // `total` (dollars) at the top level is what the review step displays; it must
  // match the total POST /bookings will charge for the same input.
  const roomPrice = await roomConditionPricing(sql, input);
  if (roomPrice) {
    return c.json({
      total: roomPrice.totalCents / 100,
      price: {
        totalPrice: roomPrice.totalCents,
        levelSurchargeCents: 0,
        lineItems: roomPrice.lineItems,
      },
      catalogue,
      engine: "rooms",
    });
  }

  try {
    const resolved = await resolveBookingPricing(sql, input);
    if (resolved) {
      // Algorithmic pricing active: expose only the customer total + line items.
      const baseTotal = resolved.breakdown.customer_total_cents;
      const levelSurchargeCents = computeLevelSurchargeCents(input.cleaningLevel, baseTotal, levelPcts);
      const lineItems = [
        ...resolved.breakdown.line_items,
        ...(levelSurchargeCents > 0
          ? [{ label: "Cleaning level surcharge", cents: levelSurchargeCents }]
          : []),
      ];
      return c.json({
        total: (baseTotal + levelSurchargeCents) / 100,
        price: {
          totalPrice: baseTotal + levelSurchargeCents,
          levelSurchargeCents,
          lineItems,
          requiresCustomQuote: resolved.breakdown.requires_custom_quote,
        },
        catalogue,
        engine: "rule",
      });
    }
  } catch {
    /* fall through to legacy */
  }
  const legacy = calculateBookingPrice(input);
  const levelSurchargeCents = computeLevelSurchargeCents(input.cleaningLevel, legacy.totalPrice, levelPcts);
  return c.json({
    total: (legacy.totalPrice + levelSurchargeCents) / 100,
    price: { ...legacy, levelSurchargeCents, totalPrice: legacy.totalPrice + levelSurchargeCents },
    catalogue,
    engine: "legacy",
  });
});

bookingsRouter.get("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const bookingId = c.req.param("id");
  const access = await assertBookingAccess(sql, bookingId, c.get("user").clerkId);
  if (!access.allowed) return c.json({ error: "Forbidden" }, 403);
  const booking = await getBooking(sql, bookingId);
  if (!booking) return c.json({ error: "Not found" }, 404);

  // Join address fields so the customer app can display the address.
  const addrRows = booking.address_id
    ? (await sql`
        SELECT street AS address_line1, city AS address_city, state AS address_state, zip AS address_zip
        FROM addresses WHERE id = ${booking.address_id} LIMIT 1
      `) as { address_line1: string; address_city: string; address_state: string; address_zip: string }[]
    : [];
  const addr = addrRows[0] ?? {};

  // Add-ons currently on the booking (drives the customer detail UI).
  const addonRows = (await sql`
    SELECT addon_key FROM booking_addons WHERE booking_id = ${bookingId}
  `) as Array<{ addon_key: string }>;
  const addon_keys = addonRows.map((r) => r.addon_key);

  return c.json({ booking: { ...booking, ...addr, addon_keys } });
});

bookingsRouter.patch(
  "/:id/status",
  zValidator("json", statusSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { status } = c.req.valid("json");

    const access = await assertBookingAccess(sql, id, c.get("user").clerkId);
    if (!access.allowed) return c.json({ error: "Forbidden" }, 403);

    const booking = await getBooking(sql, id);
    if (!booking) return c.json({ error: "Not found" }, 404);

    if (!isValidTransitionSafe(booking.status, status)) {
      return c.json(
        { error: `Invalid status transition: ${booking.status} → ${status}` },
        409
      );
    }

    const updated = await updateBookingStatus(sql, id, status);
    if (!updated) return c.json({ error: "Not found" }, 404);

    await audit(sql, {
      action: "booking.status_changed",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: id,
      metadata: { from: booking.status, to: status },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ booking: updated });
  }
);

function isValidTransitionSafe(from: string, to: string): boolean {
  try {
    assertValidTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

// Statuses at which a customer may still add services — i.e. before the cleaner
// has checked in / started the job.
const PRE_SERVICE_STATUSES = new Set([
  "draft",
  "quoted",
  "payment_pending",
  "booked",
  "matching",
  "offered_to_cleaner",
  "cleaner_accepted",
  "confirmed",
  "cleaner_on_the_way",
]);

const addAddonsSchema = z.object({
  addOnKeys: z.array(z.string().max(50)).min(1).max(20),
});

/**
 * Post-booking add-on purchase. The customer may add services any time before
 * the cleaner checks in (arrival_verified_at IS NULL and a pre-service status).
 * Prices are computed server-side from the add-on catalogue; the booking total
 * and Stripe authorization are updated via the price ledger.
 */
bookingsRouter.post(
  "/:id/addons",
  zValidator("json", addAddonsSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const bookingId = c.req.param("id");
    const { addOnKeys } = c.req.valid("json");

    // Ownership: only the booking's customer may add services. Collapsed the
    // user-lookup + customer-lookup into one JOIN (both prior paths returned
    // an identical 403 Forbidden on a miss, so this preserves semantics).
    const customerRows = (await sql`
      SELECT customers.id FROM users
      JOIN customers ON customers.user_id = users.id
      WHERE users.clerk_id = ${c.get("user").clerkId}
      LIMIT 1
    `) as Array<{ id: string }>;
    const customer = customerRows[0];
    if (!customer) return c.json({ error: "Forbidden" }, 403);

    const rows = (await sql`
      SELECT id, customer_id, service_type, status, arrival_verified_at, total_price, addons_total
      FROM bookings WHERE id = ${bookingId} LIMIT 1
    `) as Array<{
      id: string;
      customer_id: string;
      service_type: string;
      status: string;
      arrival_verified_at: string | null;
      total_price: number | null;
      addons_total: number | null;
    }>;
    const booking = rows[0];
    if (!booking) return c.json({ error: "Not found" }, 404);
    if (booking.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);

    // Job must not have started (cleaner has not checked in).
    if (booking.arrival_verified_at || !PRE_SERVICE_STATUSES.has(booking.status)) {
      return c.json(
        { error: "booking_already_started", message: "Services can no longer be added once your cleaner has checked in." },
        409,
      );
    }

    // De-dupe requested keys, validate catalogue membership + package overlap.
    const requested = Array.from(new Set(addOnKeys));
    const unknown = requested.filter((k) => !getAddOn(k));
    if (unknown.length > 0) {
      return c.json({ error: "unknown_addon", message: `Unknown add-ons: ${unknown.join(", ")}` }, 400);
    }
    const includedDupes = requested.filter((k) =>
      isAddOnIncludedInPackage(k, booking.service_type as ServiceType),
    );
    if (includedDupes.length > 0) {
      return c.json(
        {
          error: "addon_included_in_package",
          message: `These add-ons are already included in your package: ${includedDupes.join(", ")}`,
        },
        400,
      );
    }

    // Reject keys already on the booking. This is advisory only (surfaces a
    // friendly error in the common case) — the actual guarantee against
    // double-purchase is the unique (booking_id, addon_key) constraint
    // (migration 062) enforced by the guarded INSERT below.
    const existing = (await sql`
      SELECT addon_key FROM booking_addons WHERE booking_id = ${bookingId}
    `) as Array<{ addon_key: string }>;
    const existingKeys = new Set(existing.map((r) => r.addon_key));
    const already = requested.filter((k) => existingKeys.has(k));
    if (already.length > 0) {
      return c.json(
        { error: "addon_already_purchased", message: `Already added: ${already.join(", ")}` },
        409,
      );
    }

    // Insert each add-on atomically, re-checking the "not started yet" and
    // "not already purchased" invariants as part of the INSERT itself:
    //   - WHERE EXISTS (...) guards against a concurrent check-in (arrival
    //     verification) landing between our initial SELECT above and this
    //     write — the guard is evaluated against the row's live, committed
    //     state at INSERT time, not the stale snapshot we read earlier.
    //   - ON CONFLICT (booking_id, addon_key) DO NOTHING guards against a
    //     concurrent duplicate request for the same add-on key.
    // Only keys that actually got inserted are billed.
    const preServiceStatuses = Array.from(PRE_SERVICE_STATUSES);
    let adjustmentCents = 0;
    const addedKeys: string[] = [];
    for (const key of requested) {
      const addOn = getAddOn(key)!;
      const priceCents = Math.round(addOn.price * 100);
      const inserted = (await sql`
        INSERT INTO booking_addons (booking_id, addon_key, addon_name, price)
        SELECT ${bookingId}, ${key}, ${addOn.name}, ${priceCents}
        WHERE EXISTS (
          SELECT 1 FROM bookings
          WHERE id = ${bookingId}
            AND arrival_verified_at IS NULL
            AND status = ANY(${preServiceStatuses})
        )
        ON CONFLICT (booking_id, addon_key) DO NOTHING
        RETURNING addon_key
      `) as Array<{ addon_key: string }>;
      if (inserted[0]) {
        adjustmentCents += priceCents;
        addedKeys.push(key);
      }
    }

    if (addedKeys.length === 0) {
      // Nothing was actually inserted: either the job started (check-in raced
      // us) or every key was already purchased by a concurrent request.
      const recheck = (await sql`
        SELECT arrival_verified_at, status FROM bookings WHERE id = ${bookingId} LIMIT 1
      `) as Array<{ arrival_verified_at: string | null; status: string }>;
      const b = recheck[0];
      if (b && (b.arrival_verified_at || !PRE_SERVICE_STATUSES.has(b.status))) {
        return c.json(
          { error: "booking_already_started", message: "Services can no longer be added once your cleaner has checked in." },
          409,
        );
      }
      return c.json(
        { error: "addon_already_purchased", message: `Already added: ${requested.join(", ")}` },
        409,
      );
    }

    await sql`
      UPDATE bookings SET addons_total = ${(booking.addons_total ?? 0) + adjustmentCents}, updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
    const result = await applyBookingPriceAdjustment(sql, stripe, {
      bookingId,
      adjustmentCents,
      eventType: "addon_purchase",
      reason: `Customer added add-ons: ${addedKeys.join(", ")}`,
      source: "customer",
    });

    await audit(sql, {
      action: "booking.addons_added",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { addOnKeys: addedKeys, adjustmentCents, newTotal: result.newTotal },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({
      ok: true,
      addOnKeys: addedKeys,
      addedCents: adjustmentCents,
      previousTotal: result.previousTotal,
      newTotal: result.newTotal,
    });
  },
);

/** Helper: notify the customer that owns a booking. */
async function notifyBookingCustomer(
  sql: ReturnType<typeof getDb>,
  booking: BookingRow,
  payload: Parameters<typeof sendNotification>[2]
) {
  if (!booking.customer_id) return;
  const rows = (await sql`
    SELECT u.id FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ${booking.customer_id}
  `) as { id: string }[];
  if (rows[0]) await sendNotification(sql, rows[0].id, payload);
}

/** Helper: notify a cleaner by cleaner id. */
async function notifyCleaner(
  sql: ReturnType<typeof getDb>,
  cleanerId: string,
  payload: Parameters<typeof sendNotification>[2]
) {
  const rows = (await sql`
    SELECT user_id FROM cleaners WHERE id = ${cleanerId}
  `) as { user_id: string }[];
  if (rows[0]) await sendNotification(sql, rows[0].user_id, payload);
}

/**
 * Run the matching engine, create offers for the top 3 cleaners, and notify
 * the top-ranked cleaner. Admin or system triggered.
 */
bookingsRouter.post("/:id/match", requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const bookingId = c.req.param("id");
  const booking = (await getBooking(sql, bookingId)) as BookingRow | null;
  if (!booking) return c.json({ error: "Not found" }, 404);

  // Canonical assignment engine (assignment_queue). The old body inserted into
  // a dead `job_offers` table with columns that never existed and would 500.
  await initiateAssignment(sql, bookingId);
  const queue = (await sql`
    SELECT cleaner_id, position, status, score
    FROM assignment_queue WHERE booking_id = ${bookingId}
    ORDER BY position ASC
  `) as Array<{ cleaner_id: string; position: number; status: string; score: number | null }>;
  if (queue.length === 0) return c.json({ error: "No eligible cleaners" }, 409);
  return c.json({ ok: true, offers: queue });
});

const respondSchema = z.object({
  response: z.enum(["accepted", "declined"]),
});

/**
 * Cleaner responds to a job offer. Delegates to the canonical assignment
 * engine (assignment_queue via handleOfferResponse); ownership is verified
 * against the offer's cleaner before acting.
 */
bookingsRouter.post(
  "/:id/offers/:offerId/respond",
  zValidator("json", respondSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const bookingId = c.req.param("id");
    const offerId = c.req.param("offerId");
    const { response } = c.req.valid("json");

    const offerRows = (await sql`
      SELECT cleaner_id, status FROM assignment_queue
      WHERE id = ${offerId} AND booking_id = ${bookingId} LIMIT 1
    `) as { cleaner_id: string; status: string }[];
    const offer = offerRows[0];
    if (!offer) return c.json({ error: "Offer not found" }, 404);

    // Verify the requesting user owns this offer's cleaner row.
    const user = await getUserByClerkId(sql, c.get("user").clerkId);
    if (!user) return c.json({ error: "Forbidden" }, 403);
    const cleanerRows = (await sql`
      SELECT id FROM cleaners WHERE id = ${offer.cleaner_id} AND user_id = ${user.id} LIMIT 1
    `) as { id: string }[];
    if (cleanerRows.length === 0) return c.json({ error: "Forbidden" }, 403);

    await handleOfferResponse(sql, bookingId, offer.cleaner_id, response);
    return c.json({ ok: true });
  }
);
