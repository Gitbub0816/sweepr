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
import { createProposal } from "../lib/approvalEngine";
import { notifyProposalCreated } from "../lib/approvalNotify";
import { recordError } from "../lib/errorLog";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

export const adminPayoutsRouter = new Hono<AppBindings>();

const financeOrAbove = requireAdminRole("finance", "ops");
const superAdminOnly = requireAdminRole("super_admin");
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

const PAYOUT_STATUSES = new Set(["pending","eligible","on_hold","transferred","paid","failed","disputed","canceled"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/;

adminPayoutsRouter.get("/transactions", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { limit = "50", offset = "0", cleaner_id, status, from, to } = c.req.query();

  const limitN = Math.max(1, Math.min(Number(limit) || 50, 500));
  const offsetN = Math.max(0, Number(offset) || 0);
  if (!isFinite(limitN) || !isFinite(offsetN)) return c.json({ error: "Invalid pagination" }, 400);

  // Build optional filters as positional params ($1..) — nested sql`` fragments
  // are not composable in the Neon HTTP client.
  const conds: string[] = [];
  const params: unknown[] = [];
  if (cleaner_id) { params.push(cleaner_id); conds.push(`AND p.cleaner_id = $${params.length}`); }
  if (status) {
    if (!PAYOUT_STATUSES.has(status)) return c.json({ error: "Invalid status" }, 400);
    params.push(status); conds.push(`AND p.status = $${params.length}`);
  }
  if (from) {
    if (!ISO_DATE_RE.test(from)) return c.json({ error: "Invalid from date" }, 400);
    params.push(from); conds.push(`AND p.created_at >= $${params.length}`);
  }
  if (to) {
    if (!ISO_DATE_RE.test(to)) return c.json({ error: "Invalid to date" }, 400);
    params.push(to); conds.push(`AND p.created_at <= $${params.length}`);
  }
  const filter = conds.join("\n      ");

  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  const rows = await sql(
    `SELECT p.id, p.booking_id, p.cleaner_id, p.amount, p.platform_fee,
           p.gross_amount, p.net_amount, p.fee_rate, p.tier_multiplier,
           p.status, p.stripe_transfer_id, p.stripe_payout_id,
           p.scheduled_for, p.paid_at, p.held_reason, p.dispute_id,
           p.notes, p.created_at,
           cl.first_name || ' ' || cl.last_name AS cleaner_name,
           b.scheduled_at AS scheduled_date
    FROM payouts p
    JOIN cleaners cl ON cl.id = p.cleaner_id
    JOIN bookings b ON b.id = p.booking_id
    WHERE TRUE
      ${filter}
    ORDER BY p.created_at DESC
    LIMIT $${limitParam}
    OFFSET $${offsetParam}`,
    [...params, limitN, offsetN]
  );

  const total = await sql(
    `SELECT COUNT(*) n FROM payouts p WHERE TRUE
      ${filter}`,
    params
  ) as Array<{ n: string }>;

  return c.json({ rows, total: Number(total[0].n) });
});

// ─── Payouts list ────────────────────────────────────────────────────────────

adminPayoutsRouter.get("/payouts", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { limit = "50", offset = "0", status } = c.req.query();
  if (status && !PAYOUT_STATUSES.has(status)) return c.json({ error: "Invalid status" }, 400);
  const limitN = Math.max(1, Math.min(Number(limit) || 50, 500));
  const offsetN = Math.max(0, Number(offset) || 0);

  const rows = await sql(
    `SELECT p.*, cl.first_name || ' ' || cl.last_name AS cleaner_name
    FROM payouts p
    JOIN cleaners cl ON cl.id = p.cleaner_id
    ${status ? "WHERE p.status = $1" : ""}
    ORDER BY p.created_at DESC
    LIMIT ${status ? "$2" : "$1"} OFFSET ${status ? "$3" : "$2"}`,
    status ? [status, limitN, offsetN] : [limitN, offsetN]
  );

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

    // Atomic status lock: only proceed if the row is still in a releasable state.
    // This prevents double-spend under concurrent admin requests.
    const locked = (await sql`
      UPDATE payouts SET status = 'transferred', paid_at = NOW()
      WHERE id = ${payoutId} AND status NOT IN ('transferred', 'paid')
      RETURNING id
    `) as Array<{ id: string }>;
    if (!locked[0]) return c.json({ error: "Already paid or transfer in progress" }, 409);

    let transfer: { id: string };
    try {
      transfer = await stripe.transfers.create({
        amount: payout.amount as number,
        currency: "usd",
        destination: payout.stripe_connect_id as string,
        transfer_group: `booking_${payout.booking_id}`,
      });
    } catch (err) {
      // Revert the lock if Stripe fails.
      await sql`UPDATE payouts SET status = ${payout.status as string}, paid_at = NULL WHERE id = ${payoutId}`;
      throw err;
    }

    await sql`
      UPDATE payouts SET stripe_transfer_id = ${transfer.id} WHERE id = ${payoutId}
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
  zValidator("json", z.object({ reason: z.string().min(1).max(500) })),
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

// z.coerce.number() handles Neon returning NUMERIC columns as strings.
const feeConfigSchema = z.object({
  feeType: z.enum(["percentage", "flat", "hybrid"]),
  feeValue: z.coerce.number().positive(),
  minimumPlatformFee: z.coerce.number().int().min(0),
  maximumPlatformFee: z.coerce.number().int().positive().nullable().optional(),
  processingFeeStrategy: z.enum(["absorb", "pass_through", "split"]),
  processingFeeSplitPct: z.coerce.number().min(0).max(100).optional(),
  reservePercentage: z.coerce.number().min(0).max(100).optional(),
  payoutDelayDays: z.coerce.number().int().min(0).max(30),
  notes: z.string().optional(),
  reason: z.string().min(1),
});

adminPayoutsRouter.put(
  "/fee-config",
  requireAuth,
  superAdminOnly,
  zValidator("json", feeConfigSchema, (result, c) => {
    if (!result.success) {
      const sql = getDb((c.env as AppBindings["Bindings"]).DATABASE_URL);
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      logger.error("fee-config validation failed", undefined, { issues });
      void recordError(sql, {
        source: "server", app: "admin", level: "error",
        message: `PUT /admin/payouts/fee-config validation failed: ${issues}`,
        path: "/admin/payouts/fee-config", method: "PUT", statusCode: 400,
        clerkId: null, context: { issues: result.error.issues },
      });
      return c.json({ error: "Validation failed", issues: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const authUser = c.get("user");

    // Instead of writing directly, create a fee change proposal so the change
    // goes through the approval workflow (Slack card + email + approvals tab).
    const proposal = await createProposal(sql, { clerkId: authUser.clerkId, email: authUser.email }, {
      title: `Platform fee config change`,
      reason: body.reason,
      internalNotes: body.notes,
      proposedEffectiveAt: new Date().toISOString(),
      feeConfig: {
        name: `Platform fee — ${body.feeType} ${body.feeValue}`,
        fee_type: "platform_fee",
        affected_party: "both",
        calculation_method: body.feeType === "flat" ? "flat_amount" : "percentage",
        flat_amount_cents: body.feeType === "flat" ? Math.round(body.feeValue * 100) : null,
        percentage_bps: body.feeType === "percentage" ? Math.round(body.feeValue * 100) : null,
        city: null,
        state: null,
        service_type: null,
      },
    });

    await audit(sql, {
      action: "payout.fee_config_updated",
      actorClerkId: authUser.clerkId,
      targetType: "fee_proposal",
      targetId: proposal.id as string,
      metadata: { reason: body.reason, proposalId: proposal.id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    // Best-effort: Slack card + email notifications.
    await notifyProposalCreated(sql, c.env, proposal as never);

    return c.json({ ok: true, proposalId: proposal.id });
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
  const limitN = Math.max(1, Math.min(Number(limit) || 50, 500));
  const offsetN = Math.max(0, Number(offset) || 0);

  const conds: string[] = [];
  const params: unknown[] = [];
  if (from) {
    if (!ISO_DATE_RE.test(from)) return c.json({ error: "Invalid from date" }, 400);
    params.push(from); conds.push(`AND p.paid_at >= $${params.length}`);
  }
  if (to) {
    if (!ISO_DATE_RE.test(to)) return c.json({ error: "Invalid to date" }, 400);
    params.push(to); conds.push(`AND p.paid_at <= $${params.length}`);
  }
  const filter = conds.join("\n      ");

  const rows = await sql(
    `SELECT cl.id, cl.first_name || ' ' || cl.last_name AS name,
           cl.tier, cl.stripe_connect_id,
           COUNT(p.id) AS payout_count,
           COALESCE(SUM(p.amount), 0) AS total_paid,
           COALESCE(SUM(p.platform_fee), 0) AS total_platform_fee,
           COALESCE(SUM(p.gross_amount), 0) AS total_gross,
           COALESCE(AVG(p.fee_rate), 0) AS avg_fee_rate,
           MAX(p.paid_at) AS last_paid_at
    FROM cleaners cl
    LEFT JOIN payouts p ON p.cleaner_id = cl.id
      AND p.status IN ('paid', 'transferred')
      ${filter}
    GROUP BY cl.id, cl.first_name, cl.last_name, cl.tier, cl.stripe_connect_id
    ORDER BY total_paid DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitN, offsetN]
  );

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
           cl.first_name || ' ' || cl.last_name AS cleaner_name
    FROM payouts p
    JOIN cleaners cl ON cl.id = p.cleaner_id
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
  zValidator("json", z.object({ resolution: z.enum(["release", "cancel"]), notes: z.string().max(1000).optional() })),
  async (c) => {
    const payoutId = c.req.param("id");
    const { resolution, notes } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const newStatus = resolution === "release" ? "pending" : "failed";
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
  const limitN = Math.max(1, Math.min(Number(limit) || 50, 500));
  const offsetN = Math.max(0, Number(offset) || 0);

  const rows = await sql`
    SELECT pa.*, u.email AS actor_name
    FROM payout_settings_audit pa
    JOIN users u ON u.id = pa.actor_id
    ORDER BY pa.created_at DESC
    LIMIT ${limitN} OFFSET ${offsetN}
  `;

  return c.json({ rows });
});

// ─── Connected Account status ─────────────────────────────────────────────────

const STRIPE_ACCOUNT_STATUSES = new Set(["pending","active","restricted","rejected","deauthorized"]);

adminPayoutsRouter.get("/connected-accounts", requireAuth, anyAdmin, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { status } = c.req.query();
  if (status && !STRIPE_ACCOUNT_STATUSES.has(status)) return c.json({ error: "Invalid status" }, 400);

  const rows = await sql(
    `SELECT sa.*, cl.first_name || ' ' || cl.last_name AS cleaner_name
    FROM stripe_connected_accounts sa
    JOIN cleaners cl ON cl.id = sa.cleaner_id
    ${status ? "WHERE sa.status = $1" : ""}
    ORDER BY sa.created_at DESC
    LIMIT 100`,
    status ? [status] : []
  );

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
