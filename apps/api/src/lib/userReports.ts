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
 * User reports (Trust & Safety) — domain logic for the formal
 * customer↔cleaner reporting system (migration 105).
 *
 * Reports are BOOKING-SCOPED by design: the reporter must be the booking's
 * customer or its assigned cleaner, and the reported user is the counterpart
 * on that same booking. All party/lifecycle/photo rules live here so the
 * routes stay thin and the rules are unit-testable (tests/reports.test.ts).
 */

import type { Sql } from "./db";

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const REPORT_CATEGORIES = [
  "safety_concern",
  "property_damage",
  "theft",
  "harassment",
  "no_show",
  "unprofessional_conduct",
  "payment_dispute",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_STATUSES = [
  "submitted",
  "under_review",
  "action_taken",
  "dismissed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const RESOLUTION_ACTIONS = [
  "none",
  "warning_issued",
  "suspension",
  "other",
] as const;
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

/** Statuses that count as an OPEN report (duplicate guard + photo window). */
export const OPEN_REPORT_STATUSES: ReportStatus[] = ["submitted", "under_review"];

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Small, strict lifecycle map: submitted → under_review → action_taken |
 * dismissed. A dismissed report may be REOPENED to under_review (new evidence
 * surfaces); action_taken is terminal. No other jumps, no skipping.
 */
const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  submitted: ["under_review"],
  under_review: ["action_taken", "dismissed"],
  action_taken: [],
  dismissed: ["under_review"],
};

export function isValidReportTransition(from: string, to: string): boolean {
  return (REPORT_TRANSITIONS[from as ReportStatus] ?? []).includes(to as ReportStatus);
}

// ── Booking status window ────────────────────────────────────────────────────

/**
 * A report only makes sense once the two parties actually interacted: the
 * booking must have reached at least `confirmed` (a cleaner committed) —
 * including everything downstream of it (day-of-service states, completion,
 * dispute/refund, and cancellations, where "you cancelled on me" reports are
 * legitimate). Pre-assignment states (draft…cleaner_accepted) are excluded;
 * there is no counterpart to report yet.
 */
export const REPORTABLE_BOOKING_STATUSES = new Set<string>([
  "confirmed",
  "cleaner_on_the_way",
  "arrived",
  "in_progress",
  "completed_pending_review",
  "completed",
  "disputed",
  "refunded",
  "cancelled_by_customer",
  "cancelled_by_cleaner",
]);

export function isBookingReportable(bookingStatus: string): boolean {
  return REPORTABLE_BOOKING_STATUSES.has(bookingStatus);
}

// ── Party resolution ─────────────────────────────────────────────────────────

export interface BookingParties {
  /** users.id of the booking's customer (null if none resolved). */
  customerUserId: string | null;
  /** users.id of the booking's assigned cleaner (null if unassigned). */
  cleanerUserId: string | null;
}

export interface ResolvedParty {
  reporterRole: "customer" | "cleaner";
  reportedUserId: string;
}

/**
 * Resolve who the caller is on this booking and who the counterpart is.
 * Returns null when the caller is NOT a party to the booking, or when the
 * counterpart doesn't exist (e.g. no cleaner ever assigned).
 */
export function resolveReportParty(
  parties: BookingParties,
  callerUserId: string,
): ResolvedParty | null {
  if (parties.customerUserId && callerUserId === parties.customerUserId) {
    if (!parties.cleanerUserId) return null;
    return { reporterRole: "customer", reportedUserId: parties.cleanerUserId };
  }
  if (parties.cleanerUserId && callerUserId === parties.cleanerUserId) {
    if (!parties.customerUserId) return null;
    return { reporterRole: "cleaner", reportedUserId: parties.customerUserId };
  }
  return null;
}

// ── Photo evidence limits ────────────────────────────────────────────────────

export const MAX_REPORT_PHOTOS = 6;
export const MAX_REPORT_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB
export const REPORT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoValidation = { ok: true } | { ok: false; error: string };

export function validateReportPhoto(input: {
  contentType: string;
  sizeBytes: number;
  existingCount: number;
}): PhotoValidation {
  const type = input.contentType.split(";")[0].trim().toLowerCase();
  if (!(REPORT_PHOTO_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "Only JPEG, PNG, or WebP images are accepted" };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: "Empty upload" };
  }
  if (input.sizeBytes > MAX_REPORT_PHOTO_BYTES) {
    return { ok: false, error: "Each photo must be 10MB or smaller" };
  }
  if (input.existingCount >= MAX_REPORT_PHOTOS) {
    return { ok: false, error: `A report can carry at most ${MAX_REPORT_PHOTOS} photos` };
  }
  return { ok: true };
}

// ── Resolution validation ────────────────────────────────────────────────────

export type ResolutionValidation = { ok: true } | { ok: false; error: string };

/** Resolving requires BOTH a resolution action and a substantive note. */
export function validateResolution(
  action: string | null | undefined,
  note: string | null | undefined,
): ResolutionValidation {
  if (!action || !(RESOLUTION_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: "A resolution action is required" };
  }
  if (!note || note.trim().length < 5) {
    return { ok: false, error: "A resolution note is required" };
  }
  return { ok: true };
}

// ── Submission (SQL-backed) ──────────────────────────────────────────────────

export interface SubmitReportInput {
  bookingId: string;
  callerUserId: string;
  category: ReportCategory;
  description: string;
}

export type SubmitReportResult =
  | { ok: true; report: { id: string; status: ReportStatus; reporterRole: "customer" | "cleaner"; reportedUserId: string; createdAt: string } }
  | { ok: false; code: "not_found" | "forbidden" | "not_reportable" | "duplicate" };

