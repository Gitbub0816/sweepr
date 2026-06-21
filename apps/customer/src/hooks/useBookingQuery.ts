import { useQuery } from "@tanstack/react-query";

/** Shape of a booking row returned by the API (cents-based amounts). */
export interface BookingRow {
  id: string;
  status: string;
  service_type: string;
  scheduled_at: string | null;
  total_price: number | null;
  created_at: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function fetchBookings(token: string | null): Promise<BookingRow[]> {
  const res = await fetch(`${API_URL}/bookings`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load bookings");
  const data = (await res.json()) as { bookings: BookingRow[] };
  return data.bookings;
}

async function fetchBooking(
  id: string,
  token: string | null
): Promise<BookingRow> {
  const res = await fetch(`${API_URL}/bookings/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load booking");
  const data = (await res.json()) as { booking: BookingRow };
  return data.booking;
}

/** List the current user's bookings. Pass a token getter from Clerk's useAuth. */
export function useBookingsQuery(getToken?: () => Promise<string | null>) {
  return useQuery({
    queryKey: ["bookings"],
    queryFn: async () => fetchBookings(getToken ? await getToken() : null),
  });
}

export function useBookingQuery(
  id: string | undefined,
  getToken?: () => Promise<string | null>
) {
  return useQuery({
    queryKey: ["booking", id],
    enabled: Boolean(id),
    queryFn: async () =>
      fetchBooking(id as string, getToken ? await getToken() : null),
  });
}
