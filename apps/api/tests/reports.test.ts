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
 * User reports (Trust & Safety) — domain-rule tests for the booking-scoped
 * customer↔cleaner reporting system (lib/userReports.ts, migration 105).
 *
 * Exercises the rules the routes lean on: party validation (a non-party can
 * never file), the booking status window, the duplicate-open-report guard
 * (pre-check AND the unique-index race path), the small lifecycle map
 * (including invalid jumps and the dismissed→under_review reopen), the
 * resolve-requires-action+note rule, and the photo evidence limits.
 */

import { describe, it, expect } from "vitest";
import type { Sql } from "../src/lib/db";
import {
  resolveReportParty,
  isBookingReportable,
  isValidReportTransition,
  validateReportPhoto,
  validateResolution,
  submitUserReport,
  applyReportTransition,
  reportReference,
  MAX_REPORT_PHOTOS,
  MAX_REPORT_PHOTO_BYTES,
} from "../src/lib/userReports";

// ── Template-tag SQL mock (same approach as the crew integration tests) ──────
type Row = Record<string, unknown>;
type Handler = (query: string, params: unknown[]) => Row[];

function makeSql(handler: Handler): Sql {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    return handler(text, values);
  }) as unknown as Sql;
}

const CUSTOMER_USER = "11111111-1111-4111-8111-111111111111";
const CLEANER_USER = "22222222-2222-4222-8222-222222222222";
const STRANGER_USER = "33333333-3333-4333-8333-333333333333";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const REPORT_ID = "55555555-5555-4555-8555-555555555555";

// ── Party validation ─────────────────────────────────────────────────────────

describe("resolveReportParty", () => {
  const parties = { customerUserId: CUSTOMER_USER, cleanerUserId: CLEANER_USER };

  it("maps the customer to reporting the cleaner", () => {
    expect(resolveReportParty(parties, CUSTOMER_USER)).toEqual({
      reporterRole: "customer",
      reportedUserId: CLEANER_USER,
    });
  });

  it("maps the cleaner to reporting the customer", () => {
    expect(resolveReportParty(parties, CLEANER_USER)).toEqual({
      reporterRole: "cleaner",
      reportedUserId: CUSTOMER_USER,
    });
  });

  it("rejects a caller who is not a party to the booking", () => {
    expect(resolveReportParty(parties, STRANGER_USER)).toBeNull();
  });

  it("rejects when the counterpart does not exist (no cleaner assigned)", () => {
    expect(
      resolveReportParty({ customerUserId: CUSTOMER_USER, cleanerUserId: null }, CUSTOMER_USER),
    ).toBeNull();
  });
});

// ── Booking status window ────────────────────────────────────────────────────

describe("isBookingReportable", () => {
  it("allows bookings from confirmed onward, including cancellations", () => {
    for (const s of [
      "confirmed", "cleaner_on_the_way", "arrived", "in_progress",
      "completed_pending_review", "completed", "disputed", "refunded",
      "cancelled_by_customer", "cancelled_by_cleaner",
    ]) {
      expect(isBookingReportable(s), s).toBe(true);
    }
  });

  it("rejects pre-assignment states where the parties never interacted", () => {
    for (const s of ["draft", "quoted", "payment_pending", "booked", "matching", "offered_to_cleaner", "cleaner_accepted"]) {
      expect(isBookingReportable(s), s).toBe(false);
    }
  });
});

// ── Lifecycle map ────────────────────────────────────────────────────────────

describe("isValidReportTransition", () => {
  it("follows submitted → under_review → action_taken | dismissed", () => {
    expect(isValidReportTransition("submitted", "under_review")).toBe(true);
    expect(isValidReportTransition("under_review", "action_taken")).toBe(true);
    expect(isValidReportTransition("under_review", "dismissed")).toBe(true);
  });

  it("allows reopening a dismissed report", () => {
    expect(isValidReportTransition("dismissed", "under_review")).toBe(true);
  });

  it("blocks skips, reversals, and moves out of the terminal state", () => {
    expect(isValidReportTransition("submitted", "action_taken")).toBe(false);
    expect(isValidReportTransition("submitted", "dismissed")).toBe(false);
    expect(isValidReportTransition("under_review", "submitted")).toBe(false);
    expect(isValidReportTransition("action_taken", "under_review")).toBe(false);
    expect(isValidReportTransition("action_taken", "dismissed")).toBe(false);
    expect(isValidReportTransition("dismissed", "action_taken")).toBe(false);
    expect(isValidReportTransition("bogus", "under_review")).toBe(false);
  });
});

// ── Photo limits ─────────────────────────────────────────────────────────────

