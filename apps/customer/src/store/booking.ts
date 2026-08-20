/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

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
  /** One clutter/access state per room type (0 clear · 1 some · 2 obstructed).
   *  Missing key = clear. Feeds Pricing v2 time estimation only. */
  clutter: Partial<Record<RoomType, 0 | 1 | 2>>;
  /** Optional "my rooms vary a lot" correction: exact room counts at each
   *  condition level for a multi-room type. */
  roomCountsByLevel: Partial<Record<RoomType, [number, number, number, number]>>;
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
  setClutter: (roomType: RoomType, state: 0 | 1 | 2) => void;
  setRoomCountsByLevel: (
    roomType: RoomType,
    counts: [number, number, number, number] | null,
  ) => void;
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

/**
 * Emergency = same or next calendar day. Computed from cloned, normalized
 * local dates so we never mutate the caller's Date and so DST transitions
 * (where a naive ms-subtraction is off by an hour) don't shift the day count.
 * Server recomputes this authoritatively from scheduledAt; this is preview-only.
 */
function computeIsEmergency(iso: string | null): boolean {
  if (!iso) return false;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return false;
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round(
    (targetMidnight.getTime() - todayMidnight.getTime()) / 86_400_000,
  );
  return days <= 1;
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
  clutter: {},
  roomCountsByLevel: {},
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
      // Changing the reported maximum invalidates any counts-by-level
      // correction for that type (its ceiling moved).
      roomCountsByLevel: { ...s.roomCountsByLevel, [roomType]: undefined },
      draftSavedAt: new Date().toISOString(),
    })),
  setClutter: (roomType, state) =>
    set((s) => ({
      clutter: { ...s.clutter, [roomType]: state },
      draftSavedAt: new Date().toISOString(),
    })),
  setRoomCountsByLevel: (roomType, counts) =>
    set((s) => ({
      roomCountsByLevel: { ...s.roomCountsByLevel, [roomType]: counts ?? undefined },
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
      intent: "home",
      home: prev.home,
      serviceType: prev.serviceType,
      // Room conditions are per-visit and NOT carried over from a past booking
      // (the Booking type doesn't include them) — the customer must reassess, or
      // we'd price the new clean from stale/unrelated answers.
      rooms: [],
      clutter: {},
      roomCountsByLevel: {},
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
    set({
      scheduledFor,
      scheduledAt: scheduledFor,
      // Emergency = same or next day booking. Recomputed (never mutating the
      // target Date); also re-derived at getQuote time so a rehydrated 48h
      // draft can't carry a stale flag.
      isEmergency: computeIsEmergency(scheduledFor),
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
      clutter: {},
      roomCountsByLevel: {},
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
    const { serviceType, home, addOnKeys, scheduledFor, cleaningLevel } = get();
    if (!serviceType) return null;
    // Recompute emergency from the schedule rather than trusting a persisted
    // flag — a draft rehydrated a day later may no longer be same/next-day.
    const input: QuoteInput = {
      serviceType,
      home,
      addOnKeys,
      isEmergency: computeIsEmergency(scheduledFor),
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
        // Persist the DB booking id so a Stripe off-site redirect (which reloads
        // the app) can still reference the booking on /book/confirmed.
        bookingId: s.bookingId,
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
