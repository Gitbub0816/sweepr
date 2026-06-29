/**
 * Algorithmic cleaning pricing — deterministic, rule-driven engine.
 *
 * Given the same input and the same pricing rule version, calculateCleaningPrice
 * always returns the same output. All money is integer cents.
 *
 * Conventions: multipliers are stored as percent×100 (145 = 1.45×); adjustments
 * as basis points (500 = +5%). Order of operations is fixed for determinism.
 */

export interface PricingRule {
  id: string;
  version: number;
  currency?: string;
  base_fee_cents: number;
  minimum_booking_price_cents: number;
  maximum_booking_price_cents?: number | null;

  sqft_pricing_enabled?: boolean;
  sqft_included_in_base?: number | null;
  sqft_tiers_json?: Array<{ max: number; add_cents: number }> | null;
  sqft_overage_rate_cents_per_sqft?: number | null;
  sqft_custom_quote_threshold?: number | null;

  bedrooms_included_in_base?: number | null;
  price_per_extra_bedroom_cents?: number | null;

  bathrooms_included_in_base?: number | null;
  price_per_extra_bathroom_cents?: number | null;
  half_bathroom_price_cents?: number | null;

  distance_pricing_enabled?: boolean;
  free_distance_miles?: number | null;
  price_per_mile_cents?: number | null;
  maximum_service_distance_miles?: number | null;
  long_distance_surcharge_cents?: number | null;

  property_type_adjustments_json?: Record<string, number> | null; // bps
  service_type_multiplier_json?: Record<string, number> | null;    // percent×100
  service_type_fixed_surcharge_json?: Record<string, number> | null; // cents
  intensity_multiplier_json?: Record<string, number> | null;       // percent×100

  pet_pricing_enabled?: boolean;
  pet_base_fee_cents?: number | null;
  price_per_pet_cents?: number | null;
  max_pet_count_before_custom_quote?: number | null;

  urgency_pricing_enabled?: boolean;
  urgency_rules_json?: Record<string, number> | null;              // percent×100

  recurring_discount_enabled?: boolean;
  recurring_discount_json?: { weekly_bps?: number; biweekly_bps?: number; monthly_bps?: number } | null;

  rounding_enabled?: boolean;
  rounding_strategy?: string | null;
  rounding_increment_cents?: number | null;
  rounding_ending_cents?: number | null;

  requires_custom_quote_above_cents?: number | null;
  max_discount_bps?: number | null;
}

export interface PricingAddon {
  addon_key: string;
  addon_name?: string;
  price_cents: number;
}

export interface PricingInput {
  propertyType?: string;
  squareFeet?: number;
  bedrooms?: number;
  bathrooms?: number;
  halfBathrooms?: number;
  serviceType?: string;
  cleaningIntensity?: string; // light | normal | heavy | extreme
  petsPresent?: boolean;
  petCount?: number;
  addOnKeys?: string[];
  recurringFrequency?: string; // one_time | weekly | biweekly | monthly
  distanceMiles?: number;
  urgency?: string;            // same_day | next_day | peak | low_supply
}

export interface LineItem {
  label: string;
  cents: number;
}

export interface PriceBreakdown {
  pricing_rule_id: string;
  pricing_rule_version: number;
  currency: string;
  base_fee_cents: number;
  square_footage_fee_cents: number;
  bedroom_fee_cents: number;
  bathroom_fee_cents: number;
  distance_fee_cents: number;
  property_type_adjustment_cents: number;
  service_type_adjustment_cents: number;
  intensity_adjustment_cents: number;
  add_ons_total_cents: number;
  pet_fee_cents: number;
  urgency_adjustment_cents: number;
  recurring_discount_cents: number; // negative
  subtotal_cents: number;
  rounded_total_cents: number;
  customer_total_cents: number;
  estimated_cleaner_payout_cents: number;
  estimated_platform_revenue_cents: number;
  requires_custom_quote: boolean;
  warnings: string[];
  line_items: LineItem[];
}

