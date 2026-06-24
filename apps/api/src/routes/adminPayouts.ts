import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { audit } from "../lib/audit";
import {
  loadFeeSettings,
  calculatePayout,
  getTierMultiplier,
  type FeeSettings,
} from "../lib/payoutEngine";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

export const adminPayoutsRouter = new Hono<AppBindings>();

const financeOrAbove = requireAdminRole("finance", "ops");
const anyAdmin = requireAdminRole();

// ─── Overview ────────────────────────────────────────────────────────────────

adminPayoutsRouter.get("/overview", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const [pending, scheduled, transferred, failed, held, disputed, total] =
    await Promise.all([
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status='pending'`,
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status='scheduled'`,
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status='transferred'`,
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status='failed'`,
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status='held'`,
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status='disputed'`,
      sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payouts WHERE status IN ('paid','transferred')`,
    ]);

  const settings = await loadFeeSettings(sql);

  return c.json({
    pending:     { amount: Number(pending[0].v),     count: Number(pending[0].n) },
    scheduled:   { amount: Number(scheduled[0].v),   count: Number(scheduled[0].n) },
    transferred: { amount: Number(transferred[0].v), count: Number(transferred[0].n) },
    failed:      { amount: Number(failed[0].v),      count: Number(failed[0].n) },
    held:        { amount: Number(held[0].v),         count: Number(held[0].n) },
    disputed:    { amount: Number(disputed[0].v),     count: Number(disputed[0].n) },
    total:       { amount: Number(total[0].v),        count: Number(total[0].n) },
    feeSettings: settings,
  });
});

// ─── Transactions (ledger) ───────────────────────────────────────────────────

adminPayoutsRouter.get("/transactions", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { limit = "50", offset = "0", cleaner_id, status, from, to } = c.req.query();

  const rows = await sql`
    SELECT p.id, p.booking_id, p.cleaner_id, p.amount, p.platform_fee,
           p.gross_amount, p.net_amount, p.fee_rate, p.tier_multiplier,
           p.status, p.stripe_transfer_id, p.stripe_payout_id,
           p.scheduled_for, p.paid_at, p.held_reason, p.dispute_id,
           p.notes, p.created_at,
           u.first_name || ' ' || u.last_name AS cleaner_name,
           b.scheduled_date
    FROM payouts p
    JOIN cleaners cl ON cl.id = p.cleaner_id
    JOIN users u ON u.id = cl.user_id
    JOIN bookings b ON b.id = p.booking_id
    WHERE TRUE
      ${cleaner_id ? sql`AND p.cleaner_id = ${cleaner_id}` : sql``}
      ${status ? sql`AND p.status = ${status}` : sql``}
      ${from ? sql`AND p.created_at >= ${from}` : sql``}
      ${to ? sql`AND p.created_at <= ${to}` : sql``}
    ORDER BY p.created_at DESC
    LIMIT ${Number(limit)}
    OFFSET ${Number(offset)}
  `;

  const total = await sql`
    SELECT COUNT(*) n FROM payouts p WHERE TRUE
      ${cleaner_id ? sql`AND p.cleaner_id = ${cleaner_id}` : sql``}
      ${status ? sql`AND p.status = ${status}` : sql``}
      ${from ? sql`AND p.created_at >= ${from}` : sql``}
      ${to ? sql`AND p.created_at <= ${to}` : sql``}
  `;

  return c.json({ rows, total: Number(total[0].n) });
});

// ─── Payouts list ────────────────────────────────────────────────────────────

adminPayoutsRouter.get("/payouts", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { limit = "50", offset = "0", status } = c.req.query();

  const rows = await sql`
    SELECT p.*, u.first_name || ' ' || u.last_name AS cleaner_name
    FROM payouts p
    JOIN cleaners cl ON cl.id = p.cleaner_id
    JOIN users u ON u.id = cl.user_id
    WHERE TRUE
      ${status ? sql`AND p.status = ${status}` : sql``}
    ORDER BY p.created_at DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `;

  return c.json({ rows });
});

// ─── Release single payout (admin override) ──────────────────────────────────

adminPayoutsRouter.post(
  "/release/:id",
  requireAuth,
  financeOrAbove,
  async (c) => {
    const payoutId = c.req.param("id");
    const sql = getDb(c.env.DATABASE_URL);
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    const payouts = await sql`
      SELECT p.*, b.stripe_payment_intent_id, cl.stripe_connect_id,
             b.total_price, b.id AS booking_id
      FROM payouts p
      JOIN bookings b ON b.id = p.booking_id
      JOIN cleaners cl ON cl.id = p.cleaner_id
      WHERE p.id = ${payoutId} LIMIT 1
    ` as Array<Record<string, unknown>>;

    const payout = payouts[0];
    if (!payout) return c.json({ error: "Payout not found" }, 404);
    if (!payout.stripe_connect_id) return c.json({ error: "Cleaner has no Stripe account" }, 400);
    if (payout.status === "paid" || payout.status === "transferred") {
      return c.json({ error: "Already paid" }, 409);
    }

    const transfer = await stripe.transfers.create({
      amount: payout.amount as number,
      currency: "usd",
      destination: payout.stripe_connect_id as string,
      transfer_group: `booking_${payout.booking_id}`,
    });

    await sql`
      UPDATE payouts
      SET status = 'transferred', stripe_transfer_id = ${transfer.id}, paid_at = NOW()
      WHERE id = ${payoutId}
    `;

    await audit(sql, {
      action: "payout.admin_released",
      actorClerkId: c.get("user").clerkId,
      targetType: "payout",
      targetId: payoutId,
      metadata: { transferId: transfer.id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, transferId: transfer.id });
  }
);

// ─── Hold payout ─────────────────────────────────────────────────────────────

adminPayoutsRouter.post(
  "/hold/:id",
  requireAuth,
  financeOrAbove,
  zValidator("json", z.object({ reason: z.string().min(1) })),
  async (c) => {
    const payoutId = c.req.param("id");
    const { reason } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    await sql`
      UPDATE payouts SET status = 'held', held_reason = ${reason} WHERE id = ${payoutId}
    `;

    await audit(sql, {
      action: "payout.held",
      actorClerkId: c.get("user").clerkId,
      targetType: "payout",
      targetId: payoutId,
      metadata: { reason },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true });
  }
);

// ─── Fee Configuration ───────────────────────────────────────────────────────

adminPayoutsRouter.get("/fee-config", requireAuth, financeOrAbove, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT * FROM platform_fee_settings ORDER BY effective_from DESC LIMIT 1
  `;
  return c.json(rows[0] ?? null);
});

const feeConfigSchema = z.object({
  feeType: z.enum(["percentage", "flat", "hybrid"]),
  feeValue: z.number().positive(),
  minimumPlatformFee: z.number().int().min(0),
  maximumPlatformFee: z.number().int().positive().nullable().optional(),
  processingFeeStrategy: z.enum(["absorb", "pass_through", "split"]),
  processingFeeSplitPct: z.number().min(0).max(100).optional(),
  reservePercentage: z.number().min(0).max(100).optional(),
  payoutDelayDays: z.number().int().min(0).max(30),
  notes: z.string().optional(),
  reason: z.string().min(1),
});

adminPayoutsRouter.put(
  "/fee-config",
  requireAuth,
  financeOrAbove,
  zValidator("json", feeConfigSchema),
  async (c) => {
    const body = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const actorRows = await sql`SELECT id FROM users WHERE clerk_id = ${c.get("user").clerkId} LIMIT 1` as Array<{ id: string }>;
    const actorId = actorRows[0]?.id;

    // Get old settings for audit
    const old = await loadFeeSettings(sql);

    // Deactivate current
    await sql`UPDATE platform_fee_settings SET active = FALSE WHERE active = TRUE`;

    // Insert new
    await sql`
      INSERT INTO platform_fee_settings (
        fee_type, fee_value, minimum_platform_fee, maximum_platform_fee,
        processing_fee_strategy, processing_fee_split_pct, reserve_percentage,
        payout_delay_days, active, effective_from, created_by, notes
      ) VALUES (
        ${body.feeType}, ${body.feeValue}, ${body.minimumPlatformFee},
        ${body.maximumPlatformFee ?? null}, ${body.processingFeeStrategy},
        ${body.processingFeeSplitPct ?? 0}, ${body.reservePercentage ?? 0},
        ${body.payoutDelayDays}, TRUE, NOW(), ${actorId ?? null}, ${body.notes ?? null}
      )
    `;

    // Audit each changed field
    const fields: Array<keyof FeeSettings> = [
      "feeType", "feeValue", "minimumPlatformFee", "maximumPlatformFee",
      "processingFeeStrategy", "processingFeeSplitPct", "reservePercentage", "payoutDelayDays",
    ];
    for (const field of fields) {
      const oldVal = String(old[field] ?? "");
      const newVal = String((body as Record<string, unknown>)[field] ?? "");
      if (oldVal !== newVal && actorId) {
        await sql`
          INSERT INTO payout_settings_audit (actor_id, setting_name, old_value, new_value, reason)
          VALUES (${actorId}, ${field}, ${oldVal}, ${newVal}, ${body.reason})
        `;
      }
    }

    await audit(sql, {
      action: "payout.fee_config_updated",
      actorClerkId: c.get("user").clerkId,
      targetType: "platform",
      targetId: "fee_settings",
      metadata: { reason: body.reason },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true });
  }
);

// ─── Tier Multipliers ────────────────────────────────────────────────────────

adminPayoutsRouter.get("/tiers", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`SELECT * FROM cleaner_tier_multipliers ORDER BY multiplier`;
  return c.json(rows);
});

