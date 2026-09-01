/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Real bookings data layer — fetches the signed-in customer's bookings from the
 * API and adapts DB rows to the app's Booking shape. No hardcoded/mock data.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import type { Booking, JobStatus, ServiceType, HomeType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface BookingRow {
  id: string;
  status: string;
  service_type: string;
  cleaner_id: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  home_type: string | null;
  has_pets: boolean;
  scheduled_at: string | null;
  base_price: number | null;
  addons_total: number;
  service_fee: number;
  tax: number;
  total_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  // optional joined address fields (present on detail endpoint)
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  // add-ons currently on the booking (present on detail endpoint)
  addon_keys?: string[];
}

/** Adapt a DB booking row to the app's Booking type. */
export function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    customerId: "",
    cleanerId: r.cleaner_id ?? undefined,
    status: (r.status as JobStatus) ?? "booked",
    serviceType: (r.service_type as ServiceType) ?? "standard",
    home: {
      bedrooms: r.bedrooms ?? 0,
      bathrooms: r.bathrooms ?? 0,
      sqft: r.sqft ?? 0,
      homeType: (r.home_type as HomeType) ?? "apartment",
      pets: !!r.has_pets,
    },
    address: {
      id: "",
      line1: r.address_line1 ?? "",
      city: r.address_city ?? "",
      state: r.address_state ?? "",
      zip: r.address_zip ?? "",
    },
    addOnKeys: r.addon_keys ?? [],
    cadence: "none",
    scheduledFor: r.scheduled_at ?? r.created_at,
    quote: {
      serviceType: (r.service_type as ServiceType) ?? "standard",
      basePrice: (r.base_price ?? 0) / 100,
      lineItems: [],
      addOnTotal: (r.addons_total ?? 0) / 100,
      subtotal: ((r.base_price ?? 0) + (r.addons_total ?? 0)) / 100,
      serviceFee: (r.service_fee ?? 0) / 100,
      tax: (r.tax ?? 0) / 100,
      total: (r.total_price ?? 0) / 100,
    },
    notes: r.notes ?? undefined,
    completedAt: r.completed_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Fetch the current customer's bookings. */
export function useBookings() {
  const { isSignedIn } = useAuth();
  const { getToken } = useAppToken();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!API_URL || !isSignedIn) { setBookings([]); setLoading(false); return; }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { bookings: BookingRow[] };
      setBookings((data.bookings ?? []).map(toBooking));
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => { load(); }, [load]);
  return { bookings, loading, reload: load };
}

/**
 * Assigned-cleaner identity as disclosed to the customer. Only present within
 * 24h of the cleaning (server-gated); "First L." only — never a full last name.
 */
export interface RevealedCleaner {
  displayName: string;
  foundingMember: boolean;
  foundingMemberId: number | null;
}

/** A booking with the (optionally) revealed cleaner identity attached. */
export type BookingWithCleaner = Booking & {
  revealedCleaner?: RevealedCleaner | null;
  /** Stamped by Pricing v2's deep-clean auto-classification at creation. */
  deepCleanApplied?: boolean;
};

/**
 * A crew seat as exposed to the customer by GET /bookings/:id/crew. Only seat
 * shape + role/status + the (nullable) cleaner id are returned; the endpoint
 * does NOT include a member's customer-safe name/rating/cleans count today
 * (see fetchCrew note). Solo bookings return an empty or single-LEAD roster.
 */
export interface CrewSeatView {
  id: string;
  cleanerId: string | null;
  role: "LEAD" | "MEMBER";
  seatIndex: number;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface BookingCrew {
  crewStatus: string | null;
  requiredCrewSize: number | null;
  targetCrewSize: number | null;
  extraCleanerRequested: boolean;
  seats: CrewSeatView[];
}

/** Seat statuses that mean a real, authorized person holds the seat. */
const ASSIGNED_SEAT_STATUSES = new Set(["ACCEPTED", "COMPLETED"]);

/** True when this booking is staffed as a team (more than one seat). */
export function isTeamBooking(crew: BookingCrew | null): boolean {
  if (!crew) return false;
  const target = crew.targetCrewSize ?? crew.requiredCrewSize ?? 0;
  return target > 1 || crew.seats.some((s) => s.role === "MEMBER");
}

/** The seats to display to the customer: only authorized (assigned) people. */
export function assignedSeats(crew: BookingCrew | null): CrewSeatView[] {
  if (!crew) return [];
  return crew.seats
    .filter((s) => s.cleanerId != null && ASSIGNED_SEAT_STATUSES.has(s.status))
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/**
 * Fetch the crew roster for a booking. Returns null for solo bookings, when
 * Team Cleans is disabled, or on any error, so callers fall back to the
 * single-cleaner experience unchanged.
 *
 * NOTE (backend follow-up): this endpoint returns only cleaner ids for member
 * seats, never a customer-safe name/rating/cleans count. The LEAD's "First L."
 * identity still comes from GET /bookings/:id (revealedCleaner). Member
 * identities are shown as "Verified Sweepr cleaner" until a customer-safe crew
 * reveal is added server-side.
 */
export async function fetchCrew(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<BookingCrew | null> {
  if (!API_URL) return null;
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/bookings/${id}/crew`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      booking?: {
        crewStatus?: string | null;
        requiredCrewSize?: number | null;
        targetCrewSize?: number | null;
        extraCleanerRequested?: boolean | null;
      };
      seats?: Array<{
        id: string;
        cleanerId: string | null;
        role: "LEAD" | "MEMBER";
        seatIndex: number;
        status: string;
        checkInAt: string | null;
        checkOutAt: string | null;
      }>;
    };
    return {
      crewStatus: data.booking?.crewStatus ?? null,
      requiredCrewSize: data.booking?.requiredCrewSize ?? null,
      targetCrewSize: data.booking?.targetCrewSize ?? null,
      extraCleanerRequested: Boolean(data.booking?.extraCleanerRequested),
      seats: (data.seats ?? []).map((s) => ({
        id: s.id,
        cleanerId: s.cleanerId,
        role: s.role,
        seatIndex: s.seatIndex,
        status: s.status,
        checkInAt: s.checkInAt,
        checkOutAt: s.checkOutAt,
      })),
    };
  } catch {
    return null;
  }
}

/** Fetch a single booking by id. */
export async function fetchBooking(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<BookingWithCleaner | null> {
  if (!API_URL) return null;
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      booking: BookingRow & { deep_clean_applied?: boolean };
      cleaner?: RevealedCleaner | null;
    };
    if (!data.booking) return null;
    const booking = toBooking(data.booking) as BookingWithCleaner;
    booking.revealedCleaner = data.cleaner ?? null;
    booking.deepCleanApplied = data.booking.deep_clean_applied === true;
    return booking;
  } catch {
    return null;
  }
}
