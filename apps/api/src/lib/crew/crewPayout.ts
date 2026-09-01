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
 * Team Cleans per-member compensation.
 *
 * A crew booking's cleaner-payout POOL is the SAME amount solo bookings pay a
 * single cleaner — `calculatePayout(total_price, …).cleanerPayout` — computed
 * once against the booking (with the LEAD's tier/founding multipliers, since
 * bookings.cleaner_id mirrors the LEAD). That pool is then split across the
 * PRESENT crew seats (ACCEPTED / COMPLETED) by the configured
 * `payoutSplitFractions` (primary = LEAD first).
 *
 * A NO_SHOW (or any non-present) seat earns 0 and is EXCLUDED from the split:
 * the remaining crew divides the SAME pool by the reduced present size, because
 * the customer paid the same regardless of who showed up.
 *
 * Money invariants (CLAUDE.md conv. 1–4):
 *   • integer cents everywhere; the split conserves the pool exactly (the LEAD
 *     absorbs the rounding remainder).
 *   • claim-then-act per seat: a conditional UPDATE claims the seat's transfer
 *     slot (stripe_transfer_id sentinel) BEFORE stripe.transfers.create, so a
 *     concurrent/retried release can never double-transfer to a member.
 *   • one Stripe transfer per present member, idempotencyKey
 *     payout_${bookingId}_${assignmentId}, shared transfer_group booking_${id}.
 *
 * Payouts / payout_ledger stay booking-level (the pool); per-seat earnings and
 * transfer ids live on booking_crew_assignments (added in migration 101).
 */

import type Stripe from "stripe";
import type { Sql } from "@sweepr/db";
import { loadFeeSettings, calculatePayout, getTierMultiplier } from "../payoutEngine";
import { foundingPayoutMultiplier } from "../foundingMember";
import { sumAccessDelayFeeCents, splitAccessDelayFeeCents } from "../accessDelayFee";
import { loadCrewConfig, payoutSplitFractions } from "./crewConfig";
import { serverTrack } from "../posthog";

// ── Analytics (best-effort; never breaks a payout) ───────────────────────────
// env is optional and threaded from the payout route; without POSTHOG_KEY the
// emit is a no-op. Booking id is the distinct id (no PII, no amounts per member).
export type CrewAnalyticsEnv = { POSTHOG_KEY?: string };

async function emitCrewEvent(
  env: CrewAnalyticsEnv | undefined,
  event: string,
  bookingId: string,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!env?.POSTHOG_KEY) return;
  try {
    await serverTrack(env, event, bookingId, { feature: "team_cleans", booking_id: bookingId, ...props });
  } catch {
    /* best-effort: analytics must never break a payout */
  }
}

/** A crew seat that is physically present and shares the payout pool. */
const PRESENT_SEAT_STATUSES = ["ACCEPTED", "COMPLETED"] as const;

/** Sentinel written into stripe_transfer_id to claim a seat's transfer slot. */
const TRANSFER_CLAIM_SENTINEL = "pending:transfer";

export interface CrewSeatEarning {
  assignmentId: string;
  cleanerId: string;
  role: "LEAD" | "MEMBER";
  seatIndex: number;
  earningsCents: number;
}

export interface CrewEarningsResult {
  /** Total cleaner-payout pool (cents) the crew splits — same as solo payout. */
  poolCents: number;
  /** Number of present seats sharing the pool. */
  presentCrewSize: number;
  /** Per-seat earnings, primary (LEAD) first; sums exactly to poolCents. */
  seats: CrewSeatEarning[];
}

interface BookingPoolRow {
  id: string;
  cleaner_id: string | null;
  total_price: number | null;
  founding_customer_discount_cents: number | null;
  crew_status: string | null;
}

interface SeatRow {
  id: string;
  cleaner_id: string;
  role: "LEAD" | "MEMBER";
  seat_index: number;
  status: string;
}

/**
 * Compute the total cleaner-payout pool for a booking — identical to the solo
 * calculation (`calculatePayout(...).cleanerPayout`), using the LEAD's tier and
 * founding multipliers (bookings.cleaner_id is the LEAD).
 *
 * Access-delay/lockout fees on the booking are carved out first and re-added
 * at their fixed 80% cleaner-team share (ruleset 80/20 — NOT the standard
 * 70/30 fee split, and NOT multiplied by tier/founding bonuses). The 80% joins
 * the pool, so a crew splits it by the same configured fractions.
 */
