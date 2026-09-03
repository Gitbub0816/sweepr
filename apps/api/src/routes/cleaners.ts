/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCleanerByUserId, getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { handleOfferResponse } from "../lib/assignment";
import { requireAuth } from "../middleware/auth";
import { grantSmsConsent } from "../lib/smsConsent";
import { checkInsurance } from "../lib/cleanerRequirements";
import { sendSms, SMS_MESSAGES } from "../lib/sms";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";
import type { Context } from "hono";

/** Resolve the current user's cleaner row, or null. */
async function currentCleaner(c: Context<AppBindings>) {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return { sql, user: null, cleaner: null };
  const cleaner = await getCleanerByUserId(sql, user.id);
  return { sql, user, cleaner };
}

export const cleanersRouter = new Hono<AppBindings>();

cleanersRouter.use("*", requireAuth);

cleanersRouter.get("/me", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);
  const cleaner = await getCleanerByUserId(sql, user.id);
  return c.json({ cleaner });
});

/**
 * Onboarding progress — server-authoritative completion of each onboarding
 * step. Safe to call before a cleaner row exists (everything reports false).
 * Drives the dashboard checklist so cleaners can complete steps individually.
 */
cleanersRouter.get("/onboarding-progress", async (c) => {
  const { user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);

  const ch = cleaner as
    | {
        first_name?: string | null;
        bio?: string | null;
        yardstik_status?: string | null;
        didit_status?: string | null;
        required_training_completed?: boolean | null;
        status?: string | null;
      }
    | null;

  const profile = Boolean(ch?.first_name && ch?.bio);
  const training = Boolean(ch?.required_training_completed);
  const background = ch?.yardstik_status === "clear";
  const identity = ch?.didit_status === "approved";
  const submitted = ch?.status === "pending" || ch?.status === "approved";
  const approved = ch?.status === "approved";

  // Validated insurance: the cleaner's own policy, approved and unexpired.
  // Mirrors the server-side job-accept enforcement.
  let insurance = false;
  const cleanerId = (cleaner as { id?: string } | null)?.id;
  if (cleanerId) {
    const sql = getDb(c.env.DATABASE_URL);
    insurance = (await checkInsurance(sql, cleanerId)).valid;
  }

  // Normalize the DB status into the vocabulary the cleaner app's guard and
  // dashboard checklist speak: incomplete | pending_review | approved. The DB
  // stores a submitted-but-unreviewed application as 'pending', which the UI
  // was mis-reading as "incomplete" (showing the locked/finish-setup screen to
  // a cleaner whose application is actually under review).
  const normalizedStatus = approved
    ? "approved"
    : submitted
      ? "pending_review"
      : "incomplete";

  return c.json({
    status: normalizedStatus,
    steps: { profile, training, background, identity, insurance, submitted, approved },
  });
});

const profileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  bio: z.string().max(5000).optional(),
  avatarUrl: z.string().url().max(512).optional(),
});

cleanersRouter.patch("/me", zValidator("json", profileSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = (await sql`
    UPDATE cleaners SET
      first_name = COALESCE(${input.firstName ?? null}, first_name),
      last_name  = COALESCE(${input.lastName ?? null}, last_name),
      phone      = COALESCE(${input.phone ?? null}, phone),
      bio        = COALESCE(${input.bio ?? null}, bio),
      avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url)
    WHERE user_id = ${user.id}
    RETURNING id, first_name, last_name, phone, bio, avatar_url, status
  `) as unknown[];

  return c.json({ cleaner: rows[0] ?? null });
});

// ---------------------------------------------------------------------------
// Stripe Connect (Express) payouts
// ---------------------------------------------------------------------------

/** Create an Express connected account + onboarding link. */
cleanersRouter.post("/stripe-connect/onboard", async (c) => {
  const { sql, user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  let connectId = cleaner?.stripe_connect_id ?? null;
  if (!connectId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
    });
    connectId = account.id;
    await sql`
      UPDATE cleaners SET stripe_connect_id = ${connectId} WHERE user_id = ${user.id}
    `;
  }

  const base = c.env.CUSTOMER_URL ?? "https://app.getsweepr.com";
  const link = await stripe.accountLinks.create({
    account: connectId,
    refresh_url: `${base}/cleaner/stripe-refresh`,
    return_url: `${base}/cleaner/stripe-return`,
    type: "account_onboarding",
  });

  return c.json({ url: link.url });
});

