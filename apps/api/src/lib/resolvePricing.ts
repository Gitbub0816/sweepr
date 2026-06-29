/**
 * Bridges customer booking input to the algorithmic pricing engine.
 *
 * Resolves the active pricing rule for a market, prices the booking, and (on
 * creation) stores an immutable pricing_quotes snapshot so historical bookings
 * never change when rules change. Falls back to null when no rule is active so
 * callers can use the legacy calculator.
 */
import type { Sql } from "./db";
import {
  calculateCleaningPrice,
  type PricingRule,
  type PricingAddon,
  type PricingInput,
  type PriceBreakdown,
} from "./pricingRuleEngine";

export interface BookingPricingInput {
  serviceType: "standard" | "deep" | "move_in_out" | "recurring";
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  homeType: string;
  hasPets?: boolean;
  heavyMess?: boolean;
  addOnKeys?: string[];
}

const SERVICE_MAP: Record<string, string> = {
  standard: "standard_cleaning",
  deep: "deep_cleaning",
  move_in_out: "move_in_move_out",
  recurring: "standard_cleaning",
};

function toPricingInput(input: BookingPricingInput): PricingInput {
  return {
    propertyType: input.homeType,
    squareFeet: input.sqft,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    serviceType: SERVICE_MAP[input.serviceType] ?? input.serviceType,
    cleaningIntensity: input.heavyMess ? "heavy" : "normal",
    petsPresent: input.hasPets,
    addOnKeys: input.addOnKeys ?? [],
    recurringFrequency: input.serviceType === "recurring" ? "weekly" : "one_time",
  };
}

async function activeRule(sql: Sql, city?: string, state?: string): Promise<Record<string, unknown> | null> {
  const rows = await sql(
    `SELECT * FROM pricing_rules WHERE status = 'active'
       AND ($1 = '' OR COALESCE(market_city,'') = '' OR market_city = $1)
       AND ($2 = '' OR COALESCE(market_state,'') = '' OR market_state = $2)
     ORDER BY (market_city IS NOT NULL) DESC, version DESC, active_from DESC NULLS LAST LIMIT 1`,
    [city ?? "", state ?? ""],
  );
  return (rows as Array<Record<string, unknown>>)[0] ?? null;
}

export interface ResolvedPricing {
  breakdown: PriceBreakdown;
  ruleId: string;
  ruleVersion: number;
  input: PricingInput;
}

/** Price a booking with the active rule, or return null to fall back to legacy. */
export async function resolveBookingPricing(
  sql: Sql,
  input: BookingPricingInput,
  market?: { city?: string; state?: string },
): Promise<ResolvedPricing | null> {
  const rule = await activeRule(sql, market?.city, market?.state);
  if (!rule) return null;
  const addons = (await sql`SELECT addon_key, addon_name, price_cents FROM pricing_addons WHERE pricing_rule_id = ${rule.id as string} AND is_active = TRUE`) as PricingAddon[];
  const pricingInput = toPricingInput(input);
  const breakdown = calculateCleaningPrice(pricingInput, rule as unknown as PricingRule, addons);
  return { breakdown, ruleId: rule.id as string, ruleVersion: (rule.version as number) ?? 1, input: pricingInput };
}

/** Persist an immutable quote snapshot tied to a booking + customer. */
export async function storeQuoteSnapshot(
  sql: Sql,
  resolved: ResolvedPricing,
  ref: { customerId?: string; bookingId?: string },
): Promise<string> {
  const rows = (await sql`
    INSERT INTO pricing_quotes (
      customer_id, booking_id, pricing_rule_id, pricing_rule_version,
      quote_input_json, quote_output_json, customer_total_cents,
      estimated_cleaner_payout_cents, estimated_platform_revenue_cents, requires_custom_quote
    ) VALUES (
      ${ref.customerId ?? null}, ${ref.bookingId ?? null}, ${resolved.ruleId}, ${resolved.ruleVersion},
      ${JSON.stringify(resolved.input)}, ${JSON.stringify(resolved.breakdown)},
      ${resolved.breakdown.customer_total_cents}, ${resolved.breakdown.estimated_cleaner_payout_cents},
      ${resolved.breakdown.estimated_platform_revenue_cents}, ${resolved.breakdown.requires_custom_quote}
    ) RETURNING id
  `) as Array<{ id: string }>;
  return rows[0].id;
}
