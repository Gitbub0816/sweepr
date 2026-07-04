/**
 * Scope Review API — cleaner-raised Additional Attention Fee / Service Refusal
 * requests, AI vision triage, admin adjudication, and signed email actions.
 *
 * Mounted at /scope-review (rate-limited like /payments/*).
 *
 * CLEANER (requireAuth, must be the assigned cleaner):
 *   POST /scope-review/requests            create a request (runs AI inline)
 *   GET  /scope-review/requests/mine       my requests for a booking (safe fields)
 *   GET  /scope-review/privileges          my privilege flags
 * ADMIN (requireAuth + admin):
 *   GET  /scope-review/admin/requests      list
 *   GET  /scope-review/admin/requests/:id  full detail
 *   POST /scope-review/admin/requests/:id/decision
 * PUBLIC (token is the auth):
 *   GET  /scope-review/action/:token       execute a signed approve/deny link
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { r2PublicUrl, parseR2Config } from "../lib/r2";
import { runScopeReview } from "../lib/aiScopeReview";
import {
  decideScopeReview,
  loadScopeReviewSettings,
  routeByConfidence,
  aafFeeCents,
  computeRefusalFeeCents,
  ScopeReviewEngineError,
} from "../lib/scopeReviewEngine";
import { notifyScopeReviewCreated } from "../lib/scopeReviewNotify";
import { sha256Hex } from "../lib/approvalNotify";
import type { AppBindings } from "../types";
import type { ScopeReviewFeeCode } from "@sweepr/types";

export const scopeReviewRouter = new Hono<AppBindings>();

const REFUSAL_REASONS = [
  "excessive_clutter", "hoarding", "unsafe_environment", "biohazard", "animal_hazard",
  "structural_hazard", "inaccessible", "scope_exceeded", "other",
] as const;

// ── Cleaner resolution ────────────────────────────────────────────────────────
async function resolveCleaner(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT cl.id FROM users u JOIN cleaners cl ON cl.user_id = u.id WHERE u.clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

// ── CLEANER: create request ────────────────────────────────────────────────────
const createSchema = z
  .object({
    bookingId: z.string().uuid(),
    requestType: z.enum(["additional_attention", "refusal"]),
    notes: z.string().min(10).max(4000),
    refusalReason: z.enum(REFUSAL_REASONS).optional(),
    photoKeys: z.array(z.string().min(1).max(500)).min(2).max(20),
  })
  .refine((v) => v.requestType !== "refusal" || !!v.refusalReason, {
    message: "refusalReason is required for a refusal request",
    path: ["refusalReason"],
  });

scopeReviewRouter.post("/requests", requireAuth, zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const cleanerId = await resolveCleaner(sql, clerkId);
  if (!cleanerId) return c.json({ error: "Forbidden" }, 403);

  const bookingRows = (await sql`
    SELECT b.id, b.status, b.day_status, b.cleaner_id, b.customer_id, b.arrival_verified_at,
           b.completed_at, b.service_type, b.cleaning_level, b.total_price,
           b.address_id
    FROM bookings b WHERE b.id = ${input.bookingId} LIMIT 1
  `) as Array<{
    id: string; status: string; day_status: string | null; cleaner_id: string | null;
    customer_id: string | null; arrival_verified_at: string | null; completed_at: string | null;
    service_type: string | null; cleaning_level: string | null; total_price: number | null;
    address_id: string | null;
  }>;
  const booking = bookingRows[0];
  if (!booking) return c.json({ error: "Booking not found" }, 404);
  if (booking.cleaner_id !== cleanerId) return c.json({ error: "Forbidden" }, 403);

  // Must be checked in (GPS arrival verified) and not yet completed.
  if (!booking.arrival_verified_at) {
    return c.json({ error: "You must be checked in (arrival verified) before raising a request" }, 400);
  }
  if (booking.status === "completed" || booking.day_status === "completed" || booking.completed_at) {
    return c.json({ error: "This booking is already completed" }, 400);
  }

  // Privilege gate.
  const privRows = (await sql`
    SELECT additional_attention_enabled, refusal_request_enabled, disabled_until
    FROM cleaner_privileges WHERE cleaner_id = ${cleanerId} LIMIT 1
  `) as Array<{ additional_attention_enabled: boolean; refusal_request_enabled: boolean; disabled_until: string | null }>;
  const priv = privRows[0];
  if (priv) {
    const disabledActive = priv.disabled_until && new Date(priv.disabled_until).getTime() > Date.now();
    const flag = input.requestType === "additional_attention" ? priv.additional_attention_enabled : priv.refusal_request_enabled;
    if (!flag && disabledActive) {
      return c.json({ error: "Temporarily unavailable due to repeated denied requests." }, 403);
    }
    if (!flag && !priv.disabled_until) {
      return c.json({ error: "This request type is not enabled for your account." }, 403);
    }
  }

  // Photo keys must be scoped to this booking (matches booking_photos key layout).
  const badKey = input.photoKeys.find((k) => !k.startsWith(`bookings/${input.bookingId}/`));
  if (badKey) return c.json({ error: "Invalid photo key for this booking" }, 400);

  const photosJson = JSON.stringify(input.photoKeys.map((k) => ({ storage_key: k })));

  // Insert pending_ai (partial unique index guards against duplicate active requests).
  let requestId: string;
  try {
    const inserted = (await sql`
      INSERT INTO scope_review_requests (
        booking_id, cleaner_id, customer_id, request_type, status,
        selected_package, selected_condition, cleaner_notes, refusal_reason, photos
      ) VALUES (
        ${input.bookingId}, ${cleanerId}, ${booking.customer_id}, ${input.requestType}, 'pending_ai',
        ${booking.service_type}, ${booking.cleaning_level}, ${input.notes},
        ${input.refusalReason ?? null}, ${photosJson}::jsonb
      ) RETURNING id
    `) as Array<{ id: string }>;
    requestId = inserted[0].id;
  } catch (err) {
    const msg = String(err);
    if (msg.includes("uq_scope_review_requests_active") || msg.toLowerCase().includes("unique")) {
      return c.json({ error: "You already have an active request of this type for this booking." }, 409);
    }
    throw err;
  }

  // History summaries for the AI.
  const [custHist, cleanerHist] = await Promise.all([
    buildCustomerHistory(sql, booking.customer_id),
    buildCleanerHistory(sql, cleanerId),
  ]);

  // Public photo URLs for the vision model (R2 public bucket).
  let photoUrls: string[] = [];
  try {
    const cfg = parseR2Config(c.env as Parameters<typeof parseR2Config>[0]);
    photoUrls = input.photoKeys.map((k) => r2PublicUrl(cfg, k));
  } catch { /* no r2 config in some envs */ }

  const addOns = await loadAddOnKeys(sql, input.bookingId);

  const ai = await runScopeReview(c.env, {
    requestType: input.requestType,
    package: booking.service_type,
    selectedCleaningLevel: booking.cleaning_level,
    addOns,
    cleanerNotes: input.notes,
    refusalReason: input.refusalReason ?? null,
    photoUrls,
    customerHistorySummary: custHist,
    cleanerHistorySummary: cleanerHist,
  });

  const route = routeByConfidence(ai.confidence);

  // Auto-cancel guard for high-confidence refusals is OFF by default; we never
  // auto-cancel here regardless — money/cancellation only happens on admin action.
  const expiresAt = route.status === "pending_admin"
    ? new Date(Date.now() + 72 * 3600_000).toISOString()
    : null;

  await sql`
    UPDATE scope_review_requests
    SET status = ${route.status},
        ai_confidence = ${ai.confidence},
        ai_recommendation = ${ai.decision_recommendation},
        ai_response_json = ${JSON.stringify(ai)}::jsonb,
        fee_code = ${ai.recommended_fee_code},
        expires_at = ${expiresAt},
        updated_at = NOW()
    WHERE id = ${requestId}
  `;

  await audit(sql, {
    action: "admin.action",
    actorClerkId: clerkId,
    targetType: "scope_review_request",
    targetId: requestId,
    metadata: {
      event: "scope_review_created",
      requestType: input.requestType,
      aiConfidence: ai.confidence,
      routedStatus: route.status,
    },
    timestamp: new Date().toISOString(),
  });

  // Fan out to admins (best-effort).
  await notifyScopeReviewCreated(sql, c.env, requestId, route.emailKind).catch((err) =>
    logger.error("notifyScopeReviewCreated failed", err, { requestId }),
  );

  if (route.status === "hard_denied") {
    return c.json({
      id: requestId,
      status: route.status,
      message:
        "We could not verify that this booking qualifies for an additional fee or refusal based on the submitted information.",
    });
  }
  return c.json({ id: requestId, status: route.status, aiConfidence: ai.confidence });
});

