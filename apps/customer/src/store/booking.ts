import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Address,
  HomeDetails,
  RecurringCadence,
  ServiceType,
} from "@sweepr/types";
import { calculateQuote, type QuoteInput } from "@sweepr/utils";

export interface BookingState {
  address: Address | null;
  home: HomeDetails;
  serviceType: ServiceType | null;
  addOnKeys: string[];
  cadence: RecurringCadence;
  scheduledFor: string | null;
  notes: string;
  paymentConfirmed: boolean;

  setAddress: (address: Address) => void;
  setHome: (home: Partial<HomeDetails>) => void;
  setService: (service: ServiceType) => void;
  toggleAddOn: (key: string) => void;
  setCadence: (cadence: RecurringCadence) => void;
  setSchedule: (iso: string) => void;
  setNotes: (notes: string) => void;
  confirmPayment: () => void;
  reset: () => void;

  getQuote: () => ReturnType<typeof calculateQuote> | null;
}

const defaultHome: HomeDetails = {
  bedrooms: 2,
  bathrooms: 1,
  sqft: 1200,
  homeType: "apartment",
  pets: false,
};

export const useBookingStore = create<BookingState>()(
  persist(
    (set, get) => ({
  address: null,
  home: defaultHome,
  serviceType: null,
  addOnKeys: [],
  cadence: "none",
  scheduledFor: null,
  notes: "",
  paymentConfirmed: false,

  setAddress: (address) => set({ address }),
  setHome: (home) => set((s) => ({ home: { ...s.home, ...home } })),
  setService: (serviceType) => set({ serviceType }),
  toggleAddOn: (key) =>
    set((s) => ({
      addOnKeys: s.addOnKeys.includes(key)
        ? s.addOnKeys.filter((k) => k !== key)
        : [...s.addOnKeys, key],
    })),
  setCadence: (cadence) => set({ cadence }),
  setSchedule: (scheduledFor) => set({ scheduledFor }),
  setNotes: (notes) => set({ notes }),
  confirmPayment: () => set({ paymentConfirmed: true }),
  reset: () =>
    set({
      address: null,
      home: defaultHome,
      serviceType: null,
      addOnKeys: [],
      cadence: "none",
      scheduledFor: null,
      notes: "",
      paymentConfirmed: false,
    }),

  getQuote: () => {
    const { serviceType, home, addOnKeys } = get();
    if (!serviceType) return null;
    const input: QuoteInput = { serviceType, home, addOnKeys };
    return calculateQuote(input);
  },
    }),
    {
      name: "sweepr-booking",
      // getQuote is derived; don't persist the function or transient flags.
      partialize: (s) => ({
        address: s.address,
        home: s.home,
        serviceType: s.serviceType,
        addOnKeys: s.addOnKeys,
        cadence: s.cadence,
        scheduledFor: s.scheduledFor,
        notes: s.notes,
      }),
    }
  )
);
