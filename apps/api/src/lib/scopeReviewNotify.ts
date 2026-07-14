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
 * Scope-review notifications.
 *
 *  - Admin review email (approve/deny via signed single-use links) on request
 *    creation, fanned out to the same recipient list the fee-proposal engine
 *    uses (Super Admins).
 *  - Cleaner in-app notification on the admin decision.
 *
 * All best-effort: a notification failure never blocks the request or decision.
 */
import type { Sql } from "./db";
import type { Env } from "../types";
import { logger } from "./logger";
import { sendEmail, SENDERS, formatEmailTimestamp } from "./mailer";
import { sendNotification } from "./notifications";
import { listSuperAdmins } from "./approvalEngine";
import { r2PublicUrl, parseR2Config } from "./r2";
import { sha256Hex } from "./approvalNotify";

const API_BASE = "https://api.getsweepr.com";

function adminUrl(env: Env): string {
  return env.ADMIN_URL ?? "https://admin.getsweepr.com";
}

function money(cents: number | null | undefined): string {
  return `$${(((cents ?? 0) / 100)).toFixed(2)}`;
}

interface FullRequest {
  id: string;
  booking_id: string;
  request_type: "additional_attention" | "refusal";
  status: string;
  selected_package: string | null;
  selected_condition: string | null;
  cleaner_notes: string | null;
  refusal_reason: string | null;
  ai_confidence: number | null;
  ai_recommendation: string | null;
  fee_code: string | null;
  photos: unknown;
  expires_at: string | null;
  admin_summary: string | null;
  customer_facing_summary: string | null;
  customer_name: string | null;
  cleaner_name: string | null;
  addr_street: string | null;
  addr_city: string | null;
  addr_state: string | null;
  addr_zip: string | null;
  total_price: number | null;
}

