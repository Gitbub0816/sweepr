/**
 * Sweepr Pricing Engine — canonical server-side implementation.
 *
 * All money is integer cents. Mirrors the SWEEPR_PRICING config stored in
 * pricing_rules.config_json so the DB is the single source of truth.
 *
 * Stripe gross-up is included in the customer price so the net received
 * after card processing equals the pre-gross subtotal.
 */

export interface SweeprPricingConfig {
  platform: {
    stripePercent: number;  // e.g. 0.029
    stripeFixed: number;    // cents, e.g. 30
    roundToCharmPrice: boolean;
  };
  baseByServiceType: Record<string, number>;         // cents
  sqftPricing: {
    includedSqft: Record<string, number>;
    pricePerExtraSqft: Record<string, number>;       // cents per sqft (may be fractional)
  };
  roomPricing: {
    includedBedrooms: number;
    includedBathrooms: number;
    bedroom: Record<string, number>;                 // cents per extra bedroom
    bathroom: Record<string, number>;                // cents per extra bathroom
  };
  propertyTypeMultiplier: Record<string, number>;    // e.g. 1.1
  conditionMultipliers: {
    heavySoil?: number;
    pets?: number;
    lotsOfClutter?: number;
    smokerHome?: number;
    [k: string]: number | undefined;
  };
  minimums: Record<string, number>;                  // cents
  cleanerPayout: {
    defaultPercent: number;
    byServiceType: Record<string, number>;
  };
}

export interface SweeprPriceInput {
  serviceType: string;   // "light" | "standard" | "deep" | "move_in_out" | "post_construction"
  sqft?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  pets?: boolean;
  heavySoil?: boolean;
  lotsOfClutter?: boolean;
  smokerHome?: boolean;
  addOnKeys?: string[];
}

export interface SweeprAddOn {
  addon_key: string;
  addon_name?: string;
  price_cents: number;
}

export interface SweeprPriceResult {
  customerPrice: number;              // cents — charge Stripe this
  estimatedCleanerPayout: number;     // cents
  estimatedPlatformGross: number;     // cents

  breakdown: {
    serviceType: string;
    base: number;
    sqftCharge: number;
    bedroomCharge: number;
    bathroomCharge: number;
    addOnCharge: number;
    propertyMultiplier: number;
    conditionMultipliers: number[];
    preProcessingSubtotal: number;
    stripeGrossUp: number;
    roundedFinalPrice: number;
  };

  warnings: string[];
}

/** Gross-up so the amount received after Stripe fees equals `net`. */
function grossUpForStripe(netCents: number, percent: number, fixedCents: number): number {
  return (netCents + fixedCents) / (1 - percent);
}

/**
 * Round up so the dollar value ends in 9.
 * e.g. 10100¢ ($101) → 10900¢ ($109), 10950¢ → 11900¢ ($119)
 */
function roundToCharmCents(cents: number): number {
  const dollars = Math.ceil(cents / 100);
  const rem = dollars % 10;
  const charmedDollars = rem === 9 ? dollars : dollars + (9 - rem);
  return charmedDollars * 100;
}

export function calculateSweeprPrice(
  input: SweeprPriceInput,
  config: SweeprPricingConfig,
  addons: SweeprAddOn[] = [],
): SweeprPriceResult {
  const warnings: string[] = [];
  const svc = input.serviceType;

  const base = config.baseByServiceType[svc];
  if (base == null) {
    warnings.push(`Unknown serviceType "${svc}"; defaulting to standard base.`);
  }
  const baseCents = base ?? config.baseByServiceType["standard"] ?? 10900;

  // Sqft charge
  const sqft = input.sqft ?? 0;
  const includedSqft = config.sqftPricing.includedSqft[svc] ?? 900;
  const extraSqft = Math.max(0, sqft - includedSqft);
  const sqftRate = config.sqftPricing.pricePerExtraSqft[svc] ?? 6;
  const sqftCharge = Math.round(extraSqft * sqftRate);

  // Bedroom charge
  const bedrooms = input.bedrooms ?? 1;
  const extraBedrooms = Math.max(0, bedrooms - config.roomPricing.includedBedrooms);
  const bedroomCharge = extraBedrooms * (config.roomPricing.bedroom[svc] ?? 1800);

  // Bathroom charge
  const bathrooms = input.bathrooms ?? 1;
  const extraBathrooms = Math.max(0, bathrooms - config.roomPricing.includedBathrooms);
  const bathroomCharge = extraBathrooms * (config.roomPricing.bathroom[svc] ?? 2800);

  // Add-on charge
  const selectedKeys = new Set(input.addOnKeys ?? []);
  let addOnCharge = 0;
  for (const a of addons) {
    if (selectedKeys.has(a.addon_key)) addOnCharge += a.price_cents;
  }

  let subtotal = baseCents + sqftCharge + bedroomCharge + bathroomCharge + addOnCharge;

  // Property type multiplier (multiplicative)
  const propMultiplier = config.propertyTypeMultiplier[input.propertyType ?? "house"] ?? 1.0;
  subtotal = subtotal * propMultiplier;

  // Condition multipliers (multiplicative, cumulative)
  const conditionsApplied: number[] = [];
  if (input.pets && config.conditionMultipliers.pets) {
    subtotal *= config.conditionMultipliers.pets;
    conditionsApplied.push(config.conditionMultipliers.pets);
  }
  if (input.heavySoil && config.conditionMultipliers.heavySoil) {
    subtotal *= config.conditionMultipliers.heavySoil;
    conditionsApplied.push(config.conditionMultipliers.heavySoil);
  }
  if (input.lotsOfClutter && config.conditionMultipliers.lotsOfClutter) {
    subtotal *= config.conditionMultipliers.lotsOfClutter;
    conditionsApplied.push(config.conditionMultipliers.lotsOfClutter);
  }
  if (input.smokerHome && config.conditionMultipliers.smokerHome) {
    subtotal *= config.conditionMultipliers.smokerHome;
    conditionsApplied.push(config.conditionMultipliers.smokerHome);
  }

  // Minimum
  const minimum = config.minimums[svc] ?? config.minimums["standard"] ?? 10900;
  subtotal = Math.max(subtotal, minimum);

  const preProcessingSubtotal = Math.round(subtotal);

  // Stripe gross-up
  const grossed = grossUpForStripe(
    preProcessingSubtotal,
    config.platform.stripePercent,
    config.platform.stripeFixed,
  );

  // Charm rounding
  const customerPrice = config.platform.roundToCharmPrice
    ? roundToCharmCents(grossed)
    : Math.ceil(grossed);

  const stripeGrossUp = customerPrice - preProcessingSubtotal;

  // Cleaner payout
  const payoutPct = config.cleanerPayout.byServiceType[svc] ?? config.cleanerPayout.defaultPercent;
  const estimatedCleanerPayout = Math.round(customerPrice * payoutPct);
  const estimatedPlatformGross = customerPrice - estimatedCleanerPayout;

  return {
    customerPrice,
    estimatedCleanerPayout,
    estimatedPlatformGross,
    breakdown: {
      serviceType: svc,
      base: baseCents,
      sqftCharge,
      bedroomCharge,
      bathroomCharge,
      addOnCharge,
      propertyMultiplier: propMultiplier,
      conditionMultipliers: conditionsApplied,
      preProcessingSubtotal,
      stripeGrossUp,
      roundedFinalPrice: customerPrice,
    },
    warnings,
  };
}
