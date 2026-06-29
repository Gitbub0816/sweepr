/**
 * Bridges customer booking input to the algorithmic pricing engine.
 *
 * When the active rule has a config_json blob the new SweeprPricingEngine is
 * used (exact SWEEPR_PRICING logic, Stripe gross-up included). Otherwise the
 * legacy pricingRuleEngine is used. Falls back to null when no rule is active
 * so callers can fall back to the hardcoded legacy calculator.
 */
import type { Sql } from "./db";
import {
  calculateCleaningPrice,
  type PricingRule,
  type PricingAddon,
  type PricingInput,
  type PriceBreakdown,
} from "./pricingRuleEngine";
import {
  calculateSweeprPrice,
  type SweeprPricingConfig,
  type SweeprAddOn,
} from "./sweeprPricingEngine";

export interface BookingPricingInput {
  serviceType: "light" | "standard" | "deep" | "move_in_out" | "recurring" | "post_construction" | "vacation_rental";
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  homeType: string;
  hasPets?: boolean;
  heavyMess?: boolean;
  lotsOfClutter?: boolean;
  smokerHome?: boolean;
  addOnKeys?: string[];
}

// ── Legacy mapping (used when no config_json on the rule) ────────────────────

const SERVICE_MAP_LEGACY: Record<string, string> = {
  light: "standard_cleaning",
  standard: "standard_cleaning",
  deep: "deep_cleaning",
  move_in_out: "move_in_move_out",
  recurring: "standard_cleaning",
  post_construction: "post_construction",
  vacation_rental: "standard_cleaning",
};

function toPricingInput(input: BookingPricingInput): PricingInput {
  return {
    propertyType: input.homeType,
    squareFeet: input.sqft,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    serviceType: SERVICE_MAP_LEGACY[input.serviceType] ?? input.serviceType,
    cleaningIntensity: input.heavyMess ? "heavy" : "normal",
    petsPresent: input.hasPets,
    addOnKeys: input.addOnKeys ?? [],
    recurringFrequency: input.serviceType === "recurring" ? "weekly" : "one_time",
  };
}

// ── New engine mapping ────────────────────────────────────────────────────────

// Map legacy/booking service type → SWEEPR_PRICING service type key
const SERVICE_MAP_NEW: Record<string, string> = {
  light: "light",
  standard: "standard",
  deep: "deep",
  move_in_out: "move_in_out",
  recurring: "standard",        // recurring = standard cadence booking
  post_construction: "post_construction",
  vacation_rental: "standard",  // fallback
};

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

  const addons = (await sql`
    SELECT addon_key, addon_name, price_cents FROM pricing_addons
    WHERE pricing_rule_id = ${rule.id as string} AND is_active = TRUE
  `) as (PricingAddon & SweeprAddOn)[];

  // ── New engine: use when config_json is present ───────────────────────────
  if (rule.config_json) {
    const config = rule.config_json as unknown as SweeprPricingConfig;
    const svcKey = SERVICE_MAP_NEW[input.serviceType] ?? "standard";
    const result = calculateSweeprPrice(
      {
        serviceType: svcKey,
        sqft: input.sqft,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        propertyType: input.homeType,
        pets: input.hasPets,
        heavySoil: input.heavyMess,
        lotsOfClutter: input.lotsOfClutter,
        smokerHome: input.smokerHome,
        addOnKeys: input.addOnKeys,
      },
      config,
      addons,
    );

    // Adapt SweeprPriceResult → PriceBreakdown shape so callers stay unchanged
    const adapted: PriceBreakdown = {
      pricing_rule_id: rule.id as string,
      pricing_rule_version: (rule.version as number) ?? 1,
      currency: "USD",
      base_fee_cents: result.breakdown.base,
      square_footage_fee_cents: result.breakdown.sqftCharge,
      bedroom_fee_cents: result.breakdown.bedroomCharge,
      bathroom_fee_cents: result.breakdown.bathroomCharge,
      distance_fee_cents: 0,
      property_type_adjustment_cents: Math.round(result.breakdown.base * (result.breakdown.propertyMultiplier - 1)),
      service_type_adjustment_cents: 0,
      intensity_adjustment_cents: 0,
      add_ons_total_cents: result.breakdown.addOnCharge,
      pet_fee_cents: 0,
      urgency_adjustment_cents: 0,
      recurring_discount_cents: 0,
      subtotal_cents: result.breakdown.preProcessingSubtotal,
      rounded_total_cents: result.breakdown.roundedFinalPrice,
      customer_total_cents: result.customerPrice,
      estimated_cleaner_payout_cents: result.estimatedCleanerPayout,
      estimated_platform_revenue_cents: result.estimatedPlatformGross,
      requires_custom_quote: false,
      warnings: result.warnings,
      line_items: [
        { label: "Base fee", cents: result.breakdown.base },
        ...(result.breakdown.sqftCharge ? [{ label: "Square footage", cents: result.breakdown.sqftCharge }] : []),
        ...(result.breakdown.bedroomCharge ? [{ label: "Bedrooms", cents: result.breakdown.bedroomCharge }] : []),
        ...(result.breakdown.bathroomCharge ? [{ label: "Bathrooms", cents: result.breakdown.bathroomCharge }] : []),
        ...(result.breakdown.addOnCharge ? [{ label: "Add-ons", cents: result.breakdown.addOnCharge }] : []),
        ...(result.breakdown.stripeGrossUp ? [{ label: "Processing (included)", cents: result.breakdown.stripeGrossUp }] : []),
      ],
    };

    const legacyInput: PricingInput = {
      propertyType: input.homeType,
      squareFeet: input.sqft,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      serviceType: svcKey,
      petsPresent: input.hasPets,
      addOnKeys: input.addOnKeys ?? [],
    };

    return { breakdown: adapted, ruleId: rule.id as string, ruleVersion: (rule.version as number) ?? 1, input: legacyInput };
  }

  // ── Legacy engine: column-based rule ─────────────────────────────────────
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