adminPayoutsRouter.put(
  "/tiers/:tier",
  requireAuth,
  financeOrAbove,
  zValidator("json", z.object({ multiplier: z.number().min(0.5).max(3), reason: z.string().min(1) })),
  async (c) => {
    const tier = c.req.param("tier");
    const { multiplier, reason } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const old = await sql`SELECT multiplier FROM cleaner_tier_multipliers WHERE tier = ${tier} LIMIT 1` as Array<{ multiplier: string }>;
    if (!old[0]) return c.json({ error: "Tier not found" }, 404);

    await sql`UPDATE cleaner_tier_multipliers SET multiplier = ${multiplier}, updated_at = NOW() WHERE tier = ${tier}`;

    const actorRows = await sql`SELECT id FROM users WHERE clerk_id = ${c.get("user").clerkId} LIMIT 1` as Array<{ id: string }>;
    const actorId = actorRows[0]?.id;
    if (actorId) {
      await sql`
        INSERT INTO payout_settings_audit (actor_id, setting_name, old_value, new_value, reason)
        VALUES (${actorId}, ${'tier_multiplier_' + tier}, ${old[0].multiplier}, ${String(multiplier)}, ${reason})
      `;
    }

    await audit(sql, {
      action: "payout.tier_updated",
      actorClerkId: c.get("user").clerkId,
      targetType: "platform",
      targetId: tier,
      metadata: { multiplier, reason },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true });
  }
);