describe("validateReportPhoto", () => {
  const ok = { contentType: "image/jpeg", sizeBytes: 1024, existingCount: 0 };

  it("accepts a normal image", () => {
    expect(validateReportPhoto(ok)).toEqual({ ok: true });
    expect(validateReportPhoto({ ...ok, contentType: "image/webp" })).toEqual({ ok: true });
    // Parameterized content types still match.
    expect(validateReportPhoto({ ...ok, contentType: "image/png; charset=binary" })).toEqual({ ok: true });
  });

  it("rejects non-image content types", () => {
    for (const t of ["text/html", "application/pdf", "image/svg+xml", "video/mp4", ""]) {
      const r = validateReportPhoto({ ...ok, contentType: t });
      expect(r.ok, t).toBe(false);
    }
  });

  it("rejects oversized and empty uploads", () => {
    expect(validateReportPhoto({ ...ok, sizeBytes: MAX_REPORT_PHOTO_BYTES + 1 }).ok).toBe(false);
    expect(validateReportPhoto({ ...ok, sizeBytes: MAX_REPORT_PHOTO_BYTES }).ok).toBe(true);
    expect(validateReportPhoto({ ...ok, sizeBytes: 0 }).ok).toBe(false);
  });

  it("caps a report at the photo limit", () => {
    expect(validateReportPhoto({ ...ok, existingCount: MAX_REPORT_PHOTOS - 1 }).ok).toBe(true);
    expect(validateReportPhoto({ ...ok, existingCount: MAX_REPORT_PHOTOS }).ok).toBe(false);
  });
});

// ── Resolution requirements ──────────────────────────────────────────────────

describe("validateResolution", () => {
  it("requires a known action AND a substantive note", () => {
    expect(validateResolution("warning_issued", "Issued a written warning.")).toEqual({ ok: true });
    expect(validateResolution(null, "note here").ok).toBe(false);
    expect(validateResolution("not_a_real_action", "note here").ok).toBe(false);
    expect(validateResolution("warning_issued", null).ok).toBe(false);
    expect(validateResolution("warning_issued", "").ok).toBe(false);
    expect(validateResolution("warning_issued", "  hi ").ok).toBe(false); // too short
  });
});

// ── submitUserReport (SQL-backed) ────────────────────────────────────────────

function bookingRow(over: Partial<Row> = {}): Row {
  return {
    id: BOOKING_ID,
    status: "completed",
    customer_user_id: CUSTOMER_USER,
    cleaner_user_id: CLEANER_USER,
    ...over,
  };
}

function submitSql(opts: {
  booking?: Row | null;
  openReport?: boolean;
  insertThrows?: string;
}): Sql {
  return makeSql((q) => {
    if (q.includes("FROM bookings b")) return opts.booking === null ? [] : [opts.booking ?? bookingRow()];
    if (q.includes("SELECT id FROM user_reports")) return opts.openReport ? [{ id: "existing" }] : [];
    if (q.startsWith("INSERT INTO user_reports")) {
      if (opts.insertThrows) throw new Error(opts.insertThrows);
      return [{ id: REPORT_ID, status: "submitted", created_at: "2026-09-01T00:00:00Z" }];
    }
    throw new Error(`unexpected query: ${q}`);
  });
}

const submitInput = {
  bookingId: BOOKING_ID,
  callerUserId: CUSTOMER_USER,
  category: "property_damage" as const,
  description: "A lamp in the living room was broken during the clean.",
};

describe("submitUserReport", () => {
  it("submits for a valid party on a reportable booking", async () => {
    const res = await submitUserReport(submitSql({}), submitInput);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.id).toBe(REPORT_ID);
      expect(res.report.status).toBe("submitted");
      expect(res.report.reporterRole).toBe("customer");
      expect(res.report.reportedUserId).toBe(CLEANER_USER);
    }
  });

  it("returns not_found for a missing booking", async () => {
    const res = await submitUserReport(submitSql({ booking: null }), submitInput);
    expect(res).toEqual({ ok: false, code: "not_found" });
  });

  it("returns forbidden for a caller who is not a party (403 at the route)", async () => {
    const res = await submitUserReport(submitSql({}), { ...submitInput, callerUserId: STRANGER_USER });
    expect(res).toEqual({ ok: false, code: "forbidden" });
  });

  it("returns forbidden when no cleaner was ever assigned", async () => {
    const res = await submitUserReport(
      submitSql({ booking: bookingRow({ cleaner_user_id: null }) }),
      submitInput,
    );
    expect(res).toEqual({ ok: false, code: "forbidden" });
  });

  it("rejects bookings that never reached confirmed", async () => {
    const res = await submitUserReport(
      submitSql({ booking: bookingRow({ status: "booked" }) }),
      submitInput,
    );
    expect(res).toEqual({ ok: false, code: "not_reportable" });
  });

  it("blocks a duplicate while an open report exists (pre-check)", async () => {
    const res = await submitUserReport(submitSql({ openReport: true }), submitInput);
    expect(res).toEqual({ ok: false, code: "duplicate" });
  });

  it("maps a unique-index race on insert to duplicate too", async () => {
    const res = await submitUserReport(
      submitSql({ insertThrows: 'duplicate key value violates unique constraint "uq_user_reports_open"' }),
      submitInput,
    );
    expect(res).toEqual({ ok: false, code: "duplicate" });
  });
});