function n(v: number | null | undefined, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function applyRounding(total: number, rule: PricingRule): number {
  if (!rule.rounding_enabled) return Math.round(total);
  const inc = n(rule.rounding_increment_cents, 1000) || 1000;
  const ending = n(rule.rounding_ending_cents, 900);
  switch (rule.rounding_strategy) {
    case "nearest_increment":
      return Math.round(total / inc) * inc;
    case "round_up":
      return Math.ceil(total / inc) * inc;
    case "round_down":
      return Math.floor(total / inc) * inc;
    case "end_in_9":
    case "end_in_99":
    case "custom":
    default: {
      let candidate = Math.floor(total / inc) * inc + ending;
      if (candidate < total) candidate += inc;
      return candidate;
    }
  }
}

export function calculateCleaningPrice(
  input: PricingInput,
  rule: PricingRule,
  addons: PricingAddon[] = [],
  opts: { platformCommissionBps?: number } = {},
): PriceBreakdown {
  const warnings: string[] = [];
  const lineItems: LineItem[] = [];
  let requiresCustomQuote = false;

  const base = n(rule.base_fee_cents);
  lineItems.push({ label: "Base fee", cents: base });

  // Square footage.
  let sqftFee = 0;
  const sqft = n(input.squareFeet);
  if (rule.sqft_pricing_enabled && sqft > 0) {
    const included = n(rule.sqft_included_in_base, 0);
    if (sqft > included) {
      const tiers = (rule.sqft_tiers_json ?? []).slice().sort((a, b) => a.max - b.max);
      const tier = tiers.find((t) => sqft <= t.max);
      if (tier) sqftFee = n(tier.add_cents);
      else if (rule.sqft_overage_rate_cents_per_sqft) {
        const overFrom = tiers.length ? tiers[tiers.length - 1].max : included;
        sqftFee = Math.max(0, sqft - overFrom) * n(rule.sqft_overage_rate_cents_per_sqft);
      }
    }
    if (rule.sqft_custom_quote_threshold && sqft > rule.sqft_custom_quote_threshold) {
      requiresCustomQuote = true;
      warnings.push("Square footage exceeds the custom-quote threshold.");
    }
  }
  if (sqftFee) lineItems.push({ label: "Square footage", cents: sqftFee });

  // Bedrooms.
  const bedrooms = n(input.bedrooms);
  const bedFee = Math.max(0, bedrooms - n(rule.bedrooms_included_in_base, 0)) * n(rule.price_per_extra_bedroom_cents);
  if (bedFee) lineItems.push({ label: "Bedrooms", cents: bedFee });

  // Bathrooms.
  const bathrooms = n(input.bathrooms);
  const bathFee =
    Math.max(0, bathrooms - n(rule.bathrooms_included_in_base, 0)) * n(rule.price_per_extra_bathroom_cents) +
    n(input.halfBathrooms) * n(rule.half_bathroom_price_cents);
  if (bathFee) lineItems.push({ label: "Bathrooms", cents: bathFee });

  // Distance.
  let distanceFee = 0;
  if (rule.distance_pricing_enabled && input.distanceMiles) {
    const miles = n(input.distanceMiles);
    const free = n(rule.free_distance_miles, 0);
    if (miles > free) distanceFee = Math.round((miles - free) * n(rule.price_per_mile_cents));
    if (rule.long_distance_surcharge_cents && rule.maximum_service_distance_miles && miles > n(rule.maximum_service_distance_miles)) {
      distanceFee += n(rule.long_distance_surcharge_cents);
      warnings.push("Long-distance surcharge applied.");
    }
  }
  if (distanceFee) lineItems.push({ label: "Distance", cents: distanceFee });

  const componentsSubtotal = base + sqftFee + bedFee + bathFee + distanceFee;

  // Property type adjustment (bps on components subtotal).
  const propBps = n(rule.property_type_adjustments_json?.[input.propertyType ?? ""], 0);
  const propAdj = Math.round((componentsSubtotal * propBps) / 10000);
  if (propAdj) lineItems.push({ label: "Property type", cents: propAdj });

  // Service type multiplier (percent×100) + fixed surcharge.
  const svcMultPct = n(rule.service_type_multiplier_json?.[input.serviceType ?? ""], 100) || 100;
  const svcFixed = n(rule.service_type_fixed_surcharge_json?.[input.serviceType ?? ""], 0);
  const afterProp = componentsSubtotal + propAdj;
  const svcAdj = Math.round((afterProp * (svcMultPct - 100)) / 100) + svcFixed;
  if (svcAdj) lineItems.push({ label: "Service type", cents: svcAdj });

  // Cleaning intensity multiplier.
  const intPct = n(rule.intensity_multiplier_json?.[input.cleaningIntensity ?? ""], 100) || 100;
  const afterSvc = afterProp + svcAdj;
  const intAdj = Math.round((afterSvc * (intPct - 100)) / 100);
  if (intAdj) lineItems.push({ label: "Cleaning intensity", cents: intAdj });
  if (input.cleaningIntensity === "extreme") {
    requiresCustomQuote = true;
    warnings.push("Extreme cleaning intensity requires manual review.");
  }

  // Add-ons.
  const selected = new Set(input.addOnKeys ?? []);
  let addOnsTotal = 0;
  for (const a of addons) {
    if (selected.has(a.addon_key)) {
      addOnsTotal += n(a.price_cents);
      lineItems.push({ label: a.addon_name ?? a.addon_key, cents: n(a.price_cents) });
    }
  }

  // Pets.
  let petFee = 0;
  if (rule.pet_pricing_enabled && input.petsPresent) {
    const count = Math.max(1, n(input.petCount, 1));
    petFee = n(rule.pet_base_fee_cents) + Math.max(0, count - 1) * n(rule.price_per_pet_cents);
    if (rule.max_pet_count_before_custom_quote && count > rule.max_pet_count_before_custom_quote) {
      requiresCustomQuote = true;
      warnings.push("Pet count exceeds the custom-quote threshold.");
    }
  }
  if (petFee) lineItems.push({ label: "Pets", cents: petFee });

  const preUrgency = afterSvc + intAdj + addOnsTotal + petFee;

  // Urgency (percent×100 of the running subtotal).
  let urgencyAdj = 0;
  if (rule.urgency_pricing_enabled && input.urgency) {
    const pct = n(rule.urgency_rules_json?.[input.urgency], 100) || 100;
    urgencyAdj = Math.round((preUrgency * (pct - 100)) / 100);
  }
  if (urgencyAdj) lineItems.push({ label: "Priority scheduling", cents: urgencyAdj });

  // Recurring discount (bps, negative).
  let recurringDiscount = 0;
  if (rule.recurring_discount_enabled && input.recurringFrequency && input.recurringFrequency !== "one_time") {
    const d = rule.recurring_discount_json ?? {};
    const bps =
      input.recurringFrequency === "weekly" ? n(d.weekly_bps)
        : input.recurringFrequency === "biweekly" ? n(d.biweekly_bps)
          : input.recurringFrequency === "monthly" ? n(d.monthly_bps)
            : 0;
    const cappedBps = rule.max_discount_bps ? Math.min(bps, rule.max_discount_bps) : bps;
    recurringDiscount = -Math.round(((preUrgency + urgencyAdj) * cappedBps) / 10000);
  }
  if (recurringDiscount) lineItems.push({ label: "Recurring discount", cents: recurringDiscount });

  let subtotal = preUrgency + urgencyAdj + recurringDiscount;
  if (subtotal < 0) subtotal = 0;

  // Minimum / custom-quote ceiling / maximum.
  const minPrice = n(rule.minimum_booking_price_cents);
  if (subtotal < minPrice) subtotal = minPrice;
  if (rule.requires_custom_quote_above_cents && subtotal > rule.requires_custom_quote_above_cents) {
    requiresCustomQuote = true;
    warnings.push("Price exceeds the auto-quote ceiling; route to manual review.");
  }
  if (rule.maximum_booking_price_cents && subtotal > rule.maximum_booking_price_cents) {
    subtotal = rule.maximum_booking_price_cents;
  }

  const rounded = applyRounding(subtotal, rule);
  const customerTotal = Math.max(rounded, minPrice);

  const commissionBps = n(opts.platformCommissionBps, 3000); // 30% default estimate
  const platformRevenue = Math.round((customerTotal * commissionBps) / 10000);
  const cleanerPayout = customerTotal - platformRevenue;

  return {
    pricing_rule_id: rule.id,
    pricing_rule_version: rule.version,
    currency: rule.currency ?? "USD",
    base_fee_cents: base,
    square_footage_fee_cents: sqftFee,
    bedroom_fee_cents: bedFee,
    bathroom_fee_cents: bathFee,
    distance_fee_cents: distanceFee,
    property_type_adjustment_cents: propAdj,
    service_type_adjustment_cents: svcAdj,
    intensity_adjustment_cents: intAdj,
    add_ons_total_cents: addOnsTotal,
    pet_fee_cents: petFee,
    urgency_adjustment_cents: urgencyAdj,
    recurring_discount_cents: recurringDiscount,
    subtotal_cents: subtotal,
    rounded_total_cents: rounded,
    customer_total_cents: customerTotal,
    estimated_cleaner_payout_cents: cleanerPayout,
    estimated_platform_revenue_cents: platformRevenue,
    requires_custom_quote: requiresCustomQuote,
    warnings,
    line_items: lineItems,
  };
}
