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
 * Yardstik API client — "Reports Without Invitations" flow.
 *
 * Sweepr never collects or stores candidate PII (SSN, DOB, address). We
 * create a candidate with name + email only, then order a report and hand
 * the candidate the `meta.apply` URL Yardstik returns — a hosted intake form
 * on Yardstik's own servers where the candidate enters everything sensitive
 * and gives FCRA consent directly to Yardstik.
 *
 * When YARDSTIK_API_KEY is absent (sandbox / pre-approval), every call falls
 * through to a deterministic mock mirroring the real response shapes. See
 * https://developer.yardstik.com/ for the API reference.
 */

const YARDSTIK_BASE = "https://api.yardstik.com";

export type YardstikRawStatus =
  | "created" | "expired" | "queued" | "processing" | "pending"
  | "pre_adverse" | "approved_to_process" | "info_requested" | "dispute"
  | "pending_approval" | "ys_qa_review" | "exception" | "on_hold"
  | "consider" | "clear" | "proceed" | "final_adverse" | "canceled"
  | "pass" | "fail";

/** Our normalized status vocabulary — unchanged from the Checkr integration. */
export type ReportStatus =
  | "not_started" | "invited" | "pending" | "consider" | "clear"
  | "suspended" | "dispute" | "pre_adverse_action" | "adverse_action";

/**
 * Collapse Yardstik's ~19 report statuses onto the smaller vocabulary the
 * rest of the app already compares against. Positive terminal outcomes
 * (clear/proceed/pass) all mean "cleared"; everything still moving
 * (queued/processing/pending/etc., including the minor-candidate consent
 * detour) is "pending" — Sweepr's UI only distinguishes not-started /
 * in-progress / needs-adjudication / cleared / adverse, matching the FCRA
 * decision points, not every internal Yardstik queue state.
 */
export function mapReportStatus(raw: YardstikRawStatus | string): ReportStatus {
  switch (raw) {
    case "clear":
    case "proceed":
    case "pass":
      return "clear";
    case "consider":
      return "consider";
    case "dispute":
      return "dispute";
    case "pre_adverse":
      return "pre_adverse_action";
    case "final_adverse":
    case "fail":
      return "adverse_action";
    case "canceled":
    case "expired":
      return "suspended";
    case "created":
      return "invited";
    default:
      // queued, processing, pending, approved_to_process, info_requested,
      // pending_approval, ys_qa_review, exception, on_hold
      return "pending";
  }
}

export interface YardstikCandidate {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  external_id?: string | null;
}

export interface YardstikReport {
  id: string;
  status: YardstikRawStatus | string;
  candidate_id: string;
  external_id?: string | null;
  package_name?: string | null;
  meta?: { apply?: string; entity?: string };
  created_at: string;
  completed_at: string | null;
}

/** POST /reports response shape used by the invite flow. */
export interface YardstikOrderedReport extends YardstikReport {
  applyUrl: string;
  expiresAt: string;
}

export interface YardstikWebhookBody {
  id: string;
  event: string; // "created" | "updated" | "deleted" | ...
  resource_id: string;
  resource_type: string; // "candidate" | "report" | "invitation" | ...
  external_id?: string | null;
  status: string;
  timestamp: string;
}