// ─── Contractor Earnings (per-cleaner analytics) ─────────────────────────────

adminPayoutsRouter.get("/contractor-earnings", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { limit = "50", offset = "0", from, to } = c.req.query();

  const rows = await sql`
    SELECT cl.id, u.first_name || ' ' || u.last_name AS name,
           cl.tier, cl.stripe_connect_id,
           COUNT(p.id) AS payout_count,
           COALESCE(SUM(p.amount), 0) AS total_paid,
           COALESCE(SUM(p.platform_fee), 0) AS total_platform_fee,
           COALESCE(SUM(p.gross_amount), 0) AS total_gross,
           COALESCE(AVG(p.fee_rate), 0) AS avg_fee_rate,
           MAX(p.paid_at) AS last_paid_at
    FROM cleaners cl
    JOIN users u ON u.id = cl.user_id
    LEFT JOIN payouts p ON p.cleaner_id = cl.id
      AND p.status IN ('paid', 'transferred')
      ${from ? sql`AND p.paid_at >= ${from}` : sql``}
      ${to ? sql`AND p.paid_at <= ${to}` : sql``}
    GROUP BY cl.id, u.first_name, u.last_name, cl.tier, cl.stripe_connect_id
    ORDER BY total_paid DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `;

  return c.json({ rows });
});

