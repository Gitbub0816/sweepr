import type {
  AddOn,
  HomeDetails,
  HomeType,
  Quote,
  ServiceType,
  SubscriptionCadence,
} from "@sweepr/types";

// ---------------------------------------------------------------------------
// Locked pricing engine
//
// Sweepr sets all prices. Customers only ever see `displayPrice` — never the
// internal price, Stripe cost, or rounding buffer. All internal audit fields
// are stored in the DB for reconciliation but are NEVER surfaced to customers.
// ---------------------------------------------------------------------------

const CLEANING_TYPE_MULTIPLIERS: Record<ServiceType, number> = {
  light: 0.75,
  standard: 1.0,
  deep: 1.6,
  move_in_out: 1.8,
  recurring: 0.9,
  post_construction: 2.0,
  vacation_rental: 1.3,
};

const BASE_FEES: Record<HomeType, number> = {
  studio: 65,
  apartment: 75,
  condo: 80,
  townhouse: 85,
  house: 90,
  large_house: 110,
};

function sqftModifier(sqft: number): number {
  if (sqft <= 500) return 0;
  if (sqft <= 1000) return 15;
  if (sqft <= 1500) return 30;
  if (sqft <= 2000) return 50;
  if (sqft <= 2500) return 70;
  if (sqft <= 3000) return 95;
  if (sqft <= 4000) return 130;
  return 175; // 4000+
}

export const PER_BEDROOM = 22;
export const PER_BATHROOM = 18;

const HEAVY_MESS_SURCHARGE = 35;
const PET_SURCHARGE = 20;
const SUPPLIES_SURCHARGE = 15;

const OPERATIONAL_MARGIN = 0.18; // 18%

function stripeFee(amount: number): number {
  return amount * 0.029 + 0.3;
}

export interface DynamicModifiers {
  highDemand?: number; // e.g. 1.15 = 15% surge
  holiday?: number;
  emergency?: number; // same/next day booking
  weather?: number;
  distanceSurcharge?: number; // flat dollar amount
  cleanerIncentive?: number; // flat dollar amount added to internal cost
}

const DISPLAY_TIERS = [
  99, 109, 119, 129, 139, 149, 159, 169, 179, 199, 219, 249, 279, 299, 329,
  359, 399, 449, 499,
];

function roundToDisplayTier(internal: number): number {
  const tier = DISPLAY_TIERS.find((t) => t >= internal);
  return tier ?? Math.ceil(internal / 10) * 10 + 9; // above max tier: round to next x9
}

export const ADD_ON_PRICES: Record<string, number> = {
  fridge: 35,
  oven: 25,
  windows: 45,
  cabinets: 30,
  laundry: 25,
  dishes: 20,
  baseboards: 20,
  pet_hair: 30,
  extra_bathroom: 20,
  extra_bedroom: 25,
};

export interface PricingInput {
  serviceType: ServiceType;
  homeType: HomeType;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  addOnKeys: string[];
  heavyMess: boolean;
  hasPets: boolean;
  suppliesNeeded: boolean;
  dynamic?: DynamicModifiers;
  isEmergency?: boolean; // same/next day — adds emergency modifier
}

export interface PricingResult {
  // Customer sees ONLY displayPrice
  displayPrice: number; // e.g. 159 (dollars, not cents)

  // Internal audit fields (stored in DB, never shown to customer)
  internalPrice: number;
  stripeCost: number;
  roundingBuffer: number;
  operationalMargin: number;

  // Breakdown (internal use / admin)
  breakdown: {
    baseFee: number;
    sqftModifier: number;
    bedroomModifier: number;
    bathroomModifier: number;
    cleaningMultiplier: number;
    addOnsTotal: number;
    conditionAdjustments: number;
    subtotalBeforeMargin: number;
    dynamicModifiers: number;
    distanceSurcharge: number;
    cleanerIncentive: number;
  };

  // For DB storage
  dbRecord: {
    internal_price: number;
    display_price: number;
    stripe_cost: number;
    rounding_buffer: number;
    pricing_inputs: PricingInput;
  };
}