export function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function authHeader(rawApiKey: string): Record<string, string> {
  let key = stripWrappingQuotes(rawApiKey);
  key = key.replace(/^Authorization:\s*/i, "").trim();
  key = key.replace(/^Account\s+/i, "").trim();
  return {
    Authorization: `Account ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function normalizeBaseUrl(rawBaseUrl?: string): string {
  return stripWrappingQuotes(rawBaseUrl || YARDSTIK_BASE).replace(/\/+$/, "");
}

// ─── Mock implementation ──────────────────────────────────────────────────────

function mockClient(accountPackageId: string, sorMonitorPackageId?: string) {
  return {
    async createCandidate(email: string, firstName: string, lastName: string, externalId?: string): Promise<YardstikCandidate> {
      return {
        id: `mock_cand_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        email,
        first_name: firstName,
        last_name: lastName,
        external_id: externalId ?? null,
      };
    },

    async createReport(candidateId: string, externalId?: string): Promise<YardstikOrderedReport> {
      const id = `mock_rep_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const base = "https://clean.getsweepr.com";
      return {
        id,
        status: "created",
        candidate_id: candidateId,
        external_id: externalId ?? null,
        package_name: accountPackageId,
        meta: { apply: `${base}/yardstik-simulate?inv=${id}&pkg=${accountPackageId}` },
        created_at: new Date().toISOString(),
        completed_at: null,
        applyUrl: `${base}/yardstik-simulate?inv=${id}&pkg=${accountPackageId}`,
        expiresAt: expires.toISOString(),
      };
    },

    async createMonitorReport(candidateId: string, externalId?: string): Promise<YardstikOrderedReport> {
      const id = `mock_mon_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      return {
        id,
        status: "created",
        candidate_id: candidateId,
        external_id: externalId ?? null,
        package_name: sorMonitorPackageId ?? "mock_sor_monitor",
        created_at: new Date().toISOString(),
        completed_at: null,
        applyUrl: "",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    },

    async getReport(reportId: string): Promise<YardstikReport> {
      return {
        id: reportId,
        status: "clear",
        candidate_id: "mock_cand",
        package_name: accountPackageId,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
    },

    async getReportRaw(reportId: string): Promise<Record<string, unknown>> {
      // Mirrors the live payload closely enough to exercise the admin
      // report-detail panel end to end without a Yardstik account.
      return {
        id: reportId,
        status: "consider",
        result: "consider",
        candidate_id: "mock_cand",
        package_name: accountPackageId || "Federal Premium",
        created_at: new Date(Date.now() - 86_400_000).toISOString(),
        completed_at: new Date().toISOString(),
        screenings: [
          { type: "ssn_trace", name: "SSN Trace", status: "complete", result: "clear" },
          { type: "sex_offender_search", name: "Sex Offender Search", status: "complete", result: "clear" },
          { type: "national_criminal_search", name: "National Criminal Search", status: "complete", result: "consider",
            records: [{ court: "Mock County Court", offense: "Sample record (mock)", disposition: "Dismissed", date: "2021-04-02" }] },
          { type: "county_criminal_search", name: "County Criminal Search", status: "complete", result: "clear" },
        ],
      };
    },

    async proceedReport(_candidateId: string, _reportId: string): Promise<void> {
      /* mock: no-op, mirrors the real PATCH /candidates/{id}/approve_by_report */
    },

    async createAdverseAction(_reportId: string, _violationDescription: string): Promise<void> {
      /* mock: no-op */
    },
  };
}

// ─── Live implementation ──────────────────────────────────────────────────────

function liveClient(apiKey: string, accountPackageId: string, explicitBaseUrl?: string, sorMonitorPackageId?: string) {
  const base = normalizeBaseUrl(explicitBaseUrl);

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: authHeader(apiKey),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Yardstik ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    async createCandidate(email: string, firstName: string, lastName: string, externalId?: string): Promise<YardstikCandidate> {
      return req<YardstikCandidate>("POST", "/candidates", {
        email,
        first_name: firstName,
        last_name: lastName,
        external_id: externalId ?? undefined,
      });
    },

    async createReport(candidateId: string, externalId?: string): Promise<YardstikOrderedReport> {
      const report = await req<YardstikReport>("POST", "/reports", {
        candidate_id: candidateId,
        account_package_id: accountPackageId,
        external_id: externalId ?? undefined,
      });
      const applyUrl = report.meta?.apply ?? "";
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      return { ...report, applyUrl, expiresAt };
    },

    /**
     * Order the ongoing SOR (Sex Offender Registry) monitoring package against
     * an EXISTING candidate. The candidate already supplied the PII the monitor
     * needs (name + DOB) when they completed the initial screening report, so
     * Yardstik reuses it — no second hosted apply step for the cleaner. Throws
     * if no SOR monitoring package id is configured (caller gates on this).
     */
    async createMonitorReport(candidateId: string, externalId?: string): Promise<YardstikOrderedReport> {
      if (!sorMonitorPackageId) {
        throw new Error("Yardstik SOR monitor package id not configured");
      }
      const report = await req<YardstikReport>("POST", "/reports", {
        candidate_id: candidateId,
        account_package_id: sorMonitorPackageId,
        external_id: externalId ?? undefined,
      });
      const applyUrl = report.meta?.apply ?? "";
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      return { ...report, applyUrl, expiresAt };
    },

    async getReport(reportId: string): Promise<YardstikReport> {
      return req<YardstikReport>("GET", `/reports/${reportId}`);
    },

    /**
     * The COMPLETE report payload as Yardstik returns it — screenings, records,
     * adjudication, everything. Used only by the admin report-detail proxy; the
     * response is rendered live in the console and NEVER persisted (we store no
     * candidate PII beyond ids/status — keep it that way).
     */
    async getReportRaw(reportId: string): Promise<Record<string, unknown>> {
      return req<Record<string, unknown>>("GET", `/reports/${reportId}`);
    },

    /**
     * Clear a "consider" report — Yardstik's equivalent of Checkr's
     * `adjudicate(reportId, "engaged")`. Moves the report to `proceed`.
     */
    async proceedReport(candidateId: string, reportId: string): Promise<void> {
      await req("PATCH", `/candidates/${candidateId}/approve_by_report`, { report_id: reportId });
    },

    /**
     * Start FCRA adverse action on a "consider" report — Yardstik's
     * equivalent of Checkr's `adjudicate(reportId, "pre_adverse_action")`.
     * Yardstik notifies the candidate and runs the waiting-period timer
     * itself; there is no separate "finalize" call — it auto-completes to
     * `final_adverse` (reported via the report.updated webhook) unless
     * canceled first.
     */
    async createAdverseAction(reportId: string, violationDescription: string): Promise<void> {
      await req("POST", `/reports/${reportId}/adverse_actions`, {
        violations: [{ description: violationDescription }],
      });
    },
  };
}