// ─── Payout Simulation (preview fee breakdown before scheduling) ──────────────

adminPayoutsRouter.post(
  "/simulate",
  requireAuth,
  financeOrAbove,
  zValidator("json", z.object({
    grossAmount: z.number().int().positive(),
    tier: z.enum(["standard", "preferred", "elite"]).optional(),
  })),
  async (c) => {
    const { grossAmount, tier = "standard" } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const settings = await loadFeeSettings(sql);
    const multiplier = await getTierMultiplier(sql, tier);
    const breakdown = calculatePayout(grossAmount, settings, multiplier);
    return c.json({ breakdown, settings });
  }
);

// ─── Disputes ────────────────────────────────────────────────────────────────

adminPayoutsRouter.get("/disputes", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT p.id, p.booking_id, p.cleaner_id, p.amount, p.status,
           p.dispute_id, p.held_reason, p.created_at,
           u.first_name || ' ' || u.last_name AS cleaner_name
    FROM payouts p
    JOIN cleaners cl ON cl.id = p.cleaner_id
    JOIN users u ON u.id = cl.user_id
    WHERE p.status IN ('disputed', 'held') OR p.dispute_id IS NOT NULL
    ORDER BY p.created_at DESC
    LIMIT 100
  `;

  return c.json({ rows });
});

adminPayoutsRouter.post(
  "/disputes/:id/resolve",
  requireAuth,
  financeOrAbove,
  zValidator("json", z.object({ resolution: z.enum(["release", "cancel"]), notes: z.string().optional() })),
  async (c) => {
    const payoutId = c.req.param("id");
    const { resolution, notes } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const newStatus = resolution === "release" ? "pending" : "canceled";
    await sql`
      UPDATE payouts SET status = ${newStatus}, held_reason = NULL,
        notes = ${notes ?? null}
      WHERE id = ${payoutId}
    `;

    await audit(sql, {
      action: resolution === "release" ? "payout.dispute_released" : "payout.dispute_canceled",
      actorClerkId: c.get("user").clerkId,
      targetType: "payout",
      targetId: payoutId,
      metadata: { resolution, notes },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true });
  }
);

// ─── Settings audit trail ────────────────────────────────────────────────────

adminPayoutsRouter.get("/settings-audit", requireAuth, financeOrAbove, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { limit = "50", offset = "0" } = c.req.query();

  const rows = await sql`
    SELECT pa.*, u.first_name || ' ' || u.last_name AS actor_name
    FROM payout_settings_audit pa
    JOIN users u ON u.id = pa.actor_id
    ORDER BY pa.created_at DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `;

  return c.json({ rows });
});

// ─── Connected Account status ─────────────────────────────────────────────────

adminPayoutsRouter.get("/connected-accounts", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { status } = c.req.query();

  const rows = await sql`
    SELECT sa.*, u.first_name || ' ' || u.last_name AS cleaner_name
    FROM stripe_connected_accounts sa
    JOIN cleaners cl ON cl.id = sa.cleaner_id
    JOIN users u ON u.id = cl.user_id
    WHERE TRUE
      ${status ? sql`AND sa.status = ${status}` : sql``}
    ORDER BY sa.created_at DESC
    LIMIT 100
  `;

  return c.json({ rows });
});

adminPayoutsRouter.get("/connected-accounts/:cleanerId", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = c.req.param("cleanerId");

  const rows = await sql`
    SELECT * FROM stripe_connected_accounts WHERE cleaner_id = ${cleanerId} LIMIT 1
  `;

  return c.json(rows[0] ?? null);
});
