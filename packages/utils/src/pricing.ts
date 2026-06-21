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
  standard: 1.0,
  deep: 1.6,
  move_in_out: 1.8,
  recurring: 0.9, // discount for recurring
  post_construction: 2.0,
  vacation_rental: 1.3,
};

const BASE_FEES: Record<HomeType, number> = {
  studio: 65,
  apartment: 75,
  condo: 80,
  townhouse: 85,
  house: 90,
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
// Legacy quote helpers (still used by the existing booking funnel + admin).
// ---------------------------------------------------------------------------

export const BASE_PRICES: Record<ServiceType, number> = {
  standard: 89,
  deep: 149,
  move_in_out: 199,
  recurring: 79,
  post_construction: 249,
  vacation_rental: 129,
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
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
  { id: "fridge", key: "fridge", name: "Inside Fridge", price: 35, createdAt: "", updatedAt: "" },
  { id: "oven", key: "oven", name: "Inside Oven", price: 25, createdAt: "", updatedAt: "" },
  { id: "windows", key: "windows", name: "Interior Windows", price: 45, createdAt: "", updatedAt: "" },
  { id: "cabinets", key: "cabinets", name: "Inside Cabinets", price: 30, createdAt: "", updatedAt: "" },
  { id: "laundry", key: "laundry", name: "Laundry", price: 25, createdAt: "", updatedAt: "" },
  { id: "dishes", key: "dishes", name: "Dishes", price: 20, createdAt: "", updatedAt: "" },
  { id: "baseboards", key: "baseboards", name: "Baseboards", price: 20, createdAt: "", updatedAt: "" },
  { id: "pet_hair", key: "pet_hair", name: "Pet Hair Treatment", price: 30, createdAt: "", updatedAt: "" },
  { id: "extra_bathroom", key: "extra_bathroom", name: "Extra Bathroom", price: 20, createdAt: "", updatedAt: "" },
  { id: "extra_bedroom", key: "extra_bedroom", name: "Extra Bedroom", price: 25, createdAt: "", updatedAt: "" },
];

export function getAddOn(key: string): AddOn | undefined {
  return ADD_ONS.find((a) => a.key === key);
}

export interface QuoteInput {
  serviceType: ServiceType;
  home: HomeDetails;
  addOnKeys: string[];
}

export function calculateQuote(input: QuoteInput): Quote {
  const { serviceType, home, addOnKeys } = input;
  const basePrice = BASE_PRICES[serviceType];

  const lineItems = [{ label: "Base price", amount: basePrice }];

  const bedroomCharge = home.bedrooms * PER_BEDROOM;
  if (bedroomCharge > 0) {
    lineItems.push({
      label: `Bedrooms (${home.bedrooms} × $${PER_BEDROOM})`,
      amount: bedroomCharge,
    });
  }

  const bathroomCharge = home.bathrooms * PER_BATHROOM;
  if (bathroomCharge > 0) {
    lineItems.push({
      label: `Bathrooms (${home.bathrooms} × $${PER_BATHROOM})`,
      amount: bathroomCharge,
    });
  }

  if (home.sqft > LARGE_HOME_THRESHOLD) {
    lineItems.push({
      label: `Large home (>${LARGE_HOME_THRESHOLD} sqft)`,
      amount: LARGE_HOME_SURCHARGE,
    });
  }

  let addOnTotal = 0;
  for (const key of addOnKeys) {
    const addOn = getAddOn(key);
    if (addOn) {
      addOnTotal += addOn.price;
      lineItems.push({ label: addOn.name, amount: addOn.price });
    }
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE * 100) / 100;
  const tax = Math.round((subtotal + serviceFee) * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + serviceFee + tax) * 100) / 100;

  return {
    serviceType,
    basePrice,
    lineItems,
    addOnTotal,
    subtotal,
    serviceFee,
    tax,
    total,
  };
}