// ─── Exported factory ─────────────────────────────────────────────────────────

export function yardstikClient(env: {
  YARDSTIK_API_KEY?: string;
  YARDSTIK_ACCOUNT_PACKAGE_ID?: string;
  YARDSTIK_SOR_MONITOR_PACKAGE_ID?: string;
  YARDSTIK_API_URL?: string;
}) {
  // Trim wrapping quotes / stray whitespace a dashboard or `wrangler secret
  // put` paste can leave on the value — an invisible trailing newline here
  // otherwise produces a malformed account_package_id and a 422 from Yardstik.
  const packageId = stripWrappingQuotes(env.YARDSTIK_ACCOUNT_PACKAGE_ID ?? "").trim();
  const sorMonitorPackageId =
    stripWrappingQuotes(env.YARDSTIK_SOR_MONITOR_PACKAGE_ID ?? "").trim() || undefined;
  if (!env.YARDSTIK_API_KEY) return mockClient(packageId, sorMonitorPackageId);
  return liveClient(
    env.YARDSTIK_API_KEY,
    packageId,
    stripWrappingQuotes(env.YARDSTIK_API_URL ?? "").trim() || undefined,
    sorMonitorPackageId,
  );
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify Yardstik's HMAC-SHA256 webhook signature.
 * Header: x-yardstik-webhook-signature (hex-encoded HMAC of the raw body,
 * signed with the account's dedicated WEBHOOK_SIGNATURE API key — a
 * separate key from the main API key, created in the Yardstik dashboard).
 */
export async function verifyYardstikSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// ─── FCRA timing helpers ──────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Minimum business days (Mon–Fri) after the pre-adverse notice before a final
 * adverse action may complete. Federal FCRA practice treats 5 business days as
 * the reasonable-waiting-period floor.
 */
const MIN_BUSINESS_DAYS = 5;

/**
 * Extra CALENDAR days added on top of the 5 business days as a conservative
 * buffer for federal holidays (which are not weekends and would otherwise
 * shorten the effective business-day window) and for stricter state rules
 * (CA, NY, etc.). A flat +2 keeps us safely at or beyond every 5-business-day
 * requirement without a holiday calendar.
 */
const HOLIDAY_BUFFER_DAYS = 2;

/** Advance `date` by `n` business days, skipping Saturdays and Sundays. */
function addBusinessDays(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  let remaining = n;
  while (remaining > 0) {
    out.setTime(out.getTime() + ONE_DAY_MS);
    const day = out.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) remaining--;
  }
  return out;
}

/**
 * Earliest date a final adverse action can complete: 5 actual business days
 * after the pre-adverse notice, plus a 2-calendar-day holiday buffer. Computed
 * from the real weekday calendar so it always covers 5 business days even when
 * the window straddles a weekend or federal holiday (the previous "7 calendar
 * days" approximation silently fell short across holidays).
 */
export function adverseActionEarliestDate(preAdverseAt: Date): Date {
  const afterBusinessDays = addBusinessDays(preAdverseAt, MIN_BUSINESS_DAYS);
  return new Date(afterBusinessDays.getTime() + HOLIDAY_BUFFER_DAYS * ONE_DAY_MS);
}