/** Regenerate an expired onboarding link. */
cleanersRouter.post("/stripe-connect/refresh", async (c) => {
  const { user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!cleaner?.stripe_connect_id) {
    return c.json({ error: "No connected account" }, 400);
  }
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const base = c.env.CUSTOMER_URL ?? "https://app.getsweepr.com";
  const link = await stripe.accountLinks.create({
    account: cleaner.stripe_connect_id,
    refresh_url: `${base}/cleaner/stripe-refresh`,
    return_url: `${base}/cleaner/stripe-return`,
    type: "account_onboarding",
  });
  return c.json({ url: link.url });
});

/** Check connected-account status. */
cleanersRouter.get("/stripe-connect/status", async (c) => {
  const { user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!cleaner?.stripe_connect_id) {
    return c.json({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
  }
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const account = await stripe.accounts.retrieve(cleaner.stripe_connect_id);
  return c.json({
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  });
});

// ---------------------------------------------------------------------------
// Onboarding: background check, identity verification, application submit
// ---------------------------------------------------------------------------

// Background check is handled via the Yardstik report flow at /yardstik/invite.
// Candidates enter all PII directly on Yardstik's hosted form — no PII reaches
// Sweepr servers.  This stub is intentionally removed.

const identitySchema = z.object({
  provider: z.string().default("didit"),
});

cleanersRouter.post(
  "/identity-verify",
  zValidator("json", identitySchema),
  async (c) => {
    const { sql, user, cleaner } = await currentCleaner(c);
    if (!user) return c.json({ error: "User not found" }, 404);

    // Create a hosted Didit verification session. Document/biometric capture
    // happens entirely on Didit — no ID images or PII reach Sweepr. When Didit
    // is unconfigured this returns a stub session and falls back to manual
    // admin review.
    const { diditClient } = await import("../lib/didit");
    const client = diditClient(c.env);
    const workflow = cleaner?.account_type === "business" ? "business" : "personal";
    const session = await client.createSession({
      workflow,
      vendorData: user.id,
      callbackUrl: "https://api.getsweepr.com/webhooks/didit",
    });

    const status = session.stub ? "in_review" : "pending";
    await sql`
      UPDATE cleaners
      SET didit_verification_id = ${session.session_id},
          didit_status          = ${status}
      WHERE user_id = ${user.id}
    `;

    // Only the hosted URL crosses the wire — never Didit credentials.
    return c.json({
      didit_status: status,
      url: session.url,
      sessionId: session.session_id,
      stub: session.stub,
    });
  }
);

const applySchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  // The profile photo is optional; the client may send "" or null when skipped.
  // Coerce those to undefined so an empty value doesn't fail url() validation
  // and block an otherwise-valid application.
  avatarUrl: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.string().url().max(512).optional(),
  ),
  basedIn: z.string().optional(),
  radiusMi: z.number().optional(),
  services: z.array(z.string()).optional(),
  // Canonical job-type preferences (migration 107): which of the three
  // canonical types the cleaner accepts. At least one required when provided;
  // omitted = all types accepted (the column default).
  acceptedJobTypes: z
    .array(z.enum(["standard", "move_in_out", "vacation_rental"]))
    .min(1)
    .max(3)
    .optional(),
  addOns: z.array(z.string()).optional(),
  availability: z.record(z.string()).optional(),
  // Explicit SMS opt-in from the (never pre-checked) onboarding checkbox.
  smsOptIn: z.boolean().optional(),
});

