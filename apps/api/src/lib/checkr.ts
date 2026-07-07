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
 * Checkr API client — Invitation (Native Hosted) flow.
 *
 * In this flow Sweepr NEVER collects or stores candidate PII (SSN, DOB,
 * address).  We create a minimal candidate record with name + email, then
 * obtain a Checkr-hosted invitation URL.  The candidate enters all sensitive
 * information directly on Checkr's servers.  Checkr presents FCRA-required
 * Disclosure & Authorization (D&A) and obtains consent before collecting PII.
 *
 * When CHECKR_API_KEY is absent (sandbox / pre-approval), every call falls
 * through to a deterministic mock that mirrors the real Checkr response shapes.
 * Switch to live by setting CHECKR_API_KEY + optional CHECKR_API_URL in wrangler
 * secrets/vars. Use CHECKR_API_URL for staging/sandbox accounts when the key is
 * issued for a non-production Checkr host.
 */

const CHECKR_BASE = "https://api.checkr.com/v1";
const CHECKR_STAGING_BASE = "https://api.checkr-staging.com/v1";

/**
 * Once a host has authenticated successfully for a given key, remember it for
 * the isolate's lifetime so subsequent calls skip the detection round-trip.
 * Keyed by a short prefix of the key — enough to distinguish rotations without
 * holding the whole secret in the map.
 */
const workingHostCache = new Map<string, string>();

export type CheckrStatus =
  | "not_started"
  | "invited"            // invitation sent; candidate has not completed form
  | "pending"            // Checkr report ordered; adjudication in progress
  | "consider"           // report has flags; requires adjudication
  | "clear"              // report passed; no adverse findings
  | "suspended"          // account suspended by Checkr
  | "dispute"            // candidate disputed report
  | "pre_adverse_action" // pre-adverse notice sent; 5-day wait
  | "adverse_action";    // final adverse action taken

