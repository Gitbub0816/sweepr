/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAnyAdmin } from "../middleware/adminRoles";
import type { AppBindings } from "../types";

export const adminSettingsRouter = new Hono<AppBindings>();

adminSettingsRouter.use("*", requireAuth, requireAnyAdmin);

const SETTING_KEYS = ["platform_name", "support_email", "service_fee_pct", "tax_rate_pct"] as const;

// scope_review.* keys — additive, admin-editable via the generic key/value endpoints below.
// Kept separate from SETTING_KEYS/patchSchema (which map to fixed named fields) because this
// group is a flat key/value bag consumed directly by the admin UI's Scope Review settings panel.
const SCOPE_REVIEW_KEYS = [
  "scope_review.fee_additional_attention_small_cents",
  "scope_review.fee_additional_attention_medium_cents",
  "scope_review.fee_additional_attention_large_cents",
  "scope_review.refusal_fee_min_cents",
  "scope_review.refusal_fee_max_cents",
  "scope_review.refusal_fee_pct",
  "scope_review.abuse_request_rate_pct",
  "scope_review.abuse_denial_rate_pct",
  "scope_review.abuse_min_jobs",
  "scope_review.privilege_disable_days",
  "scope_review.suspension_days",
  "scope_review.investigating_days",
  "scope_review.auto_cancel_on_high_confidence_refusal",
  "scope_review.level_surcharge_extra_attention_pct",
  "scope_review.level_surcharge_significant_attention_pct",
] as const;
type ScopeReviewKey = (typeof SCOPE_REVIEW_KEYS)[number];

adminSettingsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT key, value FROM site_settings WHERE key = ANY(${SETTING_KEYS})
  `) as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return c.json({
    platformName: map["platform_name"] ?? "Sweepr",
    supportEmail: map["support_email"] ?? "support@getsweepr.com",
    serviceFeePct: parseFloat(map["service_fee_pct"] ?? "10"),
    taxRatePct: parseFloat(map["tax_rate_pct"] ?? "8.25"),
  });
});

const patchSchema = z.object({
  platformName: z.string().min(1).max(100).optional(),
  supportEmail: z.string().email().optional(),
  serviceFeePct: z.number().min(0).max(100).optional(),
  taxRatePct: z.number().min(0).max(50).optional(),
});

adminSettingsRouter.patch("/", zValidator("json", patchSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const updates: Array<[string, string]> = [];
  if (input.platformName !== undefined) updates.push(["platform_name", input.platformName]);
  if (input.supportEmail !== undefined) updates.push(["support_email", input.supportEmail]);
  if (input.serviceFeePct !== undefined) updates.push(["service_fee_pct", String(input.serviceFeePct)]);
  if (input.taxRatePct !== undefined) updates.push(["tax_rate_pct", String(input.taxRatePct)]);
  for (const [key, value] of updates) {
    await sql`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  return c.json({ ok: true });
});

// ── Scope Review settings (flat key/value bag) ──────────────────────────────
adminSettingsRouter.get("/scope-review", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT key, value FROM site_settings WHERE key = ANY(${SCOPE_REVIEW_KEYS})
  `) as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return c.json({ settings: map });
});

const scopeReviewPatchSchema = z.object({
  settings: z.record(z.string(), z.string()),
});

adminSettingsRouter.patch("/scope-review", zValidator("json", scopeReviewPatchSchema), async (c) => {
  const { settings } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const entries = Object.entries(settings).filter(
    (e): e is [ScopeReviewKey, string] => (SCOPE_REVIEW_KEYS as readonly string[]).includes(e[0]),
  );
  for (const [key, value] of entries) {
    await sql`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  return c.json({ ok: true });
});
