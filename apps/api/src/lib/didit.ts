/**
 * Didit identity-verification client — hosted Session (workflow) flow.
 *
 * We create a verification session server-side using DIDIT_API_KEY as the
 * `x-api-key` header and a DIDIT_WORKFLOW_ID in the request body. Didit returns
 * a hosted verification URL that the applicant is redirected to; they upload
 * their ID and complete liveness directly on Didit's servers — no document or
 * biometric PII ever passes through Sweepr.
 *
 * Didit credentials are NEVER exposed to the frontend. The frontend only ever
 * receives the hosted session `url`.
 *
 * Two workflows are supported:
 *   • personal  → DIDIT_WORKFLOW_ID            (individual cleaner KYC)
 *   • business  → DIDIT_WORKFLOW_ID_BUSINESS   (authorized-rep / KYB)
 *
 * When DIDIT_API_KEY or the relevant workflow id is missing, every call falls
 * through to a deterministic stub so onboarding still works and applications
 * fall back to manual admin review. Switch to live by setting the secrets.
 */

const DIDIT_BASE = "https://verification.didit.me/v2";

export type DiditStatus =
  | "not_started"
  | "pending" // session created; applicant has not finished
  | "in_review" // submitted; Didit / admin reviewing
  | "approved" // verification passed
  | "declined" // verification failed
  | "expired"; // session expired unused

export type DiditWorkflow = "personal" | "business";

export interface DiditSession {
  session_id: string;
  url: string;
  status: string;
  workflow: DiditWorkflow;
  stub: boolean;
}

export interface DiditWebhookPayload {
  session_id: string;
  status: string;
  vendor_data?: string;
  workflow_id?: string;
  [key: string]: unknown;
}

export interface DiditEnv {
  DIDIT_API_KEY?: string;
  DIDIT_WORKFLOW_ID?: string;
  DIDIT_WORKFLOW_ID_BUSINESS?: string;
  DIDIT_WEBHOOK_SECRET?: string;
}

/** Map a Didit session/decision status string onto our internal enum. */
export function mapDiditStatus(raw: string | undefined | null): DiditStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "approved":
    case "verified":
      return "approved";
    case "declined":
    case "rejected":
    case "failed":
      return "declined";
    case "in_review":
    case "in review":
    case "review":
      return "in_review";
    case "expired":
      return "expired";
    case "not_started":
      return "not_started";
    default:
      return "pending";
  }
}

function workflowId(env: DiditEnv, workflow: DiditWorkflow): string | undefined {
  return workflow === "business"
    ? env.DIDIT_WORKFLOW_ID_BUSINESS
    : env.DIDIT_WORKFLOW_ID;
}

// ─── Exported factory ─────────────────────────────────────────────────────────

export function diditClient(env: DiditEnv) {
  return {
    /** True when live credentials exist for the requested workflow. */
    isLive(workflow: DiditWorkflow): boolean {
      return Boolean(env.DIDIT_API_KEY && workflowId(env, workflow));
    },

    /**
     * Create a hosted verification session. Returns a stub when credentials are
     * absent so the applicant flow degrades to manual admin review.
     */
    async createSession(opts: {
      workflow: DiditWorkflow;
      vendorData: string; // our internal reference (e.g. user id)
      callbackUrl?: string;
    }): Promise<DiditSession> {
      const wfId = workflowId(env, opts.workflow);

      if (!env.DIDIT_API_KEY || !wfId) {
        const id = `stub_didit_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        return {
          session_id: id,
          url: `https://app.getsweepr.com/didit-simulate?session=${id}&workflow=${opts.workflow}`,
          status: "pending",
          workflow: opts.workflow,
          stub: true,
        };
      }

      const body: Record<string, string> = {
        workflow_id: wfId,
        vendor_data: opts.vendorData,
      };
      if (opts.callbackUrl) {
        // Didit v2 uses "redirect_url" for the post-verification callback.
        body.redirect_url = opts.callbackUrl;
      }

      const res = await fetch(`${DIDIT_BASE}/session/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.DIDIT_API_KEY}`,
          "x-api-key": env.DIDIT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Log full details so the 400 body is visible in Cloudflare tail logs.
        console.error(`[didit] POST /session → ${res.status}`, {
          body: JSON.stringify(body),
          response: text,
        });
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
        status: data.status ?? "pending",
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

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify a Didit webhook HMAC-SHA256 signature.
 * Header: X-Signature (hex-encoded HMAC of the raw request body).
 */
export async function verifyDiditSignature(
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
  // Constant-time-ish comparison.
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
