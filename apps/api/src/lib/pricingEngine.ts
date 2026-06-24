/**
 * Server-side booking price calculator.
 * Clients must NEVER submit price fields — the server always calculates.
 */

export interface BookingPriceInput {
  serviceType: "standard" | "deep" | "move_in_out" | "recurring";
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  homeType: string;
  hasPets: boolean;
  heavyMess: boolean;
  suppliesNeeded: boolean;
  addOnKeys: string[];
}

export interface BookingPriceBreakdown {
  basePrice: number;      // cents
  bedroomFee: number;
  bathroomFee: number;
  sqftFee: number;
  petFee: number;
  heavyMessFee: number;
  suppliesFee: number;
  addonsTotal: number;
  subtotal: number;
  serviceFee: number;     // platform service fee to customer
  tax: number;
  totalPrice: number;
}

const BASE: Record<string, number> = {
  standard:    9900,
  deep:        14900,
  move_in_out: 19900,
  recurring:   8900,
};

const ADD_ON_PRICES: Record<string, number> = {
  inside_fridge:       2500,
  inside_oven:         2000,
  inside_cabinets:     3000,
  laundry:             1500,
  window_interior:     2000,
  garage:              3500,
  basement:            3500,
  wall_washing:        4000,
  balcony:             1500,
};

export function calculateBookingPrice(
  input: BookingPriceInput
): BookingPriceBreakdown {
  const basePrice = BASE[input.serviceType] ?? 9900;

  const bedroomFee  = input.bedrooms  * 1000;
  const bathroomFee = input.bathrooms * 1500;
  const sqftFee     = Math.max(0, input.sqft - 1000) * 8;
  const petFee      = input.hasPets        ? 1500 : 0;
  const heavyMessFee = input.heavyMess     ? 3000 : 0;
  const suppliesFee = input.suppliesNeeded ? 1000 : 0;

  const addonsTotal = input.addOnKeys.reduce(
    (sum, key) => sum + (ADD_ON_PRICES[key] ?? 0),
    0
  );

  const subtotal = basePrice + bedroomFee + bathroomFee + sqftFee +
    petFee + heavyMessFee + suppliesFee + addonsTotal;

  const serviceFee = Math.round(subtotal * 0.08);
  const tax = 0; // Tax calculation requires address — extend when service areas go live
  const totalPrice = subtotal + serviceFee + tax;

  return {
    basePrice,
    bedroomFee,
    bathroomFee,
    sqftFee,
    petFee,
    heavyMessFee,
    suppliesFee,
    addonsTotal,
    subtotal,
    serviceFee,
    tax,
    totalPrice,
  };
}

/** Returns the add-on price catalogue for the frontend quote UI. */
export function getAddOnCatalogue(): Record<string, { label: string; priceCents: number }> {
  return {
    inside_fridge:    { label: "Inside fridge",    priceCents: 2500 },
    inside_oven:      { label: "Inside oven",      priceCents: 2000 },
    inside_cabinets:  { label: "Inside cabinets",  priceCents: 3000 },
    laundry:          { label: "Laundry",          priceCents: 1500 },
    window_interior:  { label: "Windows (interior)", priceCents: 2000 },
    garage:           { label: "Garage",           priceCents: 3500 },
    basement:         { label: "Basement",         priceCents: 3500 },
    wall_washing:     { label: "Wall washing",     priceCents: 4000 },
    balcony:          { label: "Balcony",          priceCents: 1500 },
  };
}
