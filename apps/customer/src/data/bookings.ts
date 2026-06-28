/**
 * Real bookings data layer — fetches the signed-in customer's bookings from the
 * API and adapts DB rows to the app's Booking shape. No hardcoded/mock data.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { Booking, JobStatus, ServiceType, HomeType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface BookingRow {
  id: string;
  status: string;
  service_type: string;
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
  // optional joined address fields (present on detail endpoint)
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
}

/** Adapt a DB booking row to the app's Booking type. */
export function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    customerId: "",
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
    addOnKeys: [],
    cadence: "none",
    scheduledFor: r.scheduled_at ?? r.created_at,
    quote: {
      serviceType: (r.service_type as ServiceType) ?? "standard",
      basePrice: (r.base_price ?? 0),
      lineItems: [],
      addOnTotal: r.addons_total ?? 0,
      subtotal: (r.base_price ?? 0) + (r.addons_total ?? 0),
      serviceFee: r.service_fee ?? 0,
      tax: r.tax ?? 0,
      total: r.total_price ?? 0,
    },
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Fetch the current customer's bookings. */
export function useBookings() {
  const { getToken, isSignedIn } = useAuth();
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

/** Fetch a single booking by id. */
export async function fetchBooking(getToken: () => Promise<string | null>, id: string): Promise<Booking | null> {
  if (!API_URL) return null;
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { booking: BookingRow };
    return data.booking ? toBooking(data.booking) : null;
  } catch {
    return null;
  }
}