cleanersRouter.post("/apply", zValidator("json", applySchema), async (c) => {
  const input = c.req.valid("json");
  const { sql, user } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);

  const [firstName, ...rest] = (input.fullName ?? "").split(" ");
  const lastName = rest.join(" ");
  const existing = await getCleanerByUserId(sql, user.id);

  if (existing) {
    await sql`
      UPDATE cleaners SET
        first_name = COALESCE(${firstName || null}, first_name),
        last_name  = COALESCE(${lastName || null}, last_name),
        phone      = COALESCE(${input.phone ?? null}, phone),
        bio        = COALESCE(${input.bio ?? null}, bio),
        avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url),
        accepted_job_types = COALESCE(${input.acceptedJobTypes ?? null}, accepted_job_types),
        status     = 'pending'
      WHERE user_id = ${user.id}
    `;
  } else {
    await sql`
      INSERT INTO cleaners (user_id, first_name, last_name, phone, bio, avatar_url, accepted_job_types, status)
      VALUES (
        ${user.id}, ${firstName || null}, ${lastName || null},
        ${input.phone ?? null}, ${input.bio ?? null}, ${input.avatarUrl ?? null},
        ${input.acceptedJobTypes ?? ["standard", "move_in_out", "vacation_rental"]},
        'pending'
      )
    `;
  }

  // Consent is stored in the same request as the application (atomic with
  // account setup) but is NOT required — applicants may decline.
  if (input.smsOptIn === true) {
    await grantSmsConsent(sql, user.id, {
      source: "onboarding",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
      phone: input.phone ?? null,
    });
    if (input.phone) {
      try {
        await sendSms(c.env, sql, {
          userId: user.id, to: input.phone,
          type: "consent_confirmation", body: SMS_MESSAGES.optInConfirmation,
        });
      } catch { /* non-fatal */ }
    }
  }

  return c.json({ ok: true, status: "pending_review" });
});

// ---------------------------------------------------------------------------
// Business cleaner application (KYB via Stripe Connect)
// ---------------------------------------------------------------------------

const businessApplySchema = z.object({
  businessName: z.string().min(2).max(200),
  businessType: z.string().min(2).max(40),
  // EIN itself is NEVER accepted here — only a boolean that it was provided.
  einProvided: z.literal(true),
  stateOfIncorporation: z.string().min(2).max(60),
  authorizedRep: z.object({
    name: z.string().min(2).max(200),
    title: z.string().max(80),
    email: z.string().email(),
    // DOB and address are collected directly by Yardstik — never by Sweepr.
  }),
  serviceTypes: z.array(z.string()).optional(),
  // Canonical job-type preferences (see applySchema.acceptedJobTypes).
  acceptedJobTypes: z
    .array(z.enum(["standard", "move_in_out", "vacation_rental"]))
    .min(1)
    .max(3)
    .optional(),
  addOnKeys: z.array(z.string()).optional(),
  availability: z.record(z.string()).optional(),
  // Explicit SMS opt-in from the (never pre-checked) onboarding checkbox.
  smsOptIn: z.boolean().optional(),
});

