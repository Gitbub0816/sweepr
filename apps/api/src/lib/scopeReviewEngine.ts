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
 * Scope review decision engine.
 *
 * Money only ever moves here — no AI recommendation, cleaner action, or
 * customer action ever charges a customer. Only an admin decision (dashboard,
 * or a signed single-use email link) reaches `decideScopeReview`.
 *
 * The engine is claim-then-act: it atomically flips the request's status with a
 * conditional UPDATE so a double-click / duplicate email click can never charge
 * twice. Approving an already-denied / hard-denied request is an admin override;
 * denying anything other than a pending_admin request is a no-op.
 */
import type Stripe from "stripe";
import type { Sql } from "./db";
import type { Env } from "../types";
import type { ScopeReviewFeeCode } from "@sweepr/types";
import { applyBookingPriceAdjustment, recordLedgerEntry } from "./bookingLedger";
import { isValidTransition } from "./statusMachine";
import { audit } from "./audit";
import { logger } from "./logger";
import { notifyCleanerDecision } from "./scopeReviewNotify";

// ── Settings ──────────────────────────────────────────────────────────────────
export interface ScopeReviewSettings {
  feeSmallCents: number;
  feeMediumCents: number;
  feeLargeCents: number;
  refusalMinCents: number;
  refusalMaxCents: number;
  refusalPct: number;
  abuseRequestRatePct: number;
  abuseDenialRatePct: number;
  abuseMinJobs: number;
  privilegeDisableDays: number;
  suspensionDays: number;
  investigatingDays: number;
  autoCancelOnHighConfidenceRefusal: boolean;
}

const DEFAULTS: ScopeReviewSettings = {
  feeSmallCents: 2500,
  feeMediumCents: 5000,
  feeLargeCents: 10000,
  refusalMinCents: 5000,
  refusalMaxCents: 20000,
  refusalPct: 20,
  abuseRequestRatePct: 70,
  abuseDenialRatePct: 70,
  abuseMinJobs: 10,
  privilegeDisableDays: 180,
  suspensionDays: 180,
  investigatingDays: 180,
  autoCancelOnHighConfidenceRefusal: false,
};

const KEYS: Record<string, keyof ScopeReviewSettings> = {
  "scope_review.fee_additional_attention_small_cents": "feeSmallCents",
  "scope_review.fee_additional_attention_medium_cents": "feeMediumCents",
  "scope_review.fee_additional_attention_large_cents": "feeLargeCents",
  "scope_review.refusal_fee_min_cents": "refusalMinCents",
  "scope_review.refusal_fee_max_cents": "refusalMaxCents",
  "scope_review.refusal_fee_pct": "refusalPct",
  "scope_review.abuse_request_rate_pct": "abuseRequestRatePct",
  "scope_review.abuse_denial_rate_pct": "abuseDenialRatePct",
  "scope_review.abuse_min_jobs": "abuseMinJobs",
  "scope_review.privilege_disable_days": "privilegeDisableDays",
  "scope_review.suspension_days": "suspensionDays",
  "scope_review.investigating_days": "investigatingDays",
};