export async function computeCrewPoolCents(sql: Sql, booking: BookingPoolRow): Promise<number> {
  const gross = booking.total_price ?? 0;
  if (gross <= 0) return 0;

  const feeSettings = await loadFeeSettings(sql);

  let tierMultiplier = 1.0;
  let foundingMult = 1.0;
  if (booking.cleaner_id) {
    const cleaners = (await sql`
      SELECT tier FROM cleaners WHERE id = ${booking.cleaner_id} LIMIT 1
    `) as Array<{ tier: string | null }>;
    const tier = cleaners[0]?.tier ?? "standard";
    tierMultiplier = await getTierMultiplier(sql, tier);
    foundingMult = await foundingPayoutMultiplier(sql, booking.cleaner_id);
  }

  // 80/20 carve-out: run the standard payout math on the total NET of any
  // access-delay fee, then add the fee's fixed cleaner-team share.
  const accessFeeCents = Math.min(await sumAccessDelayFeeCents(sql, booking.id), gross);
  const accessShare = splitAccessDelayFeeCents(accessFeeCents);

  const breakdown = calculatePayout(
    gross - accessFeeCents,
    feeSettings,
    tierMultiplier * foundingMult,
    booking.founding_customer_discount_cents ?? 0,
  );
  return breakdown.cleanerPayout + accessShare.cleanerCents;
}

/**
 * Load the present crew seats for a booking, ordered primary (LEAD) first, then
 * by seat_index. Only ACCEPTED/COMPLETED seats with a cleaner are present;
 * NO_SHOW and every open/dropped seat is excluded from the split.
 */
async function loadPresentSeats(sql: Sql, bookingId: string): Promise<SeatRow[]> {
  const rows = (await sql`
    SELECT id, cleaner_id, role, seat_index, status
    FROM booking_crew_assignments
    WHERE booking_id = ${bookingId}
      AND cleaner_id IS NOT NULL
      AND status = ANY(${PRESENT_SEAT_STATUSES as unknown as string[]})
    ORDER BY (role = 'LEAD') DESC, seat_index ASC
  `) as SeatRow[];
  return rows;
}

/**
 * Split `poolCents` across `size` seats by the configured fractions (primary
 * first), conserving cents exactly. Every non-primary seat is rounded; the
 * primary (LEAD) absorbs the remainder so the parts sum to the pool.
 */
export function splitPoolCents(poolCents: number, fractions: number[]): number[] {
  const size = fractions.length;
  if (size === 0) return [];
  if (size === 1) return [poolCents];
  const parts = new Array<number>(size).fill(0);
  let assigned = 0;
  // Non-primary seats (indices 1..n-1) are rounded from their fraction.
  for (let i = 1; i < size; i++) {
    const share = Math.round(poolCents * fractions[i]);
    parts[i] = share;
    assigned += share;
  }
  // Primary (LEAD) takes whatever is left → exact conservation, no lost cents.
  parts[0] = poolCents - assigned;
  return parts;
}

/**
 * Compute and PERSIST each present seat's earnings_cents for a crew booking.
 * Idempotent: re-running recomputes and rewrites the same values.
 */
