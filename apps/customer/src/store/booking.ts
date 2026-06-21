import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Address,
  Booking,
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
  scheduledAt: string | null;
  timeWindow: "morning" | "afternoon" | "evening" | null;
  isSubscription: boolean;
  subscriptionCadence: "weekly" | "biweekly" | "monthly" | null;
  isEmergency: boolean;
  notes: string;
  paymentConfirmed: boolean;
  isRebook: boolean;
  rebookedFromDate: string | null;

  setAddress: (address: Address) => void;
  setTimeWindow: (window: "morning" | "afternoon" | "evening" | null) => void;
  setSubscription: (
    isSubscription: boolean,
    cadence?: "weekly" | "biweekly" | "monthly" | null
  ) => void;
  setEmergency: (isEmergency: boolean) => void;
  rebookFrom: (previousBooking: Booking) => void;
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
  scheduledAt: null,
  timeWindow: null,
  isSubscription: false,
  subscriptionCadence: null,
  isEmergency: false,
  notes: "",
  paymentConfirmed: false,
  isRebook: false,
  rebookedFromDate: null,

  setAddress: (address) => set({ address }),
  setTimeWindow: (timeWindow) => set({ timeWindow }),
  setSubscription: (isSubscription, cadence = null) =>
    set({
      isSubscription,
      subscriptionCadence: isSubscription ? cadence ?? "weekly" : null,
    }),
  setEmergency: (isEmergency) => set({ isEmergency }),
  rebookFrom: (prev) =>
    set({
      address: prev.address,
      home: prev.home,
      serviceType: prev.serviceType,
      addOnKeys: [...prev.addOnKeys],
      cadence: prev.cadence,
      scheduledFor: null,
      notes: prev.notes ?? "",
      paymentConfirmed: false,
      isRebook: true,
      rebookedFromDate: prev.scheduledFor,
    }),
  setHome: (home) => set((s) => ({ home: { ...s.home, ...home } })),
  setService: (serviceType) => set({ serviceType }),
  toggleAddOn: (key) =>
    set((s) => ({
      addOnKeys: s.addOnKeys.includes(key)
        ? s.addOnKeys.filter((k) => k !== key)
        : [...s.addOnKeys, key],
    })),
  setCadence: (cadence) => set({ cadence }),
  setSchedule: (scheduledFor) => {
    // Emergency = same or next day booking.
    const target = new Date(scheduledFor);
    const now = new Date();
    const days = Math.floor(
      (target.setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) /
        86_400_000
    );
    set({
      scheduledFor,
      scheduledAt: scheduledFor,
      isEmergency: days <= 1,
    });
  },
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
      scheduledAt: null,
      timeWindow: null,
      isSubscription: false,
      subscriptionCadence: null,
      isEmergency: false,
      notes: "",
      paymentConfirmed: false,
      isRebook: false,
      rebookedFromDate: null,
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
        scheduledAt: s.scheduledAt,
        timeWindow: s.timeWindow,
        isSubscription: s.isSubscription,
        subscriptionCadence: s.subscriptionCadence,
        isEmergency: s.isEmergency,
        notes: s.notes,
      }),
    }
  )
);