export async function loadScopeReviewSettings(sql: Sql): Promise<ScopeReviewSettings> {
  const out = { ...DEFAULTS };
  try {
    const rows = (await sql`
      SELECT key, value FROM site_settings WHERE key LIKE 'scope_review.%'
    `) as Array<{ key: string; value: string }>;
    for (const r of rows) {
      const field = KEYS[r.key];
      if (field) {
        const n = Number(r.value);
        if (Number.isFinite(n)) (out[field] as number) = n;
      }
      if (r.key === "scope_review.auto_cancel_on_high_confidence_refusal") {
        out.autoCancelOnHighConfidenceRefusal = r.value === "true";
      }
    }
  } catch (err) {
    logger.error("loadScopeReviewSettings failed", err, {});
  }
  return out;
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────

export type ConfidenceRoute = {
  status: "pending_admin" | "denied" | "hard_denied";
  emailKind: "strong_approve" | "standard" | "auto_denied" | "hard_denied";
};

/** Confidence routing: 95+ strong approve, 75-94 standard, 50-74 auto-deny, <50 hard-deny. */
export function routeByConfidence(confidence: number): ConfidenceRoute {
  if (confidence >= 95) return { status: "pending_admin", emailKind: "strong_approve" };
  if (confidence >= 75) return { status: "pending_admin", emailKind: "standard" };
  if (confidence >= 50) return { status: "denied", emailKind: "auto_denied" };
  return { status: "hard_denied", emailKind: "hard_denied" };
}

const AAF_CODES = new Set<ScopeReviewFeeCode>([
  "additional_attention_small",
  "additional_attention_medium",
  "additional_attention_large",
]);

export function isAafFeeCode(code: string | null | undefined): code is ScopeReviewFeeCode {
  return !!code && AAF_CODES.has(code as ScopeReviewFeeCode);
}

/** Cents for an additional-attention fee code; null if the code is not an AAF code. */
export function aafFeeCents(code: string, settings: ScopeReviewSettings): number | null {
  switch (code) {
    case "additional_attention_small":
      return settings.feeSmallCents;
    case "additional_attention_medium":
      return settings.feeMediumCents;
    case "additional_attention_large":
      return settings.feeLargeCents;
    default:
      return null;
  }
}

/** Refusal fee = clamp(round(total * pct/100), min, max). */
export function computeRefusalFeeCents(totalPriceCents: number, settings: ScopeReviewSettings): number {
  const raw = Math.round((totalPriceCents * settings.refusalPct) / 100);
  return Math.max(settings.refusalMinCents, Math.min(settings.refusalMaxCents, raw));
}

/** Normalized greylist key: lower(trim(street))|lower(trim(unit))|zip. */
export function normalizedGreylistKey(street: string, unit: string | null | undefined, zip: string): string {
  return `${street.trim().toLowerCase()}|${(unit ?? "").trim().toLowerCase()}|${(zip ?? "").trim()}`;
}

// ── Engine ──────────────────────────────────────────────────────────────────

export class ScopeReviewEngineError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface DecideInput {
  requestId: string;
  decision: "approve" | "deny";
  adminId: string;
  feeCodeOverride?: ScopeReviewFeeCode | null;
  note?: string | null;
  ip?: string;
  userAgent?: string;
}

export interface DecideResult {
  status: string;
  noop?: boolean;
  requestType?: "additional_attention" | "refusal";
  feeAmountCents?: number;
  overridden?: boolean;
}

interface RequestRow {
  id: string;
  booking_id: string;
  cleaner_id: string | null;
  customer_id: string | null;
  request_type: "additional_attention" | "refusal";
  status: string;
  fee_code: string | null;
}

export async function decideScopeReview(
  sql: Sql,
  stripe: Stripe,
  env: Env,
  input: DecideInput,
): Promise<DecideResult> {
  const rows = (await sql`
    SELECT id, booking_id, cleaner_id, customer_id, request_type, status, fee_code
    FROM scope_review_requests WHERE id = ${input.requestId} LIMIT 1
  `) as RequestRow[];
  const req = rows[0];
  if (!req) throw new ScopeReviewEngineError("Scope review request not found", 404);

  const settings = await loadScopeReviewSettings(sql);
  const prevStatus = req.status;

  // ── DENY ──────────────────────────────────────────────────────────────────
  if (input.decision === "deny") {
    // Only a pending_admin request can be denied; denying a denied/hard_denied is a no-op.
    const claimed = (await sql`
      UPDATE scope_review_requests
      SET status = 'denied', admin_decision = 'denied', admin_id = ${input.adminId},
          admin_decided_at = NOW(), updated_at = NOW()
      WHERE id = ${req.id} AND status = 'pending_admin'
      RETURNING id
    `) as Array<{ id: string }>;
    if (!claimed[0]) {
      return { status: prevStatus, noop: true, requestType: req.request_type };
    }
    await audit(sql, {
      action: "admin.action",
      actorClerkId: input.adminId,
      targetType: "scope_review_request",
      targetId: req.id,
      metadata: { event: "scope_review_denied", requestType: req.request_type, note: input.note ?? null },
      ipAddress: input.ip,
      userAgent: input.userAgent,
      timestamp: new Date().toISOString(),
    });
    await notifyCleanerDecision(sql, env, {
      requestId: req.id,
      cleanerId: req.cleaner_id,
      requestType: req.request_type,
      decision: "denied",
    }).catch((err) => logger.error("notifyCleanerDecision failed", err, {}));
    await runAbuseCheck(sql, req.cleaner_id, settings, input.adminId).catch((err) =>
      logger.error("runAbuseCheck failed", err, {}),
    );
    return { status: "denied", requestType: req.request_type };
  }

  // ── APPROVE (possibly an override of a denied/hard_denied request) ─────────
  const wasOverride = prevStatus === "denied" || prevStatus === "hard_denied";
  const claimed = (await sql`
    UPDATE scope_review_requests
    SET status = 'approved',
        admin_decision = ${wasOverride ? "overridden_approved" : "approved"},
        admin_id = ${input.adminId}, admin_decided_at = NOW(), updated_at = NOW()
    WHERE id = ${req.id} AND status IN ('pending_admin', 'denied', 'hard_denied')
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) {
    return { status: prevStatus, noop: true, requestType: req.request_type };
  }

  let feeAmountCents = 0;
  if (req.request_type === "additional_attention") {
    feeAmountCents = await approveAdditionalAttention(sql, stripe, env, req, input, settings);
  } else {
    feeAmountCents = await approveRefusal(sql, stripe, env, req, input, settings);
  }

  await audit(sql, {
    action: "admin.action",
    actorClerkId: input.adminId,
    targetType: "scope_review_request",
    targetId: req.id,
    metadata: {
      event: wasOverride ? "scope_review_overridden_approved" : "scope_review_approved",
      requestType: req.request_type,
      feeAmountCents,
      note: input.note ?? null,
    },
    ipAddress: input.ip,
    userAgent: input.userAgent,
    timestamp: new Date().toISOString(),
  });

  await runAbuseCheck(sql, req.cleaner_id, settings, input.adminId).catch((err) =>
    logger.error("runAbuseCheck failed", err, {}),
  );

  return { status: "approved", requestType: req.request_type, feeAmountCents, overridden: wasOverride };
}

// ── Additional Attention Fee approval ──────────────────────────────────────────
async function approveAdditionalAttention(
  sql: Sql,
  stripe: Stripe,
  env: Env,
  req: RequestRow,
  input: DecideInput,
  settings: ScopeReviewSettings,
): Promise<number> {
  const chosen = input.feeCodeOverride ?? req.fee_code ?? "none";
  if (!isAafFeeCode(chosen)) {
    throw new ScopeReviewEngineError(
      "A valid additional-attention fee code is required to approve this request",
      400,
    );
  }
  const amount = aafFeeCents(chosen, settings);
  if (amount == null || amount <= 0) {
    throw new ScopeReviewEngineError("Resolved fee amount is invalid", 400);
  }

  await applyBookingPriceAdjustment(sql, stripe, {
    bookingId: req.booking_id,
    adjustmentCents: amount,
    eventType: "additional_attention_fee",
    reason: `Additional attention fee (${chosen})${input.note ? ` — ${input.note}` : ""}`,
    source: "cleaner_request",
    approvedBy: input.adminId,
    scopeReviewRequestId: req.id,
  });

  await sql`
    UPDATE scope_review_requests
    SET fee_code = ${chosen}, fee_amount_cents = ${amount}, updated_at = NOW()
    WHERE id = ${req.id}
  `;

  await notifyCleanerDecision(sql, env, {
    requestId: req.id,
    cleanerId: req.cleaner_id,
    requestType: "additional_attention",
    decision: "approved",
    feeAmountCents: amount,
  }).catch((err) => logger.error("notifyCleanerDecision failed", err, {}));

  return amount;
}

// ── Refusal approval ────────────────────────────────────────────────────────
async function approveRefusal(
  sql: Sql,
  stripe: Stripe,
  env: Env,
  req: RequestRow,
  input: DecideInput,
  settings: ScopeReviewSettings,
): Promise<number> {
  const bookingRows = (await sql`
    SELECT b.id, b.status, b.total_price, b.stripe_payment_intent_id, b.address_id, b.cleaner_id,
           a.street, a.unit, a.city, a.state, a.zip, a.lat, a.lng
    FROM bookings b
    LEFT JOIN addresses a ON a.id = b.address_id
    WHERE b.id = ${req.booking_id} LIMIT 1
  `) as Array<{
    id: string; status: string; total_price: number | null; stripe_payment_intent_id: string | null;
    address_id: string | null; cleaner_id: string | null;
    street: string | null; unit: string | null; city: string | null; state: string | null;
    zip: string | null; lat: number | null; lng: number | null;
  }>;
  const booking = bookingRows[0];
  if (!booking) throw new ScopeReviewEngineError("Booking not found for refusal", 404);

  const previousTotal = booking.total_price ?? 0;
  const refusalFee = computeRefusalFeeCents(previousTotal, settings);

  // Charge: manual-capture PI. Capture only the refusal fee if capturable.
  let captured = false;
  if (booking.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.capture(
          booking.stripe_payment_intent_id,
          { amount_to_capture: Math.min(refusalFee, pi.amount) },
          { idempotencyKey: `refusal_${req.id}` },
        );
        captured = true;
      }
    } catch (err) {
      logger.error("refusal capture failed", err, { bookingId: booking.id, requestId: req.id });
    }
  }

  // Keep booking total, ledger and capture consistent: the refusal fee becomes
  // the booking's authoritative total.
  await sql`
    UPDATE bookings SET total_price = ${refusalFee}, updated_at = NOW() WHERE id = ${booking.id}
  `;
  await recordLedgerEntry(sql, {
    bookingId: booking.id,
    eventType: "refusal_fee",
    previousTotalCents: previousTotal,
    adjustmentCents: refusalFee - previousTotal,
    newTotalCents: refusalFee,
    reason: `Service refusal fee${input.note ? ` — ${input.note}` : ""}${captured ? "" : " (capture pending — manual follow-up)"}`,
    source: "cleaner_request",
    approvedBy: input.adminId,
    scopeReviewRequestId: req.id,
    stripePaymentIntentId: booking.stripe_payment_intent_id,
  });

  // Transition booking to a terminal refusal status. cancelled_by_cleaner is the
  // closest existing status; guard with the state machine, but an admin-approved
  // refusal overrides mid-flow statuses (arrived/in_progress) if needed.
  const target = "cancelled_by_cleaner";
  const validTransition = isValidTransition(booking.status, target);
  await sql`
    UPDATE bookings SET status = ${target}, updated_at = NOW() WHERE id = ${booking.id}
  `;
  if (!validTransition) {
    logger.info("refusal forced booking terminal status outside state machine", {
      bookingId: booking.id, from: booking.status, to: target,
    });
  }

  await sql`
    UPDATE scope_review_requests
    SET fee_code = 'refusal_fee', fee_amount_cents = ${refusalFee}, updated_at = NOW()
    WHERE id = ${req.id}
  `;

  // Keep the payout ledger row (seeded at payment) in sync so the existing
  // release-payout flow splits on the refusal fee, not the original total.
  await sql`
    UPDATE payout_ledger SET gross_amount_cents = ${refusalFee}, updated_at = NOW()
    WHERE booking_id = ${booking.id}
  `.catch(() => undefined);

  // ── Customer account status escalation ────────────────────────────────────
  if (req.customer_id) {
    await escalateCustomer(sql, req, booking, settings, input.adminId);
  }

  await notifyCleanerDecision(sql, env, {
    requestId: req.id,
    cleanerId: req.cleaner_id,
    requestType: "refusal",
    decision: "approved",
    feeAmountCents: refusalFee,
  }).catch((err) => logger.error("notifyCleanerDecision failed", err, {}));

  return refusalFee;
}

async function escalateCustomer(
  sql: Sql,
  req: RequestRow,
  booking: { id: string; street: string | null; unit: string | null; city: string | null; state: string | null; zip: string | null; lat: number | null; lng: number | null },
  settings: ScopeReviewSettings,
  adminId: string,
): Promise<void> {
  const custRows = (await sql`
    SELECT account_status, account_status_until FROM customers WHERE id = ${req.customer_id} LIMIT 1
  `) as Array<{ account_status: string; account_status_until: string | null }>;
  const cust = custRows[0];
  if (!cust) return;

  const now = Date.now();
  const withinInvestigatingWindow =
    cust.account_status === "investigating" &&
    (!cust.account_status_until || new Date(cust.account_status_until).getTime() > now);

  if (withinInvestigatingWindow) {
    // Second strike within the window → suspend + greylist the address.
    await sql`
      UPDATE customers
      SET account_status = 'suspended',
          account_status_until = NOW() + (${settings.suspensionDays} * INTERVAL '1 day'),
          account_status_reason = ${`Repeated approved service refusal (booking ${booking.id})`},
          updated_at = NOW()
      WHERE id = ${req.customer_id}
    `;
    if (booking.street && booking.zip) {
      const key = normalizedGreylistKey(booking.street, booking.unit, booking.zip);
      await sql`
        INSERT INTO address_greylist
          (street_address, unit, city, state, zip, latitude, longitude, normalized_key,
           reason, source_booking_id, customer_id, created_by)
        VALUES (
          ${booking.street}, ${booking.unit ?? ""}, ${booking.city}, ${booking.state}, ${booking.zip},
          ${booking.lat}, ${booking.lng}, ${key},
          ${`Approved service refusal — customer suspended (booking ${booking.id})`},
          ${booking.id}, ${req.customer_id}, ${adminId}
        )
        ON CONFLICT (normalized_key) DO NOTHING
      `;
    }
  } else {
    await sql`
      UPDATE customers
      SET account_status = 'investigating',
          account_status_until = NOW() + (${settings.investigatingDays} * INTERVAL '1 day'),
          account_status_reason = ${`Approved service refusal (booking ${booking.id})`},
          updated_at = NOW()
      WHERE id = ${req.customer_id}
    `;
  }
}

// ── Abuse check ───────────────────────────────────────────────────────────────
export async function runAbuseCheck(
  sql: Sql,
  cleanerId: string | null,
  settings: ScopeReviewSettings,
  adminId: string,
): Promise<void> {
  if (!cleanerId) return;

  const jobRows = (await sql`
    SELECT COUNT(*)::int AS c FROM bookings WHERE cleaner_id = ${cleanerId} AND status = 'completed'
  `) as Array<{ c: number }>;
  const completedJobs = jobRows[0]?.c ?? 0;
  if (completedJobs < settings.abuseMinJobs) return;

  const aafRows = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status IN ('denied', 'hard_denied') OR admin_decision = 'denied'
      )::int AS denied
    FROM scope_review_requests
    WHERE cleaner_id = ${cleanerId} AND request_type = 'additional_attention'
  `) as Array<{ total: number; denied: number }>;
  const aafRequests = aafRows[0]?.total ?? 0;
  const deniedAaf = aafRows[0]?.denied ?? 0;
  if (aafRequests <= 0) return;

  const requestRate = (aafRequests / completedJobs) * 100;
  const denialRate = (deniedAaf / aafRequests) * 100;

  if (requestRate >= settings.abuseRequestRatePct && denialRate >= settings.abuseDenialRatePct) {
    await sql`
      INSERT INTO cleaner_privileges (cleaner_id, additional_attention_enabled, disabled_reason, disabled_until, updated_at)
      VALUES (
        ${cleanerId}, FALSE,
        'Temporarily unavailable due to repeated denied requests.',
        NOW() + (${settings.privilegeDisableDays} * INTERVAL '1 day'), NOW()
      )
      ON CONFLICT (cleaner_id) DO UPDATE SET
        additional_attention_enabled = FALSE,
        disabled_reason = EXCLUDED.disabled_reason,
        disabled_until = EXCLUDED.disabled_until,
        updated_at = NOW()
    `;
    await audit(sql, {
      action: "cleaner.suspended",
      actorClerkId: adminId,
      targetType: "cleaner",
      targetId: cleanerId,
      metadata: {
        event: "additional_attention_privilege_disabled",
        completedJobs, aafRequests, deniedAaf,
        requestRate: Math.round(requestRate), denialRate: Math.round(denialRate),
      },
      timestamp: new Date().toISOString(),
    });
  }
}