export function calculatePrice(input: PricingInput): PricingResult {
  const base = BASE_FEES[input.homeType] ?? BASE_FEES.house;
  const sqft = sqftModifier(input.sqft);
  const bedrooms = input.bedrooms * PER_BEDROOM;
  const bathrooms = input.bathrooms * PER_BATHROOM;

  const subtotalBeforeMultiplier = base + sqft + bedrooms + bathrooms;

  const multiplier = CLEANING_TYPE_MULTIPLIERS[input.serviceType] ?? 1.0;
  let subtotal = subtotalBeforeMultiplier * multiplier;

  const addOnsTotal = input.addOnKeys.reduce(
    (sum, key) => sum + (ADD_ON_PRICES[key] ?? 0),
    0
  );
  subtotal += addOnsTotal;

  let conditionAdjustments = 0;
  if (input.heavyMess) conditionAdjustments += HEAVY_MESS_SURCHARGE;
  if (input.hasPets) conditionAdjustments += PET_SURCHARGE;
  if (input.suppliesNeeded) conditionAdjustments += SUPPLIES_SURCHARGE;
  subtotal += conditionAdjustments;

  let dynamicModifierAmount = 0;
  const dm = input.dynamic ?? {};

  if (dm.highDemand && dm.highDemand > 1)
    dynamicModifierAmount += subtotal * (dm.highDemand - 1);
  if (dm.holiday && dm.holiday > 1)
    dynamicModifierAmount += subtotal * (dm.holiday - 1);
  if (input.isEmergency) dynamicModifierAmount += subtotal * 0.15; // 15% emergency surcharge
  if (dm.weather && dm.weather > 1)
    dynamicModifierAmount += subtotal * (dm.weather - 1);

  const distanceSurcharge = dm.distanceSurcharge ?? 0;
  const cleanerIncentive = dm.cleanerIncentive ?? 0;

  subtotal += dynamicModifierAmount + distanceSurcharge + cleanerIncentive;

  const operationalMarginAmount = subtotal * OPERATIONAL_MARGIN;
  subtotal += operationalMarginAmount;

  const stripe = stripeFee(subtotal);
  const internalPrice = subtotal + stripe;

  const displayPrice = roundToDisplayTier(internalPrice);
  const roundingBuffer = displayPrice - internalPrice;

  return {
    displayPrice,
    internalPrice: Math.round(internalPrice * 100) / 100,
    stripeCost: Math.round(stripe * 100) / 100,
    roundingBuffer: Math.round(roundingBuffer * 100) / 100,
    operationalMargin: Math.round(operationalMarginAmount * 100) / 100,
    breakdown: {
      baseFee: base,
      sqftModifier: sqft,
      bedroomModifier: bedrooms,
      bathroomModifier: bathrooms,
      cleaningMultiplier: multiplier,
      addOnsTotal,
      conditionAdjustments,
      subtotalBeforeMargin:
        Math.round((subtotal - operationalMarginAmount - stripe) * 100) / 100,
      dynamicModifiers: dynamicModifierAmount,
      distanceSurcharge,
      cleanerIncentive,
    },
    dbRecord: {
      internal_price: Math.round(internalPrice * 100) / 100,
      display_price: displayPrice,
      stripe_cost: Math.round(stripe * 100) / 100,
      rounding_buffer: Math.round(roundingBuffer * 100) / 100,
      pricing_inputs: input,
    },
  };
}

// Recurring subscription price (display price in dollars).
export function recurringDisplayPrice(
  baseDisplayPrice: number,
  cadence: SubscriptionCadence
): number {
  // Additional discount for locking in a subscription.
  const discounts = { weekly: 0.1, biweekly: 0.08, monthly: 0.05 };
  const discount = discounts[cadence];
  const discounted = baseDisplayPrice * (1 - discount);
  return roundToDisplayTier(discounted);
}

// ---------------------------------------------------------------------------
// Canonical quote helpers — matches SWEEPR_PRICING (server pricingEngine).
// All values in DOLLARS for UI display. Server always recalculates in cents.
// ---------------------------------------------------------------------------

// Per-service-type base prices (dollars)
const SWEEPR_BASE: Partial<Record<ServiceType, number>> = {
  light:            79,
  standard:        109,
  deep:            169,
  move_in_out:     219,
  post_construction: 289,
  recurring:       109, // same as standard; cadence discount applied separately
  vacation_rental: 109,
};