export async function computeCrewEarnings(sql: Sql, bookingId: string): Promise<CrewEarningsResult> {
  const bookings = (await sql`
    SELECT id, cleaner_id, total_price, founding_customer_discount_cents, crew_status
    FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as BookingPoolRow[];
  const booking = bookings[0];
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const poolCents = await computeCrewPoolCents(sql, booking);
  const seats = await loadPresentSeats(sql, bookingId);
  const presentCrewSize = seats.length;

  if (presentCrewSize === 0) {
    return { poolCents, presentCrewSize: 0, seats: [] };
  }

  const fractions = payoutSplitFractions(await loadCrewConfig(sql), presentCrewSize);
  const amounts = splitPoolCents(poolCents, fractions);

  const result: CrewSeatEarning[] = [];
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    const earningsCents = amounts[i] ?? 0;
    await sql`
      UPDATE booking_crew_assignments
      SET earnings_cents = ${earningsCents}, updated_at = NOW()
      WHERE id = ${seat.id}
    `;
    result.push({
      assignmentId: seat.id,
      cleanerId: seat.cleaner_id,
      role: seat.role,
      seatIndex: seat.seat_index,
      earningsCents,
    });
  }

  return { poolCents, presentCrewSize, seats: result };
}

export interface CrewTransferResult {
  assignmentId: string;
  cleanerId: string;
  earningsCents: number;
  transferId: string | null;
  status: "transferred" | "skipped" | "failed" | "no_account";
}

export interface CrewPayoutSummary {
  poolCents: number;
  presentCrewSize: number;
  transfers: CrewTransferResult[];
  allSucceeded: boolean;
}

/**
 * Release per-member payouts for a crew booking: ONE Stripe transfer per
 * present member. Claim-then-act per seat — the seat's stripe_transfer_id is
 * claimed with a sentinel BEFORE the Stripe call, so a retry/concurrent release
 * never double-pays. On failure the claim is released so a later retry succeeds;
 * a seat already carrying a real transfer id is skipped (idempotent).
 *
 * Preconditions (mirrors the solo release): the customer's charge must already
 * be captured — callers gate on a settled `payments` row before calling this.
 */
export async function releaseCrewPayouts(
  sql: Sql,
  stripe: Stripe,
  bookingId: string,
  env?: CrewAnalyticsEnv,
): Promise<CrewPayoutSummary> {
  const { poolCents, presentCrewSize } = await computeCrewEarnings(sql, bookingId);

  // Re-read the persisted seat rows (with their current transfer state) so the
  // claim below races on live data, not the pre-compute snapshot.
  const seats = (await sql`
    SELECT id, cleaner_id, role, seat_index, status, earnings_cents, stripe_transfer_id
    FROM booking_crew_assignments
    WHERE booking_id = ${bookingId}
      AND cleaner_id IS NOT NULL
      AND status = ANY(${PRESENT_SEAT_STATUSES as unknown as string[]})
    ORDER BY (role = 'LEAD') DESC, seat_index ASC
  `) as Array<SeatRow & { earnings_cents: number; stripe_transfer_id: string | null }>;

  const transfers: CrewTransferResult[] = [];

  for (const seat of seats) {
    // A real transfer id (not the sentinel) means this seat was already paid.
    if (seat.stripe_transfer_id && seat.stripe_transfer_id !== TRANSFER_CLAIM_SENTINEL) {
      transfers.push({
        assignmentId: seat.id,
        cleanerId: seat.cleaner_id,
        earningsCents: seat.earnings_cents,
        transferId: seat.stripe_transfer_id,
        status: "skipped",
      });
      continue;
    }

    const cleaners = (await sql`
      SELECT stripe_connect_id FROM cleaners WHERE id = ${seat.cleaner_id} LIMIT 1
    `) as Array<{ stripe_connect_id: string | null }>;
    const connectId = cleaners[0]?.stripe_connect_id;
    if (!connectId) {
      transfers.push({
        assignmentId: seat.id,
        cleanerId: seat.cleaner_id,
        earningsCents: seat.earnings_cents,
        transferId: null,
        status: "no_account",
      });
      continue;
    }

    // Claim-then-act: atomically claim this seat's transfer slot BEFORE Stripe.
    // Only a NULL transfer id (never paid, never in flight) can be claimed.
    const claimed = (await sql`
      UPDATE booking_crew_assignments
      SET stripe_transfer_id = ${TRANSFER_CLAIM_SENTINEL}, updated_at = NOW()
      WHERE id = ${seat.id} AND stripe_transfer_id IS NULL
      RETURNING id
    `) as Array<{ id: string }>;
    if (!claimed[0]) {
      // Lost the race (another release holds the claim) — skip; the winner pays.
      transfers.push({
        assignmentId: seat.id,
        cleanerId: seat.cleaner_id,
        earningsCents: seat.earnings_cents,
        transferId: null,
        status: "skipped",
      });
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: seat.earnings_cents,
          currency: "usd",
          destination: connectId,
          transfer_group: `booking_${bookingId}`,
          metadata: {
            type: "crew_payout",
            booking_id: bookingId,
            crew_assignment_id: seat.id,
            role: seat.role,
          },
        },
        { idempotencyKey: `payout_${bookingId}_${seat.id}` },
      );
      await sql`
        UPDATE booking_crew_assignments
        SET stripe_transfer_id = ${transfer.id}, updated_at = NOW()
        WHERE id = ${seat.id}
      `;
      transfers.push({
        assignmentId: seat.id,
        cleanerId: seat.cleaner_id,
        earningsCents: seat.earnings_cents,
        transferId: transfer.id,
        status: "transferred",
      });
    } catch (err) {
      // Release the claim so a legitimate retry can pay this member later.
      await sql`
        UPDATE booking_crew_assignments
        SET stripe_transfer_id = NULL, updated_at = NOW()
        WHERE id = ${seat.id} AND stripe_transfer_id = ${TRANSFER_CLAIM_SENTINEL}
      `;
      transfers.push({
        assignmentId: seat.id,
        cleanerId: seat.cleaner_id,
        earningsCents: seat.earnings_cents,
        transferId: null,
        status: "failed",
      });
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
        crewPayoutTransfers: transfers,
      });
    }
  }

  const allSucceeded = transfers.every((t) => t.status === "transferred" || t.status === "skipped");
  await emitCrewEvent(env, "crew_payout_released", bookingId, {
    crew_size: presentCrewSize,
    transfer_count: transfers.filter((t) => t.status === "transferred").length,
    all_succeeded: allSucceeded,
  });
  return { poolCents, presentCrewSize, transfers, allSucceeded };
}
