/**
 * Algorithmic pricing — admin API.
 *
 *   Rules (super_admin to edit; any admin may read/simulate):
 *     GET    /admin/pricing/rules            list (?status=)
 *     GET    /admin/pricing/rules/:id        rule + add-ons
 *     POST   /admin/pricing/rules            create a draft (optional cloneFrom)
 *     PUT    /admin/pricing/rules/:id        update a draft
 *     PUT    /admin/pricing/rules/:id/addons replace a draft's add-ons
 *     GET    /admin/pricing/active           active rule for a market
 *     POST   /admin/pricing/simulate         price a sample home (current vs proposed)
 *
 *   Pricing-change proposals (super_admin) reuse the approval state machine:
 *     POST   /admin/pricing/proposals
 *     GET    /admin/pricing/proposals  (?status=)
 *     GET    /admin/pricing/proposals/:id
 *     POST   /admin/pricing/proposals/:id/{approve|decline|ignore|
 *            propose-modification|join-collaboration|revoke-approval|cancel}
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { audit } from "../lib/audit";
import { calculateCleaningPrice, type PricingRule, type PricingAddon } from "../lib/pricingRuleEngine";
import {
  createPricingProposal,
  getPricingProposal,
  approve, decline, ignore, proposeModification,
  joinCollaboration, revokeApproval, cancel,
} from "../lib/pricingApproval";
import { ApprovalError, type Actor } from "../lib/approvalEngine";
import { notifyPricingProposalCreated, updatePricingCard } from "../lib/approvalNotify";
import type { AppBindings } from "../types";

export const pricingAdminRouter = new Hono<AppBindings>();

const readGate = [requireAuth, requireAdminRole()] as const;       // any admin
const editGate = [requireAuth, requireAdminRole("super_admin")] as const;

function actorOf(c: { get: (k: "user") => { clerkId: string; email?: string } }): Actor {
  const u = c.get("user");
  return { clerkId: u.clerkId, email: u.email };
}

// Columns an admin may set on a draft rule.
const SCALAR_COLS = [
  "name", "description", "market_city", "market_state", "market_zip", "currency",
  "base_fee_cents", "minimum_booking_price_cents", "maximum_booking_price_cents",
  "sqft_pricing_enabled", "sqft_included_in_base", "sqft_overage_rate_cents_per_sqft", "sqft_custom_quote_threshold",
  "bedrooms_included_in_base", "price_per_extra_bedroom_cents",
  "bathrooms_included_in_base", "price_per_extra_bathroom_cents", "half_bathroom_price_cents",
  "distance_pricing_enabled", "free_distance_miles", "price_per_mile_cents", "distance_calculation_origin",
  "maximum_service_distance_miles", "long_distance_surcharge_cents",
  "pet_pricing_enabled", "pet_base_fee_cents", "price_per_pet_cents", "max_pet_count_before_custom_quote",
  "urgency_pricing_enabled", "recurring_discount_enabled",
  "rounding_enabled", "rounding_strategy", "rounding_increment_cents", "rounding_ending_cents",
  "maximum_auto_quote_price_cents", "requires_custom_quote_above_cents", "max_discount_bps", "max_dynamic_adjustment_bps",
];
const JSON_COLS = [
  "sqft_tiers_json", "bedroom_tiers_json", "bathroom_tiers_json",
  "property_type_adjustments_json", "service_type_multiplier_json", "service_type_fixed_surcharge_json",
  "intensity_multiplier_json", "urgency_rules_json", "recurring_discount_json",
];

function buildRuleUpdate(body: Record<string, unknown>): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of SCALAR_COLS) {
    if (col in body) { params.push(body[col]); sets.push(`${col} = $${params.length}`); }
  }
  for (const col of JSON_COLS) {
    if (col in body) {
      params.push(body[col] === null ? null : JSON.stringify(body[col]));
      sets.push(`${col} = $${params.length}::jsonb`);
    }
  }
  return { sets, params };
}

// ── Rules ─────────────────────────────────────────────────────────────────────
pricingAdminRouter.get("/rules", ...readGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const rows = await sql(
    `SELECT id, name, market_city, market_state, market_zip, status, version, base_fee_cents,
            minimum_booking_price_cents, active_from, created_at, updated_at
     FROM pricing_rules ${status ? "WHERE status = $1" : ""}
     ORDER BY created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  return c.json({ rules: rows });
});

pricingAdminRouter.get("/rules/:id", ...readGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rule = (await sql`SELECT * FROM pricing_rules WHERE id = ${id} LIMIT 1`) as unknown[];
  if (!rule[0]) return c.json({ error: "Not found" }, 404);
  const addons = (await sql`SELECT * FROM pricing_addons WHERE pricing_rule_id = ${id} ORDER BY addon_name`) as unknown[];
  return c.json({ rule: rule[0], addons });
});

pricingAdminRouter.post("/rules", ...editGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const cloneFrom = body.cloneFrom as string | undefined;

  let baseRule: Record<string, unknown> = {
    name: (body.name as string) ?? "New pricing rule",
    base_fee_cents: 0, minimum_booking_price_cents: 0,
  };
  let version = 1;
  let supersedes: string | null = null;
  if (cloneFrom) {
    const src = (await sql`SELECT * FROM pricing_rules WHERE id = ${cloneFrom} LIMIT 1`) as Array<Record<string, unknown>>;
    if (!src[0]) return c.json({ error: "Source rule not found" }, 404);
    baseRule = { ...src[0] };
    version = ((src[0].version as number) ?? 1) + 1;
    supersedes = cloneFrom;
    if (body.name) baseRule.name = body.name;
  }

  const rows = (await sql`
    INSERT INTO pricing_rules (name, description, market_city, market_state, market_zip, currency,
      base_fee_cents, minimum_booking_price_cents, status, version, supersedes_rule_id, created_by)
    VALUES (${baseRule.name}, ${baseRule.description ?? null}, ${baseRule.market_city ?? null},
      ${baseRule.market_state ?? null}, ${baseRule.market_zip ?? null}, ${baseRule.currency ?? "USD"},
      ${baseRule.base_fee_cents ?? 0}, ${baseRule.minimum_booking_price_cents ?? 0},
      'draft', ${version}, ${supersedes}, ${c.get("user").clerkId})
    RETURNING id
  `) as Array<{ id: string }>;
  const newId = rows[0].id;

  if (cloneFrom) {
    // Copy the full config + add-ons from the source.
    const { sets, params } = buildRuleUpdate(baseRule);
    if (sets.length) {
      params.push(newId);
      await sql(`UPDATE pricing_rules SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params);
    }
    await sql`
      INSERT INTO pricing_addons (pricing_rule_id, addon_key, addon_name, addon_description, price_cents,
        estimated_minutes, cleaner_payout_adjustment_cents, requires_customer_disclosure, requires_cleaner_acknowledgement, is_active)
      SELECT ${newId}, addon_key, addon_name, addon_description, price_cents, estimated_minutes,
        cleaner_payout_adjustment_cents, requires_customer_disclosure, requires_cleaner_acknowledgement, is_active
      FROM pricing_addons WHERE pricing_rule_id = ${cloneFrom}
    `;
  }
  return c.json({ ok: true, id: newId });
});

pricingAdminRouter.put("/rules/:id", ...editGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const cur = (await sql`SELECT status FROM pricing_rules WHERE id = ${id} LIMIT 1`) as Array<{ status: string }>;
  if (!cur[0]) return c.json({ error: "Not found" }, 404);
  if (cur[0].status !== "draft") return c.json({ error: "Only draft rules can be edited. Clone the active rule first." }, 409);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const { sets, params } = buildRuleUpdate(body);
  if (!sets.length) return c.json({ ok: true });
  params.push(id);
  await sql(`UPDATE pricing_rules SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params);
  return c.json({ ok: true });
});

pricingAdminRouter.put(
  "/rules/:id/addons",
  ...editGate,
  zValidator("json", z.object({
    addons: z.array(z.object({
      addon_key: z.string(), addon_name: z.string(), addon_description: z.string().optional(),
      price_cents: z.number().int(), estimated_minutes: z.number().int().optional(),
      cleaner_payout_adjustment_cents: z.number().int().optional(),
      requires_customer_disclosure: z.boolean().optional(),
      requires_cleaner_acknowledgement: z.boolean().optional(),
      is_active: z.boolean().optional(),
    })),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const cur = (await sql`SELECT status FROM pricing_rules WHERE id = ${id} LIMIT 1`) as Array<{ status: string }>;
    if (!cur[0]) return c.json({ error: "Not found" }, 404);
    if (cur[0].status !== "draft") return c.json({ error: "Only draft rules can be edited." }, 409);
    const { addons } = c.req.valid("json");
    await sql`DELETE FROM pricing_addons WHERE pricing_rule_id = ${id}`;
    for (const a of addons) {
      await sql`
        INSERT INTO pricing_addons (pricing_rule_id, addon_key, addon_name, addon_description, price_cents,
          estimated_minutes, cleaner_payout_adjustment_cents, requires_customer_disclosure, requires_cleaner_acknowledgement, is_active)
        VALUES (${id}, ${a.addon_key}, ${a.addon_name}, ${a.addon_description ?? null}, ${a.price_cents},
          ${a.estimated_minutes ?? null}, ${a.cleaner_payout_adjustment_cents ?? null},
          ${a.requires_customer_disclosure ?? false}, ${a.requires_cleaner_acknowledgement ?? false}, ${a.is_active ?? true})
      `;
    }
    return c.json({ ok: true });
  },
);

async function activeRuleForMarket(sql: ReturnType<typeof getDb>, city?: string, state?: string) {
  const rows = await sql(
    `SELECT * FROM pricing_rules WHERE status = 'active'
       AND ($1 = '' OR COALESCE(market_city,'') = '' OR market_city = $1)
       AND ($2 = '' OR COALESCE(market_state,'') = '' OR market_state = $2)
     ORDER BY (market_city IS NOT NULL) DESC, version DESC, active_from DESC NULLS LAST LIMIT 1`,
    [city ?? "", state ?? ""],
  );
  return (rows as Array<Record<string, unknown>>)[0] ?? null;
}

pricingAdminRouter.get("/active", ...readGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rule = await activeRuleForMarket(sql, c.req.query("city"), c.req.query("state"));
  if (!rule) return c.json({ rule: null, addons: [] });
  const addons = (await sql`SELECT * FROM pricing_addons WHERE pricing_rule_id = ${rule.id as string} AND is_active = TRUE`) as unknown[];
  return c.json({ rule, addons });
});

// ── Simulation ────────────────────────────────────────────────────────────────
const simInput = z.object({
  propertyType: z.string().optional(),
  squareFeet: z.number().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  halfBathrooms: z.number().optional(),
  serviceType: z.string().optional(),
  cleaningIntensity: z.string().optional(),
  petsPresent: z.boolean().optional(),
  petCount: z.number().optional(),
  addOnKeys: z.array(z.string()).optional(),
  recurringFrequency: z.string().optional(),
  distanceMiles: z.number().optional(),
  urgency: z.string().optional(),
});

pricingAdminRouter.post(
  "/simulate",
  ...readGate,
  zValidator("json", z.object({ ruleId: z.string().uuid().optional(), input: simInput, city: z.string().optional(), state: z.string().optional() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { ruleId, input, city, state } = c.req.valid("json");

    async function priceWith(rule: Record<string, unknown> | null) {
      if (!rule) return null;
      const addons = (await sql`SELECT addon_key, addon_name, price_cents FROM pricing_addons WHERE pricing_rule_id = ${rule.id as string}`) as PricingAddon[];
      return calculateCleaningPrice(input, rule as unknown as PricingRule, addons);
    }

    const proposedRule = ruleId
      ? ((await sql`SELECT * FROM pricing_rules WHERE id = ${ruleId} LIMIT 1`) as Array<Record<string, unknown>>)[0] ?? null
      : await activeRuleForMarket(sql, city, state);
    const activeRule = await activeRuleForMarket(sql, city, state);

    const proposed = await priceWith(proposedRule);
    const current = ruleId && activeRule && activeRule.id !== ruleId ? await priceWith(activeRule) : null;

    return c.json({
      proposed,
      current,
      difference_cents: proposed && current ? proposed.customer_total_cents - current.customer_total_cents : null,
    });
  },
);

// ── Proposals (governance) ─────────────────────────────────────────────────────
pricingAdminRouter.post(
  "/proposals",
  ...editGate,
  zValidator("json", z.object({
    pricingRuleId: z.string().uuid(),
    title: z.string().min(1),
    reason: z.string().min(1),
    internalNotes: z.string().optional(),
    externalNoticeSummary: z.string().optional(),
    proposedEffectiveAt: z.string(),
    affectsParties: z.boolean().default(true),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    try {
      const proposal = await createPricingProposal(sql, actorOf(c), c.req.valid("json"));
      await audit(sql, {
        action: "admin.action", actorClerkId: c.get("user").clerkId,
        targetType: "pricing_proposal", targetId: proposal.id as string,
        metadata: { event: "pricing_proposal_created", title: c.req.valid("json").title },
        timestamp: new Date().toISOString(),
      });
      await notifyPricingProposalCreated(sql, c.env, proposal as never);
      return c.json({ ok: true, proposal });
    } catch (err) {
      if (err instanceof ApprovalError) return c.json({ error: err.message }, err.status as 400);
      throw err;
    }
  },
);

pricingAdminRouter.get("/proposals", ...editGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const rows = await sql(
    `SELECT p.*, r.name AS rule_name FROM pricing_change_proposals p
     JOIN pricing_rules r ON r.id = p.proposed_pricing_rule_id
     ${status ? "WHERE p.status = $1" : ""}
     ORDER BY p.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  return c.json({ proposals: rows });
});

pricingAdminRouter.get("/proposals/:id", ...editGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const proposal = await getPricingProposal(sql, id);
  if (!proposal) return c.json({ error: "Not found" }, 404);
  const rule = (await sql`SELECT * FROM pricing_rules WHERE id = ${proposal.proposed_pricing_rule_id as string} LIMIT 1`) as unknown[];
  const actions = (await sql`SELECT * FROM pricing_change_actions WHERE proposal_id = ${id} ORDER BY created_at ASC`) as unknown[];
  const collaborators = (await sql`SELECT * FROM pricing_change_collaborators WHERE proposal_id = ${id}`) as unknown[];
  return c.json({ proposal, rule: rule[0] ?? null, actions, collaborators });
});

function proposalAction(path: string, fn: (sql: ReturnType<typeof getDb>, id: string, actor: Actor, body: Record<string, unknown>) => Promise<unknown>) {
  pricingAdminRouter.post(path, ...editGate, async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id") as string;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      const result = await fn(sql, id, actorOf(c), body);
      await updatePricingCard(sql, c.env, id);
      return c.json({ ok: true, result });
    } catch (err) {
      if (err instanceof ApprovalError) return c.json({ error: err.message }, err.status as 400);
      throw err;
    }
  });
}

proposalAction("/proposals/:id/approve", (sql, id, actor, b) => approve(sql, id, actor, b.comment as string | undefined));
proposalAction("/proposals/:id/decline", (sql, id, actor, b) => decline(sql, id, actor, b.reason as string | undefined));
proposalAction("/proposals/:id/ignore", (sql, id, actor) => ignore(sql, id, actor));
proposalAction("/proposals/:id/propose-modification", (sql, id, actor, b) => proposeModification(sql, id, actor, (b.comment as string) ?? "", b.modification));
proposalAction("/proposals/:id/join-collaboration", (sql, id, actor) => joinCollaboration(sql, id, actor));
proposalAction("/proposals/:id/revoke-approval", (sql, id, actor) => revokeApproval(sql, id, actor));
proposalAction("/proposals/:id/cancel", (sql, id, actor) => cancel(sql, id, actor));