// Sqft free allowance per service type
const SWEEPR_SQFT_INCLUDED: Partial<Record<ServiceType, number>> = {
  light: 700, standard: 900, deep: 900, move_in_out: 1000, post_construction: 1000,
  recurring: 900, vacation_rental: 900,
};
// Dollars per extra sqft
const SWEEPR_SQFT_RATE: Partial<Record<ServiceType, number>> = {
  light: 0.045, standard: 0.06, deep: 0.09, move_in_out: 0.11, post_construction: 0.14,
  recurring: 0.06, vacation_rental: 0.06,
};
// Dollars per extra bedroom (beyond 1 included)
const SWEEPR_BEDROOM_RATE: Partial<Record<ServiceType, number>> = {
  light: 12, standard: 18, deep: 28, move_in_out: 34, post_construction: 42,
  recurring: 18, vacation_rental: 18,
};
// Dollars per extra bathroom (beyond 1 included)
const SWEEPR_BATHROOM_RATE: Partial<Record<ServiceType, number>> = {
  light: 18, standard: 28, deep: 42, move_in_out: 52, post_construction: 65,
  recurring: 28, vacation_rental: 28,
};

const SWEEPR_PROPERTY_MULTIPLIER: Partial<Record<HomeType, number>> = {
  apartment: 0.95, condo: 1.0, townhouse: 1.05, house: 1.1, large_house: 1.2,
  studio: 0.90,
};

const STRIPE_PERCENT = 0.029;
const STRIPE_FIXED   = 0.30;

function sweeprGrossUp(amount: number): number {
  return (amount + STRIPE_FIXED) / (1 - STRIPE_PERCENT);
}

function roundToNextNine(amount: number): number {
  const rounded = Math.ceil(amount);
  const rem = rounded % 10;
  return rem === 9 ? rounded : rounded + (9 - rem);
}

export const BASE_PRICES: Partial<Record<ServiceType, number>> = SWEEPR_BASE;

export const SERVICE_LABELS: Record<ServiceType, string> = {
  light: "Light Clean",
  standard: "Standard Clean",
  deep: "Deep Clean",
  move_in_out: "Move-in / Move-out",
  recurring: "Recurring Clean",
  post_construction: "Post-Construction Clean",
  vacation_rental: "Vacation Rental Turnover",
};

export const LARGE_HOME_SURCHARGE = 50;
export const LARGE_HOME_THRESHOLD = 2000;
export const SERVICE_FEE_RATE = 0.1;
export const TAX_RATE = 0.0825;

export const ADD_ONS: AddOn[] = [
  { id: "inside_fridge",         key: "inside_fridge",         name: "Inside Fridge",          price: 29, createdAt: "", updatedAt: "" },
  { id: "inside_oven",           key: "inside_oven",           name: "Inside Oven",             price: 34, createdAt: "", updatedAt: "" },
  { id: "interior_windows",      key: "interior_windows",      name: "Interior Windows",        price: 39, createdAt: "", updatedAt: "" },
  { id: "inside_cabinets",       key: "inside_cabinets",       name: "Inside Cabinets",         price: 49, createdAt: "", updatedAt: "" },
  { id: "laundry",               key: "laundry",               name: "Laundry",                 price: 24, createdAt: "", updatedAt: "" },
  { id: "dishes",                key: "dishes",                name: "Dishes",                  price: 24, createdAt: "", updatedAt: "" },
  { id: "garage_sweep",          key: "garage_sweep",          name: "Garage Sweep",            price: 29, createdAt: "", updatedAt: "" },
  { id: "patio_sweep",           key: "patio_sweep",           name: "Patio Sweep",             price: 24, createdAt: "", updatedAt: "" },
  { id: "baseboards",            key: "baseboards",            name: "Baseboards",              price: 39, createdAt: "", updatedAt: "" },
  { id: "walls_spot_cleaning",   key: "walls_spot_cleaning",   name: "Wall Spot Cleaning",      price: 34, createdAt: "", updatedAt: "" },
  { id: "pet_hair_detail",       key: "pet_hair_detail",       name: "Pet Hair Detail",         price: 39, createdAt: "", updatedAt: "" },
  { id: "extra_bathroom_detail", key: "extra_bathroom_detail", name: "Extra Bathroom Detail",   price: 24, createdAt: "", updatedAt: "" },
  { id: "organization_light",    key: "organization_light",    name: "Light Organization",      price: 49, createdAt: "", updatedAt: "" },
];