async function loadAddOnKeys(sql: ReturnType<typeof getDb>, bookingId: string): Promise<string[]> {
  try {
    const rows = (await sql`
      SELECT pricing_line_items_json FROM bookings WHERE id = ${bookingId} LIMIT 1
    `) as Array<{ pricing_line_items_json: unknown }>;
    const items = rows[0]?.pricing_line_items_json;
    if (Array.isArray(items)) {
      return items
        .map((i) => (i as { key?: string; label?: string })?.key ?? (i as { label?: string })?.label)
        .filter((x): x is string => typeof x === "string");
    }
  } catch { /* best-effort */ }
  return [];
}

async function buildCustomerHistory(sql: ReturnType<typeof getDb>, customerId: string | null): Promise<string> {
  if (!customerId) return "No customer on record.";
  const rows = (await sql`
    SELECT c.account_status,
           (SELECT COUNT(*)::int FROM scope_review_requests sr
            WHERE sr.customer_id = c.id AND sr.request_type = 'refusal' AND sr.status = 'approved') AS approved_refusals
    FROM customers c WHERE c.id = ${customerId} LIMIT 1
  `) as Array<{ account_status: string; approved_refusals: number }>;
  const r = rows[0];
  if (!r) return "No customer on record.";
  return `Account status: ${r.account_status}. Prior approved refusals: ${r.approved_refusals}.`;
}