cleanersRouter.post(
  "/business/apply",
  zValidator("json", businessApplySchema),
  async (c) => {
    const input = c.req.valid("json");
    const { sql, user } = await currentCleaner(c);
    if (!user) return c.json({ error: "User not found" }, 404);

    const [firstName, ...rest] = input.authorizedRep.name.split(" ");
    const lastName = rest.join(" ");
    const existing = await getCleanerByUserId(sql, user.id);

    // Create a business Stripe Connect (Express) account for KYB + payouts.
    let connectId = existing?.stripe_connect_id ?? null;
    try {
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      const account = await stripe.accounts.create({
        type: "express",
        business_type: "company",
        company: { name: input.businessName },
        metadata: { account_type: "business" },
      });
      connectId = account.id;
    } catch {
      // Stripe creation is best-effort here; KYB stays pending until completed.
    }

    // NOTE: EIN is never stored — only ein_provided + kyb_status are persisted.
    if (existing) {
      await sql`
        UPDATE cleaners SET
          first_name = COALESCE(${firstName || null}, first_name),
          last_name  = COALESCE(${lastName || null}, last_name),
          account_type = 'business',
          business_name = ${input.businessName},
          business_type = ${input.businessType},
          state_of_incorporation = ${input.stateOfIncorporation},
          authorized_rep_name = ${input.authorizedRep.name},
          authorized_rep_title = ${input.authorizedRep.title},
          ein_provided = true,
          kyb_status = 'pending',
          stripe_connect_id = COALESCE(${connectId}, stripe_connect_id),
          accepted_job_types = COALESCE(${input.acceptedJobTypes ?? null}, accepted_job_types),
          status = 'pending'
        WHERE user_id = ${user.id}
      `;
    } else {
      await sql`
        INSERT INTO cleaners (
          user_id, first_name, last_name, account_type, business_name,
          business_type, state_of_incorporation, authorized_rep_name,
          authorized_rep_title, ein_provided, kyb_status, stripe_connect_id,
          accepted_job_types, status
        ) VALUES (
          ${user.id}, ${firstName || null}, ${lastName || null}, 'business',
          ${input.businessName}, ${input.businessType},
          ${input.stateOfIncorporation}, ${input.authorizedRep.name},
          ${input.authorizedRep.title}, true, 'pending', ${connectId},
          ${input.acceptedJobTypes ?? ["standard", "move_in_out", "vacation_rental"]}, 'pending'
        )
      `;
    }

    // Consent is stored in the same request as the application (atomic with
    // account setup) but is NOT required — applicants may decline.
    if (input.smsOptIn === true) {
      await grantSmsConsent(sql, user.id, {
        source: "onboarding",
        ip: c.req.header("CF-Connecting-IP") ?? null,
        userAgent: c.req.header("User-Agent") ?? null,
      });
    }

    // Trigger a Yardstik background check report for the authorized rep.
    // DOB, SSN, and address are collected directly by Yardstik's hosted form.
    const { yardstikClient } = await import("../lib/yardstik");
    const client = yardstikClient(c.env);
    const repParts = input.authorizedRep.name.split(" ");
    const repFirst = repParts[0];
    const repLast = repParts.slice(1).join(" ") || repFirst;
    const repRows = (await sql`SELECT id FROM cleaners WHERE user_id = ${user.id} LIMIT 1`) as { id: string }[];
    const repCleanerId = repRows[0]?.id;
    const candidate = await client.createCandidate(
      input.authorizedRep.email,
      repFirst,
      repLast,
      repCleanerId
    );
    const report = await client.createReport(candidate.id, repCleanerId);
    await sql`
      UPDATE cleaners
      SET yardstik_candidate_id = ${candidate.id},
          yardstik_report_id    = ${report.id},
          yardstik_status       = 'invited',
          yardstik_invited_at   = NOW()
      WHERE user_id = ${user.id}
    `;

    return c.json({
      ok: true,
      status: "pending_review",
      kyb_status: "pending",
      account_type: "business",
      backgroundCheck: {
        invitationUrl: report.applyUrl,
        expiresAt: report.expiresAt,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// Job offers (assignment queue)
// ---------------------------------------------------------------------------

const offerRespondSchema = z.object({
  response: z.enum(["accepted", "declined"]),
});

cleanersRouter.post(
  "/offers/:offerId/respond",
  zValidator("json", offerRespondSchema),
  async (c) => {
    const { sql, cleaner } = await currentCleaner(c);
    if (!cleaner) return c.json({ error: "Cleaner not found" }, 404);
    const { response } = c.req.valid("json");
    const offerId = c.req.param("offerId");

    const offerRows = (await sql`
      SELECT * FROM assignment_queue
      WHERE id = ${offerId} AND cleaner_id = ${cleaner.id}
      LIMIT 1
    `) as { id: string; booking_id: string; status: string }[];
    const offer = offerRows[0];
    if (!offer) return c.json({ error: "Offer not found" }, 404);
    if (offer.status !== "pending") {
      return c.json({ error: "Offer is no longer active" }, 409);
    }

    await handleOfferResponse(sql, offer.booking_id, cleaner.id, response);
    return c.json({ ok: true, response });
  }
);

// ---------------------------------------------------------------------------
// Availability-aware 2-hour arrival-window slots for a given date.
// Contract consumed by the customer booking wizard.
// ---------------------------------------------------------------------------

const SLOT_WINDOWS: Array<{ start: string; end: string }> = [
  { start: "08:00", end: "10:00" },
  { start: "10:00", end: "12:00" },
  { start: "12:00", end: "14:00" },
  { start: "14:00", end: "16:00" },
  { start: "16:00", end: "18:00" },
  { start: "18:00", end: "20:00" },
];

function slotLabel(start: string, end: string): string {
  const fmt = (t: string) => {
    const [hStr, mStr] = t.split(":");
    const h = Number(hStr);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mStr} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

const availabilitySlotsQuery = z.object({
  date: z.string().optional(),
  zip: z.string().max(20).optional(),
});

cleanersRouter.get(
  "/availability-slots",
  zValidator("query", availabilitySlotsQuery, (result, c) => {
    // Never 500 on a bad query shape — fall through to the handler's own
    // validation so we can still return a well-formed "no slots" response.
    if (!result.success) return c.json({ date: null, slots: [] });
  }),
  async (c) => {
    const { date, zip } = c.req.valid("query");

    const emptyResponse = (d: string | null) =>
      c.json({
        date: d,
        slots: SLOT_WINDOWS.map((w) => ({
          start: w.start,
          end: w.end,
          label: slotLabel(w.start, w.end),
          available: false,
        })),
      });

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return emptyResponse(date ?? null);
    }
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return emptyResponse(date);
    }
    const dayOfWeek = parsed.getUTCDay();

    try {
      const sql = getDb(c.env.DATABASE_URL);

      // Best-effort zip -> approximate lat/lng, for the optional service-area
      // check. If we can't resolve it, we simply skip the zip filter rather
      // than failing the request.
      let zipLat: number | null = null;
      let zipLng: number | null = null;
      if (zip) {
        const addrRows = (await sql`
          SELECT lat, lng FROM addresses WHERE zip = ${zip} AND lat IS NOT NULL AND lng IS NOT NULL LIMIT 1
        `) as Array<{ lat: string | number; lng: string | number }>;
        if (addrRows[0]) {
          zipLat = Number(addrRows[0].lat);
          zipLng = Number(addrRows[0].lng);
        }
      }

      // Unified read model: weekly blocks + flexible one-offs − blocked dates
      // (see lib/availability.ts) so hours set on EITHER cleaner screen count.
      const { getAvailabilityForDate } = await import("../lib/availability");
      const availRows = await getAvailabilityForDate(sql, date);

      if (availRows.length === 0) return emptyResponse(date);

      let serviceAreaByCleaner: Map<string, Array<{ center_lat: number; center_lng: number; radius_miles: number }>> | null = null;
      if (zip && zipLat !== null && zipLng !== null) {
        const cleanerIds = Array.from(new Set(availRows.map((r) => r.cleaner_id)));
        const areaRows = (await sql`
          SELECT cleaner_id, center_lat, center_lng, radius_miles
          FROM cleaner_service_areas
          WHERE cleaner_id = ANY(${cleanerIds})
        `) as Array<{ cleaner_id: string; center_lat: string | number | null; center_lng: string | number | null; radius_miles: number | null }>;
        // Only apply the zip filter if service areas actually exist for any
        // candidate; otherwise every cleaner "serves everywhere" (soft rule).
        if (areaRows.length > 0) {
          serviceAreaByCleaner = new Map();
          for (const r of areaRows) {
            if (r.center_lat == null || r.center_lng == null) continue;
            const list = serviceAreaByCleaner.get(r.cleaner_id) ?? [];
            list.push({
              center_lat: Number(r.center_lat),
              center_lng: Number(r.center_lng),
              radius_miles: r.radius_miles ?? 15,
            });
            serviceAreaByCleaner.set(r.cleaner_id, list);
          }
        }
      }

      const { haversineDistance } = await import("../lib/haversine");

      function cleanerServesZip(cleanerId: string): boolean {
        if (!serviceAreaByCleaner) return true; // no zip filter in effect
        const areas = serviceAreaByCleaner.get(cleanerId);
        // Soft rule: a cleaner with no service-area rows configured is treated
        // as serving everywhere, same as the assignment-time eligibility rule.
        if (!areas || areas.length === 0) return true;
        return areas.some(
          (a) => haversineDistance(zipLat as number, zipLng as number, a.center_lat, a.center_lng) <= a.radius_miles
        );
      }

      const timeToMinutes = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };

      const slots = SLOT_WINDOWS.map((w) => {
        const windowStart = timeToMinutes(w.start);
        const windowEnd = timeToMinutes(w.end);
        const available = availRows.some((r) => {
          if (!cleanerServesZip(r.cleaner_id)) return false;
          const s = timeToMinutes(r.start_time);
          const e = timeToMinutes(r.end_time);
          return s <= windowStart && e >= windowEnd;
        });
        return { start: w.start, end: w.end, label: slotLabel(w.start, w.end), available };
      });

      return c.json({ date, slots });
    } catch (err) {
      logger.error("availability-slots failed", err, { date, zip });
      return emptyResponse(date);
    }
  }
);