export function getAddOn(key: string): AddOn | undefined {
  return ADD_ONS.find((a) => a.key === key);
}

export interface QuoteInput {
  serviceType: ServiceType;
  home: HomeDetails;
  addOnKeys: string[];
  hasPets?: boolean;
  heavySoil?: boolean;
  lotsOfClutter?: boolean;
  smokerHome?: boolean;
  isEmergency?: boolean; // same/next-day booking — adds a rush surcharge
}

export const EMERGENCY_SURCHARGE_RATE = 0.15;

export function calculateQuote(input: QuoteInput): Quote {
  const { serviceType, home, addOnKeys } = input;
  const basePrice = SWEEPR_BASE[serviceType] ?? SWEEPR_BASE.standard ?? 109;

  const lineItems: Array<{ label: string; amount: number }> = [
    { label: "Base price", amount: basePrice },
  ];

  // Sqft charge (per-service-type)
  const includedSqft = SWEEPR_SQFT_INCLUDED[serviceType] ?? 900;
  const sqftRate = SWEEPR_SQFT_RATE[serviceType] ?? 0.06;
  const sqftCharge = Math.round(Math.max(0, (home.sqft ?? 0) - includedSqft) * sqftRate * 100) / 100;
  if (sqftCharge > 0) lineItems.push({ label: "Square footage", amount: sqftCharge });

  // Bedroom charge (per-service-type, first bedroom included)
  const bedroomRate = SWEEPR_BEDROOM_RATE[serviceType] ?? 18;
  const extraBedrooms = Math.max(0, (home.bedrooms ?? 1) - 1);
  const bedroomCharge = extraBedrooms * bedroomRate;
  if (bedroomCharge > 0) lineItems.push({ label: `Bedrooms (+${extraBedrooms} × $${bedroomRate})`, amount: bedroomCharge });

  // Bathroom charge (per-service-type, first bathroom included)
  const bathroomRate = SWEEPR_BATHROOM_RATE[serviceType] ?? 28;
  const extraBathrooms = Math.max(0, (home.bathrooms ?? 1) - 1);
  const bathroomCharge = extraBathrooms * bathroomRate;
  if (bathroomCharge > 0) lineItems.push({ label: `Bathrooms (+${extraBathrooms} × $${bathroomRate})`, amount: bathroomCharge });

  // Add-ons
  let addOnTotal = 0;
  for (const key of addOnKeys) {
    const addOn = getAddOn(key);
    if (addOn) {
      addOnTotal += addOn.price;
      lineItems.push({ label: addOn.name, amount: addOn.price });
    }
  }

  let subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);

  // Property type multiplier
  const propMult = SWEEPR_PROPERTY_MULTIPLIER[home.homeType as HomeType] ?? 1.1;
  subtotal *= propMult;

  // Condition multipliers
  if (input.hasPets)       subtotal *= 1.08;
  if (input.heavySoil)     subtotal *= 1.20;
  if (input.lotsOfClutter) subtotal *= 1.15;
  if (input.smokerHome)    subtotal *= 1.18;

  // Rush surcharge for same/next-day bookings.
  let rushFee = 0;
  if (input.isEmergency) {
    rushFee = Math.round(subtotal * EMERGENCY_SURCHARGE_RATE * 100) / 100;
    subtotal += rushFee;
    lineItems.push({ label: "Rush fee", amount: rushFee });
  }

  // Stripe gross-up (baked into customer price)
  const grossed = sweeprGrossUp(subtotal);

  // Charm pricing (round to next X9 dollars)
  const total = roundToNextNine(grossed);
  const serviceFee = Math.round((total - subtotal) * 100) / 100; // gross-up + rounding delta

  return {
    serviceType,
    basePrice,
    lineItems,
    addOnTotal,
    subtotal: Math.round(subtotal * 100) / 100,
    serviceFee,
    tax: 0, // tax requires address — calculated at checkout
    total,
  };
}