async function buildCleanerHistory(sql: ReturnType<typeof getDb>, cleanerId: string): Promise<string> {
  const rows = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status IN ('denied','hard_denied') OR admin_decision = 'denied')::int AS denied,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
    FROM scope_review_requests WHERE cleaner_id = ${cleanerId}
  `) as Array<{ total: number; denied: number; approved: number }>;
  const r = rows[0] ?? { total: 0, denied: 0, approved: 0 };
  return `Lifetime scope requests: ${r.total} (approved ${r.approved}, denied ${r.denied}).`;
}

// ── CLEANER: my requests ────────────────────────────────────────────────────────
scopeReviewRouter.get("/requests/mine", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = await resolveCleaner(sql, c.get("user").clerkId);
  if (!cleanerId) return c.json({ error: "Forbidden" }, 403);
  const bookingId = c.req.query("bookingId");

  const rows = (await (bookingId
    ? sql`
        SELECT id, booking_id, request_type, status, fee_code, fee_amount_cents, created_at, updated_at
        FROM scope_review_requests
        WHERE cleaner_id = ${cleanerId} AND booking_id = ${bookingId}
        ORDER BY created_at DESC LIMIT 100`
    : sql`
        SELECT id, booking_id, request_type, status, fee_code, fee_amount_cents, created_at, updated_at
        FROM scope_review_requests
        WHERE cleaner_id = ${cleanerId}
        ORDER BY created_at DESC LIMIT 100`)) as Array<Record<string, unknown>>;

  return c.json({
    requests: rows.map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
      requestType: r.request_type,
      status: r.status,
      feeCode: r.status === "approved" ? r.fee_code : null,
      feeAmountCents: r.status === "approved" ? r.fee_amount_cents : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// ── CLEANER: privileges ─────────────────────────────────────────────────────────
scopeReviewRouter.get("/privileges", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = await resolveCleaner(sql, c.get("user").clerkId);
  if (!cleanerId) return c.json({ error: "Forbidden" }, 403);

  const rows = (await sql`
    SELECT additional_attention_enabled, refusal_request_enabled, disabled_reason, disabled_until
    FROM cleaner_privileges WHERE cleaner_id = ${cleanerId} LIMIT 1
  `) as Array<{ additional_attention_enabled: boolean; refusal_request_enabled: boolean; disabled_reason: string | null; disabled_until: string | null }>;
  const p = rows[0];
  const disabledActive = p?.disabled_until ? new Date(p.disabled_until).getTime() > Date.now() : false;

  return c.json({
    additionalAttentionEnabled: p ? (p.additional_attention_enabled || !disabledActive) : true,
    refusalRequestEnabled: p ? (p.refusal_request_enabled || !disabledActive) : true,
    disabledUntil: disabledActive ? p?.disabled_until ?? null : null,
    disabledReason: disabledActive ? p?.disabled_reason ?? null : null,
    message: disabledActive ? "Temporarily unavailable due to repeated denied requests." : null,
  });
});

// ── ADMIN: list ─────────────────────────────────────────────────────────────────
scopeReviewRouter.get("/admin/requests", requireAuth, requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const type = c.req.query("type");

  const rows = (await sql`
    SELECT sr.id, sr.booking_id, sr.request_type, sr.status, sr.ai_confidence, sr.ai_recommendation,
           sr.fee_code, sr.fee_amount_cents, sr.created_at, sr.expires_at,
           cu.first_name AS customer_first, cu.last_name AS customer_last,
           cl.first_name AS cleaner_first, cl.last_name AS cleaner_last,
           b.total_price
    FROM scope_review_requests sr
    JOIN bookings b ON b.id = sr.booking_id
    LEFT JOIN customers cu ON cu.id = sr.customer_id
    LEFT JOIN cleaners cl ON cl.id = sr.cleaner_id
    WHERE (${status ?? null}::text IS NULL OR sr.status = ${status ?? null})
      AND (${type ?? null}::text IS NULL OR sr.request_type = ${type ?? null})
    ORDER BY sr.created_at DESC LIMIT 200
  `) as Array<Record<string, unknown>>;

  return c.json({
    requests: rows.map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
      requestType: r.request_type,
      status: r.status,
      aiConfidence: r.ai_confidence,
      aiRecommendation: r.ai_recommendation,
      feeCode: r.fee_code,
      feeAmountCents: r.fee_amount_cents,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      customerName: [r.customer_first, r.customer_last].filter(Boolean).join(" ") || null,
      cleanerName: [r.cleaner_first, r.cleaner_last].filter(Boolean).join(" ") || null,
      totalPrice: r.total_price,
    })),
  });
});

// ── ADMIN: detail ───────────────────────────────────────────────────────────────
scopeReviewRouter.get("/admin/requests/:id", requireAuth, requireAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const rows = (await sql`
    SELECT sr.*, b.total_price, b.status AS booking_status,
           cu.first_name AS customer_first, cu.last_name AS customer_last, cu.account_status,
           cl.first_name AS cleaner_first, cl.last_name AS cleaner_last,
           a.street AS addr_street, a.unit AS addr_unit, a.city AS addr_city,
           a.state AS addr_state, a.zip AS addr_zip
    FROM scope_review_requests sr
    JOIN bookings b ON b.id = sr.booking_id
    LEFT JOIN customers cu ON cu.id = sr.customer_id
    LEFT JOIN cleaners cl ON cl.id = sr.cleaner_id
    LEFT JOIN addresses a ON a.id = b.address_id
    WHERE sr.id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return c.json({ error: "Not found" }, 404);

  // Photo URLs (public R2 bucket).
  let photoUrls: string[] = [];
  try {
    const cfg = parseR2Config(c.env as Parameters<typeof parseR2Config>[0]);
    const photos = Array.isArray(r.photos) ? (r.photos as unknown[]) : [];
    photoUrls = photos
      .map((p) => (typeof p === "string" ? p : (p as { storage_key?: string })?.storage_key))
      .filter((k): k is string => typeof k === "string")
      .map((k) => r2PublicUrl(cfg, k));
  } catch { /* no config */ }

  // Ledger preview: current total, proposed fee, new total.
  const settings = await loadScopeReviewSettings(sql);
  const currentTotal = (r.total_price as number) ?? 0;
  let proposedFee = 0;
  if (r.request_type === "refusal") {
    proposedFee = computeRefusalFeeCents(currentTotal, settings);
  } else if (typeof r.fee_code === "string") {
    proposedFee = aafFeeCents(r.fee_code, settings) ?? 0;
  }
  const newTotal = r.request_type === "refusal" ? proposedFee : currentTotal + proposedFee;

  return c.json({
    request: {
      id: r.id,
      bookingId: r.booking_id,
      bookingStatus: r.booking_status,
      requestType: r.request_type,
      status: r.status,
      selectedPackage: r.selected_package,
      selectedCondition: r.selected_condition,
      cleanerNotes: r.cleaner_notes,
      refusalReason: r.refusal_reason,
      aiConfidence: r.ai_confidence,
      aiRecommendation: r.ai_recommendation,
      aiResponse: r.ai_response_json,
      feeCode: r.fee_code,
      feeAmountCents: r.fee_amount_cents,
      adminDecision: r.admin_decision,
      adminId: r.admin_id,
      adminDecidedAt: r.admin_decided_at,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      customerName: [r.customer_first, r.customer_last].filter(Boolean).join(" ") || null,
      customerAccountStatus: r.account_status,
      cleanerName: [r.cleaner_first, r.cleaner_last].filter(Boolean).join(" ") || null,
      address: [r.addr_street, r.addr_unit, r.addr_city, r.addr_state, r.addr_zip].filter(Boolean).join(", ") || null,
      photoUrls,
    },
    ledgerPreview: { currentTotalCents: currentTotal, proposedFeeCents: proposedFee, newTotalCents: newTotal },
  });
});