interface BookingPartyRow {
  id: string;
  status: string;
  customer_user_id: string | null;
  cleaner_user_id: string | null;
}

/**
 * Validate the booking relationship and insert the report. The partial unique
 * index uq_user_reports_open is the race-safe duplicate arbiter — a violation
 * maps to `duplicate` even if two submissions race past the pre-check.
 */
export async function submitUserReport(
  sql: Sql,
  input: SubmitReportInput,
): Promise<SubmitReportResult> {
  const bookingRows = (await sql`
    SELECT b.id, b.status,
           cust.user_id AS customer_user_id,
           u_cl.id AS cleaner_user_id
    FROM bookings b
    LEFT JOIN customers cust ON cust.id = b.customer_id
    LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
    LEFT JOIN users u_cl ON u_cl.id = cl.user_id
    WHERE b.id = ${input.bookingId}
    LIMIT 1
  `) as BookingPartyRow[];
  const booking = bookingRows[0];
  if (!booking) return { ok: false, code: "not_found" };

  const party = resolveReportParty(
    { customerUserId: booking.customer_user_id, cleanerUserId: booking.cleaner_user_id },
    input.callerUserId,
  );
  if (!party) return { ok: false, code: "forbidden" };

  if (!isBookingReportable(booking.status)) {
    return { ok: false, code: "not_reportable" };
  }

  // Friendly pre-check (the unique index below still guards the race).
  const openRows = (await sql`
    SELECT id FROM user_reports
    WHERE booking_id = ${input.bookingId}
      AND reporter_user_id = ${input.callerUserId}
      AND status IN ('submitted', 'under_review')
    LIMIT 1
  `) as Array<{ id: string }>;
  if (openRows[0]) return { ok: false, code: "duplicate" };

  try {
    const inserted = (await sql`
      INSERT INTO user_reports (
        booking_id, reporter_user_id, reported_user_id,
        reporter_role, category, description
      ) VALUES (
        ${input.bookingId}, ${input.callerUserId}, ${party.reportedUserId},
        ${party.reporterRole}, ${input.category}, ${input.description}
      ) RETURNING id, status, created_at
    `) as Array<{ id: string; status: ReportStatus; created_at: string }>;
    const row = inserted[0];
    return {
      ok: true,
      report: {
        id: row.id,
        status: row.status,
        reporterRole: party.reporterRole,
        reportedUserId: party.reportedUserId,
        createdAt: row.created_at,
      },
    };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("uq_user_reports_open") || msg.toLowerCase().includes("unique")) {
      return { ok: false, code: "duplicate" };
    }
    throw err;
  }
}

// ── Status transitions (SQL-backed, claim-then-act) ──────────────────────────

export interface TransitionInput {
  reportId: string;
  toStatus: ReportStatus;
  /** Resolution fields — required (validated) when toStatus is terminal-ish. */
  resolutionAction?: ResolutionAction | null;
  resolutionNote?: string | null;
  resolvedByClerkId?: string | null;
}

export type TransitionResult =
  | { ok: true; fromStatus: ReportStatus }
  | { ok: false; code: "not_found" | "invalid_transition" | "conflict" | "invalid_resolution"; error?: string };

/**
 * Move a report through the lifecycle with a conditional UPDATE (CAS on the
 * current status — convention 3) so concurrent admins can't double-apply.
 * Resolving into action_taken/dismissed requires resolution_action + note;
 * reopening (dismissed → under_review) clears the resolution fields.
 */
export async function applyReportTransition(
  sql: Sql,
  input: TransitionInput,
): Promise<TransitionResult> {
  const rows = (await sql`
    SELECT id, status FROM user_reports WHERE id = ${input.reportId} LIMIT 1
  `) as Array<{ id: string; status: ReportStatus }>;
  const current = rows[0];
  if (!current) return { ok: false, code: "not_found" };

  if (!isValidReportTransition(current.status, input.toStatus)) {
    return {
      ok: false,
      code: "invalid_transition",
      error: `Cannot move a report from ${current.status} to ${input.toStatus}`,
    };
  }

  const resolving = input.toStatus === "action_taken" || input.toStatus === "dismissed";
  if (resolving) {
    const v = validateResolution(input.resolutionAction, input.resolutionNote);
    if (!v.ok) return { ok: false, code: "invalid_resolution", error: v.error };
  }

  // Claim-then-act: only wins if the status is still what we read above.
  const updated = resolving
    ? ((await sql`
        UPDATE user_reports
        SET status = ${input.toStatus},
            resolution_action = ${input.resolutionAction ?? null},
            resolution_note = ${input.resolutionNote ?? null},
            resolved_by = ${input.resolvedByClerkId ?? null},
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = ${input.reportId} AND status = ${current.status}
        RETURNING id
      `) as Array<{ id: string }>)
    : ((await sql`
        UPDATE user_reports
        SET status = ${input.toStatus},
            resolution_action = NULL,
            resolution_note = NULL,
            resolved_by = NULL,
            resolved_at = NULL,
            updated_at = NOW()
        WHERE id = ${input.reportId} AND status = ${current.status}
        RETURNING id
      `) as Array<{ id: string }>);

  if (!updated[0]) return { ok: false, code: "conflict" };
  return { ok: true, fromStatus: current.status };
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

/** Human-facing case reference derived from the report id (e.g. "R-3F9A2C1B"). */
export function reportReference(reportId: string): string {
  return `R-${reportId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
