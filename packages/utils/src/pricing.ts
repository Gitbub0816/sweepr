import type {
  AddOn,
  HomeDetails,
  Quote,
  ServiceType,
} from "@sweepr/types";

export const BASE_PRICES: Record<ServiceType, number> = {
  standard: 89,
  deep: 149,
  move_in_out: 199,
  recurring: 79,
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  standard: "Standard Clean",
  deep: "Deep Clean",
  move_in_out: "Move-in / Move-out",
  recurring: "Recurring Clean",
};

export const PER_BEDROOM = 25;
export const PER_BATHROOM = 20;
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
