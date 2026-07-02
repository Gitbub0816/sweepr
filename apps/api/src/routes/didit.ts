/**
 * Didit routes — hosted identity verification (Session/workflow flow).
 *
 * Privacy summary:
 *  • Sweepr NEVER receives or stores ID images, selfies, or biometric data.
 *  • We create a session server-side (x-api-key + workflow_id) and hand the
 *    applicant a hosted Didit URL; all sensitive capture happens on Didit.
 *  • Didit credentials are never exposed to the frontend — the client only
 *    receives the hosted `url`.
 *  • Decisions arrive via HMAC-SHA256 signature-verified webhooks.
 *  • If Didit is unconfigured (stub mode), the session degrades to manual
 *    admin review and onboarding still completes.
 */

import { Hono } from "hono";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  diditClient,
  verifyDiditSignature,
  mapDiditStatus,
  type DiditWorkflow,
} from "../lib/didit";
import { serverTrack } from "../lib/posthog";
import type { AppBindings } from "../types";

export const diditRouter = new Hono<AppBindings>();

// ─── POST /didit/session ──────────────────────────────────────────────────────
// Creates a hosted verification session and returns ONLY the hosted URL.

diditRouter.post("/session", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  // Pick the workflow based on the cleaner's account type.
  const rows = (await sql`
    SELECT account_type FROM cleaners WHERE user_id = ${user.id} LIMIT 1
  `) as { account_type: string | null }[];
  const workflow: DiditWorkflow =
    rows[0]?.account_type === "business" ? "business" : "personal";

  const client = diditClient(c.env);

  let session;
  try {
    session = await client.createSession({
      workflow,
      vendorData: user.id,
      callbackUrl: "https://app.getsweepr.com/onboarding",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Didit session creation failed", { msg, workflow });
    return c.json({ error: "didit_session_failed", detail: msg }, 502);
  }

  const status = session.stub ? "in_review" : "pending";
  await sql`
    UPDATE cleaners
    SET didit_verification_id = ${session.session_id},
        didit_status          = ${status}
    WHERE user_id = ${user.id}
  `;

  serverTrack(c.env, user.id, "didit_session_created", {
    workflow,
    stub: session.stub,
  });

  // Only the hosted URL crosses the wire — never the API key or workflow id.
  return c.json({
    url: session.url,
    sessionId: session.session_id,
    workflow,
    stub: session.stub,
  });
});

// ─── GET /didit/status ────────────────────────────────────────────────────────

diditRouter.get("/status", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = (await sql`
    SELECT didit_status, didit_verification_id
    FROM cleaners WHERE user_id = ${user.id} LIMIT 1
  `) as { didit_status: string | null; didit_verification_id: string | null }[];

  const row = rows[0];
  const sessionId = row?.didit_verification_id ?? null;
  const status = row?.didit_status ?? "not_started";

  // If the stored session is a stub (created when keys were absent) but live
  // credentials are now configured, wipe the stale record so the applicant
  // is sent through the real Didit flow instead of seeing a phantom "in_review".
  const isStubSession = sessionId?.startsWith("stub_didit_");
  const client = diditClient(c.env);
  if (isStubSession && client.isLive("personal")) {
    await sql`
      UPDATE cleaners
      SET didit_verification_id = NULL, didit_status = 'not_started'
      WHERE user_id = ${user.id}
    `;
    return c.json({ status: "not_started", sessionId: null });
  }

  return c.json({ status, sessionId });
});

// ─── POST /webhooks/didit ─────────────────────────────────────────────────────
// Public route — authenticated by HMAC signature, not Clerk JWT.
// Mounted at /webhooks/didit so the canonical URL is api.getsweepr.com/webhooks/didit.

export const diditWebhookRouter = new Hono<AppBindings>();

diditWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();

  // V3 uses X-Signature-V2 (canonicalised HMAC) + X-Timestamp (freshness).
  const sigV2 = c.req.header("x-signature-v2") ?? "";
  const timestamp = c.req.header("x-timestamp") ?? "";

  if (c.env.DIDIT_WEBHOOK_SECRET) {
    const valid = await verifyDiditSignature(
      rawBody,
      sigV2,
      c.env.DIDIT_WEBHOOK_SECRET,
      timestamp
    );
    if (!valid) {
      logger.warn("Didit webhook: invalid signature or stale timestamp");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  let payload: {
    event_id?: string;
    session_id?: string;
    status?: string;
    vendor_data?: string;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return c.json({ error: "Bad JSON" }, 400);
  }

  const sessionId = payload.session_id;
  if (!sessionId) return c.json({ error: "Missing session_id" }, 400);

  const status = mapDiditStatus(payload.status);
  const sql = getDb(c.env.DATABASE_URL);

  await sql`
    UPDATE cleaners
    SET didit_status = ${status}
    WHERE didit_verification_id = ${sessionId}
  `;

  logger.info("Didit webhook processed", { sessionId, status, raw: payload.status });
  serverTrack(c.env, payload.vendor_data ?? sessionId, "didit_decision", {
    status,
    raw_status: payload.status,
  });

  return c.json({ received: true });
});