// ── ADMIN: decision ─────────────────────────────────────────────────────────────
const decisionSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  feeCode: z
    .enum(["none", "additional_attention_small", "additional_attention_medium", "additional_attention_large", "refusal_fee"])
    .optional(),
  note: z.string().max(2000).optional(),
});

scopeReviewRouter.post("/admin/requests/:id/decision", requireAuth, requireAdmin, zValidator("json", decisionSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const id = c.req.param("id");
  const body = c.req.valid("json");
  try {
    const result = await decideScopeReview(sql, stripe, c.env, {
      requestId: id,
      decision: body.decision,
      adminId: c.get("user").clerkId,
      feeCodeOverride: (body.feeCode as ScopeReviewFeeCode | undefined) ?? null,
      note: body.note ?? null,
      ip: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json({ ok: true, result });
  } catch (err) {
    if (err instanceof ScopeReviewEngineError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

// ── PUBLIC: signed action link ───────────────────────────────────────────────────
scopeReviewRouter.get("/action/:token", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const token = c.req.param("token");
  const hash = await sha256Hex(token);

  const links = (await sql`
    SELECT id, request_id, action FROM scope_review_action_links
    WHERE token_hash = ${hash} AND used_at IS NULL AND expires_at > NOW() LIMIT 1
  `) as Array<{ id: string; request_id: string; action: "approve" | "deny" }>;
  const link = links[0];
  if (!link) return c.html(confirmationPage("Link invalid or expired", "This action link is no longer valid.", false), 404);

  // Mark used first (single-use); then execute so a retry can't double-charge.
  const claimed = (await sql`
    UPDATE scope_review_action_links SET used_at = NOW(), used_by = ${"email_link"}
    WHERE id = ${link.id} AND used_at IS NULL RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) return c.html(confirmationPage("Already used", "This action link has already been used.", false), 409);

  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  try {
    const result = await decideScopeReview(sql, stripe, c.env, {
      requestId: link.request_id,
      decision: link.action,
      adminId: "email_link",
      ip: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    await audit(sql, {
      action: "admin.action",
      actorClerkId: "email_link",
      targetType: "scope_review_request",
      targetId: link.request_id,
      metadata: { event: "scope_review_email_action", action: link.action, result: result.status, noop: result.noop ?? false },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });
    const title = link.action === "approve" ? "Request approved" : "Request denied";
    const detail = result.noop
      ? "This request had already been decided — no changes were made."
      : link.action === "approve"
        ? "The request has been approved and any applicable fee has been recorded."
        : "The request has been denied. The cleaner has been notified.";
    return c.html(confirmationPage(title, detail, true));
  } catch (err) {
    if (err instanceof ScopeReviewEngineError) {
      return c.html(confirmationPage("Could not complete", err.message, false), err.status as 400);
    }
    logger.error("scope_review action link failed", err, { requestId: link.request_id });
    return c.html(confirmationPage("Something went wrong", "Please use the admin dashboard to complete this action.", false), 500);
  }
});

function confirmationPage(title: string, detail: string, ok: boolean): string {
  const color = ok ? "#0f766e" : "#b91c1c";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:sans-serif;background:#f9fafb;margin:0;padding:48px 16px">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
    <div style="width:48px;height:48px;border-radius:24px;background:${color};margin:0 auto 16px"></div>
    <h1 style="font-size:20px;margin:0 0 8px;color:#111">${esc(title)}</h1>
    <p style="font-size:14px;color:#6b7280;margin:0">${esc(detail)}</p>
  </div>
</body></html>`;
}