async function loadFullRequest(sql: Sql, requestId: string): Promise<FullRequest | null> {
  const rows = (await sql`
    SELECT sr.id, sr.booking_id, sr.request_type, sr.status, sr.selected_package,
           sr.selected_condition, sr.cleaner_notes, sr.refusal_reason, sr.ai_confidence,
           sr.ai_recommendation, sr.fee_code, sr.photos, sr.expires_at,
           sr.ai_response_json->>'admin_summary' AS admin_summary,
           sr.ai_response_json->>'customer_facing_summary' AS customer_facing_summary,
           cu.first_name AS customer_first, cu.last_name AS customer_last,
           cl.first_name AS cleaner_first, cl.last_name AS cleaner_last,
           a.street AS addr_street, a.city AS addr_city, a.state AS addr_state, a.zip AS addr_zip,
           b.total_price
    FROM scope_review_requests sr
    JOIN bookings b ON b.id = sr.booking_id
    LEFT JOIN customers cu ON cu.id = sr.customer_id
    LEFT JOIN cleaners cl ON cl.id = sr.cleaner_id
    LEFT JOIN addresses a ON a.id = b.address_id
    WHERE sr.id = ${requestId} LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    booking_id: r.booking_id as string,
    request_type: r.request_type as FullRequest["request_type"],
    status: r.status as string,
    selected_package: (r.selected_package as string) ?? null,
    selected_condition: (r.selected_condition as string) ?? null,
    cleaner_notes: (r.cleaner_notes as string) ?? null,
    refusal_reason: (r.refusal_reason as string) ?? null,
    ai_confidence: (r.ai_confidence as number) ?? null,
    ai_recommendation: (r.ai_recommendation as string) ?? null,
    fee_code: (r.fee_code as string) ?? null,
    photos: r.photos,
    expires_at: (r.expires_at as string) ?? null,
    admin_summary: (r.admin_summary as string) ?? null,
    customer_facing_summary: (r.customer_facing_summary as string) ?? null,
    customer_name: [r.customer_first, r.customer_last].filter(Boolean).join(" ") || null,
    cleaner_name: [r.cleaner_first, r.cleaner_last].filter(Boolean).join(" ") || null,
    addr_street: (r.addr_street as string) ?? null,
    addr_city: (r.addr_city as string) ?? null,
    addr_state: (r.addr_state as string) ?? null,
    addr_zip: (r.addr_zip as string) ?? null,
    total_price: (r.total_price as number) ?? null,
  };
}

function photoUrls(env: Env, photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  try {
    const cfg = parseR2Config(env as Parameters<typeof parseR2Config>[0]);
    return photos
      .map((p) => (typeof p === "string" ? p : (p as { storage_key?: string })?.storage_key))
      .filter((k): k is string => typeof k === "string")
      .map((k) => r2PublicUrl(cfg, k));
  } catch {
    return [];
  }
}

/** Create a signed single-use action link and return its full URL. */
async function createActionLink(
  sql: Sql,
  requestId: string,
  action: "approve" | "deny",
  expiresAt: string | null,
): Promise<string | null> {
  try {
    const raw = crypto.randomUUID() + crypto.randomUUID();
    const hash = await sha256Hex(raw);
    await sql`
      INSERT INTO scope_review_action_links (request_id, action, token_hash, expires_at)
      VALUES (${requestId}, ${action}, ${hash},
              COALESCE(${expiresAt}::timestamptz, NOW() + INTERVAL '72 hours'))
    `;
    return `${API_BASE}/scope-review/action/${raw}`;
  } catch (err) {
    logger.error("scopeReview.action_link failed", err, { requestId });
    return null;
  }
}

/**
 * Fan out a newly-created scope-review request to Super Admins by email with
 * signed approve/deny (or override) links, plus an in-app notification.
 */
export async function notifyScopeReviewCreated(
  sql: Sql,
  env: Env,
  requestId: string,
  emailKind: "strong_approve" | "standard" | "auto_denied" | "hard_denied",
): Promise<void> {
  const req = await loadFullRequest(sql, requestId);
  if (!req) return;

  const admins = await listSuperAdmins(sql);
  const typeLabel = req.request_type === "refusal" ? "Service Refusal" : "Additional Attention Fee";
  const subject = `Sweepr Review Needed: ${typeLabel} - Booking ${req.booking_id}`;

  const pendingAdmin = emailKind === "strong_approve" || emailKind === "standard";

  // Fee / financial impact preview.
  const proposedFee = req.request_type === "refusal"
    ? null // computed at decision-time from total; shown as a range in copy
    : req.fee_code && req.fee_code !== "none" && req.fee_code !== "refusal_fee"
      ? req.fee_code
      : null;

  const approveLink = await createActionLink(sql, req.id, "approve", req.expires_at);
  const denyLink = pendingAdmin ? await createActionLink(sql, req.id, "deny", req.expires_at) : null;
  const openLink = `${adminUrl(env)}/scope-review/${req.id}`;

  const recommendationCopy =
    emailKind === "strong_approve"
      ? "AI recommendation: STRONG APPROVE (high confidence)."
      : emailKind === "standard"
        ? "AI recommendation: review recommended."
        : emailKind === "auto_denied"
          ? "This request was AUTO-DENIED by AI review (insufficient support). Use the override link only if you disagree."
          : "This request was HARD-DENIED by AI review (evidence does not support a fee/refusal). Override only in exceptional cases.";

  const photos = photoUrls(env, req.photos);
  const html = buildAdminEmailHtml({
    typeLabel,
    req,
    recommendationCopy,
    proposedFee,
    photos,
    approveLink,
    denyLink,
    openLink,
    pendingAdmin,
  });

  for (const a of admins) {
    try {
      await sendNotification(sql, a.user_id, {
        type: "scope_review",
        title: `${typeLabel} review needed`,
        body: `Booking ${req.booking_id}, ${req.ai_recommendation ?? "review"}`,
        data: { requestId: req.id, bookingId: req.booking_id },
      });
    } catch (err) {
      logger.error("scopeReview.notify in_app failed", err, { requestId: req.id });
    }
    if (env.MAILERSEND_API_KEY && a.email) {
      try {
        await sendEmail(
          env.MAILERSEND_API_KEY,
          {
            to: a.email,
            subject,
            html,
            from: SENDERS.APPROVALS,
            replyTo: SENDERS.SECURITY,
            relatedType: "scope_review_request",
            relatedId: req.id,
            templateName: "scope_review_admin",
          },
          sql,
        );
      } catch (err) {
        logger.error("scopeReview.notify email failed", err, { requestId: req.id });
      }
    }
  }
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildAdminEmailHtml(opts: {
  typeLabel: string;
  req: FullRequest;
  recommendationCopy: string;
  proposedFee: string | null;
  photos: string[];
  approveLink: string | null;
  denyLink: string | null;
  openLink: string;
  pendingAdmin: boolean;
}): string {
  const { req } = opts;
  const address = [req.addr_street, req.addr_city, req.addr_state, req.addr_zip].filter(Boolean).join(", ");
  const financial = req.request_type === "refusal"
    ? `Current total: ${money(req.total_price)} → refusal fee is computed on approval (percentage of total, clamped to the configured min/max).`
    : `Current total: ${money(req.total_price)}${opts.proposedFee ? ` → proposed fee code: ${esc(opts.proposedFee)}` : ""}`;

  const rows: Array<[string, string]> = [
    ["Customer", esc(req.customer_name) || ", "],
    ["Cleaner", esc(req.cleaner_name) || ", "],
    ["Booking", esc(req.booking_id)],
    ["Address", esc(address) || ", "],
    ["Package", esc(req.selected_package) || ", "],
    ["Condition level", esc(req.selected_condition) || ", "],
    ["Request type", esc(opts.typeLabel)],
    ["AI confidence", req.ai_confidence != null ? `${req.ai_confidence}%` : ", "],
    ["AI recommendation", esc(req.ai_recommendation) || ", "],
  ];
  if (req.refusal_reason) rows.push(["Refusal reason", esc(req.refusal_reason)]);

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;vertical-align:top">${k}</td><td style="padding:4px 0;color:#111;font-size:13px">${v}</td></tr>`,
    )
    .join("");

  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;font-weight:600;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;margin:4px 8px 4px 0">${label}</a>`;

  const buttons = [
    opts.approveLink ? btn(opts.approveLink, opts.pendingAdmin ? "Approve" : "Override (approve)", "#0f766e") : "",
    opts.denyLink ? btn(opts.denyLink, "Deny", "#b91c1c") : "",
    btn(opts.openLink, "Open Admin Review", "#374151"),
  ].join("");

  const photoHtml = opts.photos.length
    ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 6px">Photos (${opts.photos.length}):</p>` +
      opts.photos
        .map((u) => `<a href="${u}" style="color:#0f766e;font-size:12px;display:block;word-break:break-all">${esc(u)}</a>`)
        .join("")
    : "";

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:28px 24px;color:#111">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 8px">${esc(opts.typeLabel)}, Review Needed</h1>
  <p style="font-size:14px;color:#374151;margin:0 0 6px">${esc(opts.recommendationCopy)}</p>
  <p style="font-size:13px;color:#6b7280;margin:0 0 16px">${esc(financial)}${req.expires_at ? ` · Deadline: ${formatEmailTimestamp(new Date(req.expires_at))}` : ""}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${table}</table>
  ${req.admin_summary ? `<p style="font-size:13px;color:#111;background:#f9fafb;border-radius:8px;padding:12px;margin:0 0 8px"><strong>Admin summary:</strong> ${esc(req.admin_summary)}</p>` : ""}
  ${req.customer_facing_summary ? `<p style="font-size:13px;color:#374151;margin:0 0 8px"><strong>Customer-facing draft:</strong> ${esc(req.customer_facing_summary)}</p>` : ""}
  ${req.cleaner_notes ? `<p style="font-size:13px;color:#374151;margin:0 0 8px"><strong>Cleaner notes:</strong> ${esc(req.cleaner_notes)}</p>` : ""}
  ${photoHtml}
  <div style="margin:20px 0 8px">${buttons}</div>
  <p style="font-size:11px;color:#9ca3af;margin:16px 0 0">These action links are single-use and expire. No money moves until an admin approves.</p>
</div>`;
}

/** Notify the assigned cleaner of the admin decision (in-app). */
export async function notifyCleanerDecision(
  sql: Sql,
  _env: Env,
  opts: {
    requestId: string;
    cleanerId: string | null;
    requestType: "additional_attention" | "refusal";
    decision: "approved" | "denied";
    feeAmountCents?: number;
  },
): Promise<void> {
  if (!opts.cleanerId) return;
  const rows = (await sql`
    SELECT u.id AS user_id FROM cleaners cl JOIN users u ON u.id = cl.user_id WHERE cl.id = ${opts.cleanerId} LIMIT 1
  `) as Array<{ user_id: string }>;
  const userId = rows[0]?.user_id;
  if (!userId) return;

  let title: string;
  let body: string;
  if (opts.decision === "approved") {
    if (opts.requestType === "refusal") {
      title = "Service refusal approved";
      body = "Your service refusal was approved. You may leave, a refusal fee has been applied.";
    } else {
      title = "Additional attention fee approved";
      body = `Approved (${money(opts.feeAmountCents)}). Please continue the service.`;
    }
  } else {
    title = opts.requestType === "refusal" ? "Service refusal denied" : "Additional attention fee denied";
    body =
      opts.requestType === "refusal"
        ? "Your service refusal was not approved. Please proceed with the job as booked."
        : "Your request was not approved. Please proceed under the original scope.";
  }

  await sendNotification(sql, userId, {
    type: "scope_review_decision",
    title,
    body,
    data: { requestId: opts.requestId, decision: opts.decision },
  });
}