export interface CheckrCandidate {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface CheckrInvitation {
  id: string;
  status: "pending" | "completed" | "expired";
  invitation_url: string;
  package: string;
  candidate_id: string;
  created_at: string;
  expires_at: string;
}

export interface CheckrReport {
  id: string;
  status: "pending" | "consider" | "clear" | "suspended" | "dispute";
  candidate_id: string;
  package: string;
  created_at: string;
  completed_at: string | null;
  adjudication: "pre_adverse_action" | "adverse_action" | "engaged" | null;
  turnaround_time: number | null;
}

export interface CheckrAdjudication {
  id: string;
  report_id: string;
  adjudication: "engaged" | "pre_adverse_action" | "adverse_action";
  created_at: string;
}

export interface CheckrWebhookPayload {
  id: string;
  type: string;
  created_at: string;
  data: {
    object: CheckrReport | CheckrCandidate | CheckrInvitation;
  };
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Normalize common dashboard/secret-manager paste mistakes without exposing the
 * secret. Checkr expects HTTP Basic auth with the API key as username and a blank
 * password, i.e. base64(`${key}:`).
 */
function normalizeCheckrApiKey(rawApiKey: string): string {
  let key = stripWrappingQuotes(rawApiKey);

  // Some operators paste the full header value or `Authorization: ...`.
  key = key.replace(/^Authorization:\s*/i, "").trim();

  // Some operators paste `Bearer sk_...` from a generic API-key UI.
  key = key.replace(/^Bearer\s+/i, "").trim();

  // Some operators paste curl's `-u sk_xxx:` value including the trailing colon.
  if (!key.toLowerCase().startsWith("basic ") && key.endsWith(":")) {
    key = key.slice(0, -1).trim();
  }

  return key;
}

function authHeader(rawApiKey: string): Record<string, string> {
  const apiKey = normalizeCheckrApiKey(rawApiKey);
  const authorization = apiKey.toLowerCase().startsWith("basic ")
    ? apiKey
    : `Basic ${btoa(apiKey + ":")}`;

  return {
    Authorization: authorization,
    "Content-Type": "application/json",
    Accept: "application/json",
    // Workers fetch sends NO User-Agent by default, and Checkr's edge WAF
    // blocks UA-less requests with 403 {"error":"Request blocked"} before
    // they ever reach the API (real API auth failures return Checkr-shaped
    // 401 {"error":"Bad authentication error"}). Identify ourselves.
    "User-Agent": "Sweepr-API/1.0 (+https://getsweepr.com)",
  };
}

function normalizeCheckrBaseUrl(rawBaseUrl?: string): string {
  const cleaned = stripWrappingQuotes(rawBaseUrl || CHECKR_BASE).replace(/\/+$/, "");
  return cleaned.endsWith("/v1") ? cleaned : `${cleaned}/v1`;
}

// ─── Mock implementation ──────────────────────────────────────────────────────

/** Returns a mock that mirrors Checkr's real response shapes. */
function mockClient(packageSlug: string) {
  return {
    async createCandidate(
      email: string,
      firstName: string,
      lastName: string
    ): Promise<CheckrCandidate> {
      return {
        id: `mock_cand_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        email,
        first_name: firstName,
        last_name: lastName,
      };
    },

    async createInvitation(
      candidateId: string,
      workState: string
    ): Promise<CheckrInvitation> {
      const id = `mock_inv_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // The invitation URL is your own simulate page; swap for real Checkr URL in prod.
      const base = "https://clean.getsweepr.com";
      return {
        id,
        status: "pending",
        invitation_url: `${base}/checkr-simulate?inv=${id}&pkg=${packageSlug}&state=${workState}`,
        package: packageSlug,
        candidate_id: candidateId,
        created_at: new Date().toISOString(),
        expires_at: expires.toISOString(),
      };
    },

    async getReport(reportId: string): Promise<CheckrReport> {
      return {
        id: reportId,
        status: "clear",
        candidate_id: "mock_cand",
        package: packageSlug,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        adjudication: null,
        turnaround_time: 3600,
      };
    },

    async adjudicate(
      reportId: string,
      adjudication: "engaged" | "pre_adverse_action" | "adverse_action"
    ): Promise<CheckrAdjudication> {
      return {
        id: `mock_adj_${crypto.randomUUID().slice(0, 8)}`,
        report_id: reportId,
        adjudication,
        created_at: new Date().toISOString(),
      };
    },

    async reInvite(
      candidateId: string,
      workState: string
    ): Promise<CheckrInvitation> {
      const id = `mock_inv_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const base = "https://clean.getsweepr.com";
      return {
        id,
        status: "pending",
        invitation_url: `${base}/checkr-simulate?inv=${id}&pkg=${packageSlug}&state=${workState}`,
        package: packageSlug,
        candidate_id: candidateId,
        created_at: new Date().toISOString(),
        expires_at: expires.toISOString(),
      };
    },
  };
}

// ─── Live implementation ──────────────────────────────────────────────────────

function liveClient(apiKey: string, packageSlug: string, explicitBaseUrl?: string) {
  const cacheKey = apiKey.slice(0, 12);

  /**
   * Hosts to try, in order. When CHECKR_API_URL is set explicitly we honor it
   * and never fall back. When it's unset we auto-detect: production first,
   * then the staging host. Staging keys against api.checkr.com fail with
   * 401 "Bad authentication error" or a WAF-level 403 "Request blocked" —
   * both mean "wrong environment", so retrying the staging host resolves a
   * staging account without any config change. Nothing is created on the
   * failing host (auth is rejected before the request body is processed),
   * so the cross-host retry is safe for POSTs.
   */
  function candidateHosts(): string[] {
    if (explicitBaseUrl) return [normalizeCheckrBaseUrl(explicitBaseUrl)];
    const cached = workingHostCache.get(cacheKey);
    const order = [CHECKR_BASE, CHECKR_STAGING_BASE];
    if (cached) return [cached, ...order.filter((h) => h !== cached)];
    return order;
  }

  async function req<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const hosts = candidateHosts();
    let lastError: Error | null = null;

    for (const host of hosts) {
      const res = await fetch(`${host}${path}`, {
        method,
        headers: authHeader(apiKey),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.ok) {
        workingHostCache.set(cacheKey, host);
        return res.json() as Promise<T>;
      }

      const text = await res.text().catch(() => "");
      const environmentMismatch = res.status === 401 || res.status === 403;
      const authHint = environmentMismatch
        ? " Check CHECKR_API_KEY and CHECKR_API_URL; staging keys must be used with the staging API host (https://api.checkr-staging.com), and the secret should be the raw API key, not a dashboard URL."
        : "";
      lastError = new Error(`Checkr ${method} ${path} → ${res.status}: ${text}${authHint}`);

      // Only an auth/blocked failure suggests the wrong environment — anything
      // else (404, 422, 5xx) is a real answer from the right host; don't retry.
      if (!environmentMismatch) throw lastError;
    }

    throw lastError ?? new Error(`Checkr ${method} ${path} failed with no response`);
  }

  return {
    async createCandidate(
      email: string,
      firstName: string,
      lastName: string
    ): Promise<CheckrCandidate> {
      return req<CheckrCandidate>("POST", "/candidates", {
        email,
        first_name: firstName,
        last_name: lastName,
      });
    },

    async createInvitation(
      candidateId: string,
      workState: string
    ): Promise<CheckrInvitation> {
      return req<CheckrInvitation>("POST", "/invitations", {
        candidate_id: candidateId,
        package: packageSlug,
        work_locations: [{ country: "US", state: workState }],
      });
    },

    async getReport(reportId: string): Promise<CheckrReport> {
      return req<CheckrReport>("GET", `/reports/${reportId}`);
    },

    /**
     * Record an adjudication decision on a completed report.
     * Checkr requires this call whenever the employer makes a hire/adverse decision.
     * - "engaged"            → hired; no adverse action
     * - "pre_adverse_action" → starting adverse action; Checkr sends pre-adverse notice
     * - "adverse_action"     → finalizing adverse action after the waiting period
     */
    async adjudicate(
      reportId: string,
      adjudication: "engaged" | "pre_adverse_action" | "adverse_action"
    ): Promise<CheckrAdjudication> {
      return req<CheckrAdjudication>("POST", `/adjudications`, {
        report_id: reportId,
        adjudication,
      });
    },

    /**
     * Create a new invitation for an existing Checkr candidate (check reuse).
     * Used when a cleaner needs a fresh background check without creating a
     * duplicate candidate record.
     */
    async reInvite(
      candidateId: string,
      workState: string
    ): Promise<CheckrInvitation> {
      return req<CheckrInvitation>("POST", "/invitations", {
        candidate_id: candidateId,
        package: packageSlug,
        work_locations: [{ country: "US", state: workState }],
      });
    },
  };
}

// ─── Exported factory ─────────────────────────────────────────────────────────

export function checkrClient(env: {
  CHECKR_API_KEY?: string;
  CHECKR_PACKAGE?: string;
  CHECKR_API_URL?: string;
}) {
  const pkg = env.CHECKR_PACKAGE ?? "tasker_standard";
  if (!env.CHECKR_API_KEY) return mockClient(pkg);
  // Pass the raw configured URL (may be undefined) — liveClient normalizes it
  // and auto-detects production vs staging when it's unset.
  return liveClient(env.CHECKR_API_KEY, pkg, stripWrappingQuotes(env.CHECKR_API_URL ?? "").trim() || undefined);
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify Checkr HMAC-SHA256 webhook signature.
 * Header: X-Checkr-Signature (hex-encoded HMAC of raw body).
 */
export async function verifyCheckrSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time comparison — a plain === leaks match length via timing.
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// ─── FCRA timing helpers ──────────────────────────────────────────────────────

const BUSINESS_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the earliest date a final adverse action can be taken.
 * Federal minimum is 5 business days after pre-adverse notice.
 * California, New York, and several other states require additional time;
 * we conservatively use 7 calendar days to satisfy all states we operate in.
 */
export function adverseActionEarliestDate(preAdverseAt: Date): Date {
  return new Date(preAdverseAt.getTime() + 7 * BUSINESS_DAY_MS);
}
