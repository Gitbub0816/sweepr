import type { Booking, PaymentMethod } from "@sweepr/types";
import { calculateQuote } from "@sweepr/utils";

const addr = {
  id: "addr_1",
  line1: "1240 Seaview Ave",
  city: "San Diego",
  state: "CA",
  zip: "92101",
};

export const mockBookings: Booking[] = [
  {
    id: "bk_1001",
    customerId: "cust_1",
    cleanerId: "cl_4",
    status: "confirmed",
    serviceType: "standard",
    home: { bedrooms: 2, bathrooms: 1, sqft: 1100, homeType: "apartment", pets: false },
    address: addr,
    addOnKeys: ["fridge"],
    cadence: "none",
    scheduledFor: new Date(Date.now() + 86400000 * 2).toISOString(),
    quote: calculateQuote({
      serviceType: "standard",
      home: { bedrooms: 2, bathrooms: 1, sqft: 1100, homeType: "apartment", pets: false },
      addOnKeys: ["fridge"],
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "bk_1000",
    customerId: "cust_1",
    cleanerId: "cl_2",
    status: "completed",
    serviceType: "deep",
    home: { bedrooms: 3, bathrooms: 2, sqft: 1800, homeType: "house", pets: true },
    address: addr,
    addOnKeys: ["oven", "windows"],
    cadence: "none",
    scheduledFor: new Date(Date.now() - 86400000 * 9).toISOString(),
    quote: calculateQuote({
      serviceType: "deep",
      home: { bedrooms: 3, bathrooms: 2, sqft: 1800, homeType: "house", pets: true },
      addOnKeys: ["oven", "windows"],
    }),
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 9).toISOString(),
  },
];

export const mockPaymentMethods: PaymentMethod[] = [
  {
    id: "pm_1",
    customerId: "cust_1",
    brand: "Visa",
    last4: "4242",
    expMonth: 8,
    expYear: 2027,
    isDefault: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "pm_2",
    customerId: "cust_1",
    brand: "Mastercard",
    last4: "5555",
    expMonth: 3,
    expYear: 2026,
    isDefault: false,
    createdAt: "",
    updatedAt: "",
  },
];

export const ADDRESS_SUGGESTIONS = [
  { line1: "1240 Seaview Ave", city: "San Diego", state: "CA", zip: "92101" },
  { line1: "55 Market Street", city: "San Francisco", state: "CA", zip: "94105" },
  { line1: "800 Sunset Blvd", city: "Los Angeles", state: "CA", zip: "90012" },
  { line1: "210 Park Lane", city: "Austin", state: "TX", zip: "78701" },
];
