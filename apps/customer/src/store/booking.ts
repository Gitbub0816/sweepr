import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Address,
  Booking,
  CleaningLevel,
  HomeCleaningIntent,
  HomeDetails,
  RecurringCadence,
  RoomConditionLevel,
  RoomConditionSelection,
  RoomType,
  ServiceType,
} from "@sweepr/types";
import {
  calculateQuote,
  isAddOnIncludedInPackage,
  type QuoteInput,
} from "@sweepr/utils";

export interface BookingState {
  address: Address | null;
  /** Booking entry choice: normal home vs short-term rental turnaround. */
  intent: HomeCleaningIntent | null;
  home: HomeDetails;
  serviceType: ServiceType | null;
  /** Per-room worst-condition selections (Clean My Home flow). */
  rooms: RoomConditionSelection[];
  /** Customer-declared cleaning level (scope review). Required before Review. */
  cleaningLevel: CleaningLevel | null;
  addOnKeys: string[];
  cadence: RecurringCadence;
  scheduledFor: string | null;
  scheduledAt: string | null;
  timeWindow: "morning" | "afternoon" | "evening" | null;
  /** Selected 2-hour arrival window, e.g. "08:00" / "10:00". Replaces exact-time scheduling. */
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  isSubscription: boolean;
  subscriptionCadence: "weekly" | "biweekly" | "monthly" | null;
  isEmergency: boolean;
  notes: string;
  paymentConfirmed: boolean;
  isRebook: boolean;
  rebookedFromDate: string | null;
  /** DB booking ID after the booking is created in the API. */
  bookingId: string | null;
  /** ISO timestamp of last meaningful draft change; used to expire drafts after 48 h. */
  draftSavedAt: string | null;

  setAddress: (address: Address) => void;
  setIntent: (intent: HomeCleaningIntent) => void;
  setRoomCondition: (roomType: RoomType, level: RoomConditionLevel) => void;
  setTimeWindow: (window: "morning" | "afternoon" | "evening" | null) => void;
  setArrivalWindow: (window: { start: string; end: string } | null) => void;
  setSubscription: (
    isSubscription: boolean,
    cadence?: "weekly" | "biweekly" | "monthly" | null
  ) => void;
  setEmergency: (isEmergency: boolean) => void;
  rebookFrom: (previousBooking: Booking) => void;
  setHome: (home: Partial<HomeDetails>) => void;
  setService: (service: ServiceType) => void;
  setCleaningLevel: (level: CleaningLevel) => void;
  toggleAddOn: (key: string) => void;
  setCadence: (cadence: RecurringCadence) => void;
  setSchedule: (iso: string) => void;
  clearSchedule: () => void;
  setNotes: (notes: string) => void;
  setBookingId: (id: string) => void;
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
  intent: null,
  home: defaultHome,
  serviceType: null,
  rooms: [],
  cleaningLevel: null,
  addOnKeys: [],
  cadence: "none",
  scheduledFor: null,
  scheduledAt: null,
  timeWindow: null,
  arrivalWindowStart: null,
  arrivalWindowEnd: null,
  isSubscription: false,
  subscriptionCadence: null,
  isEmergency: false,
  notes: "",
  paymentConfirmed: false,
  isRebook: false,
  rebookedFromDate: null,
  bookingId: null,
  draftSavedAt: null,

  setAddress: (address) => set({ address, draftSavedAt: new Date().toISOString() }),
  setIntent: (intent) =>
    set({
      intent,
      // The room-condition flow drives pricing itself; anchor serviceType to
      // standard so downstream steps (schedule/review/booking) keep working.
      serviceType: intent === "home" ? "standard" : null,
      draftSavedAt: new Date().toISOString(),
    }),
  setRoomCondition: (roomType, level) =>
    set((s) => ({
      rooms: [
        ...s.rooms.filter((r) => r.roomType !== roomType),
        { roomType, level },
      ],
      draftSavedAt: new Date().toISOString(),
    })),
  setTimeWindow: (timeWindow) => set({ timeWindow }),
  setArrivalWindow: (window) =>
    set({
      arrivalWindowStart: window?.start ?? null,
      arrivalWindowEnd: window?.end ?? null,
      draftSavedAt: new Date().toISOString(),
    }),
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
      cleaningLevel: null,
      addOnKeys: [...prev.addOnKeys],
      cadence: prev.cadence,
      scheduledFor: null,
      arrivalWindowStart: null,
      arrivalWindowEnd: null,
      notes: prev.notes ?? "",
      paymentConfirmed: false,
      isRebook: true,
      rebookedFromDate: prev.scheduledFor,
    }),
  setHome: (home) => set((s) => ({ home: { ...s.home, ...home }, draftSavedAt: new Date().toISOString() })),
  setService: (serviceType) =>
    set((s) => ({
      serviceType,
      // Auto-prune any add-ons that are already included in the newly selected
      // package's scope (they'd be redundant / rejected by the server).
      addOnKeys: s.addOnKeys.filter(
        (k) => !isAddOnIncludedInPackage(k, serviceType),
      ),
      draftSavedAt: new Date().toISOString(),
    })),
  setCleaningLevel: (cleaningLevel) =>
    set({ cleaningLevel, draftSavedAt: new Date().toISOString() }),
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
  clearSchedule: () =>
    set({
      scheduledFor: null,
      scheduledAt: null,
      arrivalWindowStart: null,
      arrivalWindowEnd: null,
      isEmergency: false,
    }),
  setNotes: (notes) => set({ notes }),
  setBookingId: (bookingId) => set({ bookingId, draftSavedAt: null }),
  confirmPayment: () => set({ paymentConfirmed: true }),
  reset: () =>
    set({
      address: null,
      intent: null,
      home: defaultHome,
      serviceType: null,
      rooms: [],
      cleaningLevel: null,
      addOnKeys: [],
      cadence: "none",
      scheduledFor: null,
      scheduledAt: null,
      timeWindow: null,
      arrivalWindowStart: null,
      arrivalWindowEnd: null,
      isSubscription: false,
      subscriptionCadence: null,
      isEmergency: false,
      notes: "",
      paymentConfirmed: false,
      isRebook: false,
      rebookedFromDate: null,
      bookingId: null,
      draftSavedAt: null,
    }),

  getQuote: () => {
    const { serviceType, home, addOnKeys, isEmergency, cleaningLevel } = get();
    if (!serviceType) return null;
    const input: QuoteInput = {
      serviceType,
      home,
      addOnKeys,
      isEmergency,
      cleaningLevel: cleaningLevel ?? undefined,
    };
    return calculateQuote(input);
  },
    }),
    {
      name: "sweepr-booking",
      // getQuote is derived; don't persist the function or transient flags.
      partialize: (s) => ({
        address: s.address,
        intent: s.intent,
        home: s.home,
        serviceType: s.serviceType,
        rooms: s.rooms,
        cleaningLevel: s.cleaningLevel,
        addOnKeys: s.addOnKeys,
        cadence: s.cadence,
        scheduledFor: s.scheduledFor,
        scheduledAt: s.scheduledAt,
        timeWindow: s.timeWindow,
        arrivalWindowStart: s.arrivalWindowStart,
        arrivalWindowEnd: s.arrivalWindowEnd,
        isSubscription: s.isSubscription,
        subscriptionCadence: s.subscriptionCadence,
        isEmergency: s.isEmergency,
        notes: s.notes,
        draftSavedAt: s.draftSavedAt,
      }),
    }
  )
);
