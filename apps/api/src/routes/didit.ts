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
  return c.json({
    status: row?.didit_status ?? "not_started",
    sessionId: row?.didit_verification_id ?? null,
  });
});

// ─── POST /webhooks/didit ─────────────────────────────────────────────────────
// Public route — authenticated by HMAC signature, not Clerk JWT.
// Mounted at /webhooks/didit so the canonical URL is api.getsweepr.com/webhooks/didit.

export const diditWebhookRouter = new Hono<AppBindings>();

diditWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const sig =
    c.req.header("x-signature") ?? c.req.header("x-didit-signature") ?? "";

  if (c.env.DIDIT_WEBHOOK_SECRET) {
    const valid = await verifyDiditSignature(
      rawBody,
      sig,
      c.env.DIDIT_WEBHOOK_SECRET
    );
    if (!valid) {
      logger.warn("Didit webhook: invalid signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  let payload: {
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

  logger.info("Didit webhook processed", { sessionId, status });
  serverTrack(c.env, payload.vendor_data ?? sessionId, "didit_decision", {
    status,
  });

  return c.json({ received: true });
});