// ── applyReportTransition (SQL-backed, CAS) ──────────────────────────────────

function transitionSql(opts: {
  current?: string | null;
  casWins?: boolean;
  onUpdate?: (q: string, params: unknown[]) => void;
}): Sql {
  return makeSql((q, params) => {
    if (q.startsWith("SELECT id, status FROM user_reports")) {
      return opts.current === null ? [] : [{ id: REPORT_ID, status: opts.current ?? "submitted" }];
    }
    if (q.startsWith("UPDATE user_reports")) {
      opts.onUpdate?.(q, params);
      return opts.casWins === false ? [] : [{ id: REPORT_ID }];
    }
    throw new Error(`unexpected query: ${q}`);
  });
}

describe("applyReportTransition", () => {
  it("moves submitted → under_review", async () => {
    const res = await applyReportTransition(transitionSql({ current: "submitted" }), {
      reportId: REPORT_ID,
      toStatus: "under_review",
    });
    expect(res).toEqual({ ok: true, fromStatus: "submitted" });
  });

  it("reopens dismissed → under_review and clears resolution fields", async () => {
    let sawClear = false;
    const res = await applyReportTransition(
      transitionSql({
        current: "dismissed",
        onUpdate: (q) => { sawClear = q.includes("resolution_action = NULL"); },
      }),
      { reportId: REPORT_ID, toStatus: "under_review" },
    );
    expect(res.ok).toBe(true);
    expect(sawClear).toBe(true);
  });

  it("rejects invalid jumps (submitted straight to action_taken)", async () => {
    const res = await applyReportTransition(transitionSql({ current: "submitted" }), {
      reportId: REPORT_ID,
      toStatus: "action_taken",
      resolutionAction: "warning_issued",
      resolutionNote: "A warning was issued.",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_transition");
  });

  it("rejects leaving the terminal action_taken state", async () => {
    const res = await applyReportTransition(transitionSql({ current: "action_taken" }), {
      reportId: REPORT_ID,
      toStatus: "under_review",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_transition");
  });

  it("requires resolution action + note to resolve", async () => {
    const noNote = await applyReportTransition(transitionSql({ current: "under_review" }), {
      reportId: REPORT_ID,
      toStatus: "action_taken",
      resolutionAction: "suspension",
      resolutionNote: "",
    });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.code).toBe("invalid_resolution");

    const noAction = await applyReportTransition(transitionSql({ current: "under_review" }), {
      reportId: REPORT_ID,
      toStatus: "dismissed",
      resolutionAction: null,
      resolutionNote: "Reviewed carefully; no violation found.",
    });
    expect(noAction.ok).toBe(false);
    if (!noAction.ok) expect(noAction.code).toBe("invalid_resolution");
  });

  it("resolves under_review → action_taken with full resolution fields", async () => {
    let stampedResolution = false;
    const res = await applyReportTransition(
      transitionSql({
        current: "under_review",
        onUpdate: (q, params) => {
          stampedResolution = q.includes("resolved_at = NOW()") && params.includes("warning_issued");
        },
      }),
      {
        reportId: REPORT_ID,
        toStatus: "action_taken",
        resolutionAction: "warning_issued",
        resolutionNote: "Warned the cleaner about late arrivals.",
        resolvedByClerkId: "user_admin1",
      },
    );
    expect(res).toEqual({ ok: true, fromStatus: "under_review" });
    expect(stampedResolution).toBe(true);
  });

  it("returns conflict when the CAS update loses the race", async () => {
    const res = await applyReportTransition(
      transitionSql({ current: "under_review", casWins: false }),
      {
        reportId: REPORT_ID,
        toStatus: "dismissed",
        resolutionAction: "none",
        resolutionNote: "No violation found after review.",
      },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("conflict");
  });

  it("returns not_found for a missing report", async () => {
    const res = await applyReportTransition(transitionSql({ current: null }), {
      reportId: REPORT_ID,
      toStatus: "under_review",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not_found");
  });
});

// ── Reference formatting ─────────────────────────────────────────────────────

describe("reportReference", () => {
  it("derives a stable human-facing case reference", () => {
    expect(reportReference("55555555-5555-4555-8555-555555555555")).toBe("R-55555555");
    expect(reportReference("abcdef12-3456-4789-8abc-def123456789")).toBe("R-ABCDEF12");
  });
});
