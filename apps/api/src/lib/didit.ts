/**
 * Didit identity-verification client — hosted Session v3 flow.
 *
 * Verification runs in three moves:
 *  1. Backend POSTs workflow_id to /v3/session/ with x-api-key → gets { url, session_id }.
 *  2. Frontend opens that url (redirect or SDK modal) → user completes verification on Didit.
 *  3. Didit POSTs a signed webhook (X-Signature-V2, X-Timestamp) → we verify + update DB.
 *
 * The API key NEVER touches the browser. Only the session url crosses the wire.
 */

const DIDIT_BASE = "https://verification.didit.me/v3";

// Hardcoded workflow UUIDs — config values, not secrets, not env vars.
const WORKFLOW_ID_PERSONAL = "f4c4042a-6cf4-480b-b94c-53a07f8a4381"; // "Sweepr_Final"
const WORKFLOW_ID_BUSINESS = "f4c4042a-6cf4-480b-b94c-53a07f8a4381"; // update when KYB workflow exists

export type DiditStatus =
  | "not_started"
  | "pending"   // session created; applicant has not finished
  | "in_review" // submitted; Didit / admin reviewing
  | "approved"  // verification passed
  | "declined"  // verification failed
  | "expired";  // session expired unused

export type DiditWorkflow = "personal" | "business";

export interface DiditSession {
  session_id: string;
  url: string;
  status: string;
  workflow: DiditWorkflow;
  stub: boolean;
}

export interface DiditWebhookPayload {
  event_id?: string;
  session_id: string;
  status: string;
  vendor_data?: string;
  workflow_id?: string;
  [key: string]: unknown;
}

export interface DiditEnv {
  DIDIT_API_KEY?: string;
  // DIDIT_WORKFLOW_ID no longer used — workflow IDs are hardcoded constants above.
  DIDIT_WEBHOOK_SECRET?: string;
}

/**
 * Map a Didit v3 session status string (mixed-case literals) onto our internal enum.
 * V3 statuses: "Not Started" | "In Progress" | "Awaiting User" | "In Review" |
 *              "Approved" | "Declined" | "Resubmitted" | "Abandoned" | "Expired" | "Kyc Expired"
 */
export function mapDiditStatus(raw: string | undefined | null): DiditStatus {
  switch ((raw ?? "").toLowerCase().trim()) {
    case "approved":
    case "verified":
      return "approved";
    case "declined":
    case "rejected":
    case "failed":
      return "declined";
    case "in review":
    case "in_review":
    case "review":
      return "in_review";
    case "expired":
    case "kyc expired":
    case "kyc_expired":
      return "expired";
    case "not started":
    case "not_started":
      return "not_started";
    default:
      // "In Progress" | "Awaiting User" | "Resubmitted" | "Abandoned" → pending
      return "pending";
  }
}

// ─── Exported factory ─────────────────────────────────────────────────────────

export function diditClient(env: DiditEnv) {
  return {
    /** True when live credentials exist (API key set). */
    isLive(_workflow?: DiditWorkflow): boolean {
      return Boolean(env.DIDIT_API_KEY);
    },

    /**
     * Create a hosted verification session.
     * Returns a stub when DIDIT_API_KEY is absent so onboarding degrades gracefully.
     */
    async createSession(opts: {
      workflow: DiditWorkflow;
      vendorData: string;
      callbackUrl?: string;
    }): Promise<DiditSession> {
      if (!env.DIDIT_API_KEY) {
        const id = `stub_didit_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        return {
          session_id: id,
          url: `https://app.getsweepr.com/didit-simulate?session=${id}&workflow=${opts.workflow}`,
          status: "Not Started",
          workflow: opts.workflow,
          stub: true,
        };
      }

      const wfId = opts.workflow === "business" ? WORKFLOW_ID_BUSINESS : WORKFLOW_ID_PERSONAL;

      const body: Record<string, string> = {
        workflow_id: wfId,
        vendor_data: opts.vendorData,
      };
      if (opts.callbackUrl) {
        body.callback = opts.callbackUrl;
      }

      const res = await fetch(`${DIDIT_BASE}/session/`, {
        method: "POST",
        headers: {
          "x-api-key": env.DIDIT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[didit] POST /v3/session/ → ${res.status}`, { body, response: text });
        throw new Error(`Didit POST /session → ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        session_id: string;
        url: string;
        status?: string;
      };
      return {
        session_id: data.session_id,
        url: data.url,
        status: data.status ?? "Not Started",
        workflow: opts.workflow,
        stub: false,
      };
    },

    /** Retrieve the current decision for a session (live only). */
    async getSession(sessionId: string): Promise<{ status: string } | null> {
      if (!env.DIDIT_API_KEY) return null;
      const res = await fetch(`${DIDIT_BASE}/session/${sessionId}/decision/`, {
        headers: { "x-api-key": env.DIDIT_API_KEY },
      });
      if (!res.ok) return null;
      return (await res.json()) as { status: string };
    },
  };
}

// ─── Webhook signature verification (V3 / X-Signature-V2) ────────────────────

/**
 * Whole-number floats (1.0 → 1) recursively — matches Didit's server canonicalisation.
 */
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)])
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

/** Recursive lexicographic key sort (array order preserved). */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

/**
 * Verify a Didit v3 webhook using X-Signature-V2 (recommended).
 *
 * Canonical form: shortenFloats → sortKeys → JSON.stringify (unescaped Unicode).
 * Also checks X-Timestamp freshness (±300s).
 */
export async function verifyDiditSignature(
  rawBody: string,
  signature: string,
  secret: string,
  timestampHeader?: string
): Promise<boolean> {
  // Freshness check — reject replays older/newer than 300s.
  if (timestampHeader) {
    const ts = Number(timestampHeader);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
