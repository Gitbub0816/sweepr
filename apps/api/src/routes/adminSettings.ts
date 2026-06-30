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
