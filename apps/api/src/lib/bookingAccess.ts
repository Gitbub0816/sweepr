import type { Sql } from "./db";

export type AccessRole = "customer" | "cleaner" | "admin";

export interface AccessResult {
  allowed: boolean;
  role?: AccessRole;
  reason?: string;
  userId?: string;
}

/**
 * Verifies that the caller (identified by clerkId) is authorised to access
 * a given booking. Admins always pass; customers and cleaners must own/be
 * assigned to the booking.
 */
export async function assertBookingAccess(
  sql: Sql,
  bookingId: string,
  clerkId: string
): Promise<AccessResult> {
  const users = await sql`
    SELECT id, role FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  ` as Array<{ id: string; role: string }>;

  const user = users[0];
  if (!user) return { allowed: false, reason: "User not found" };

  if (user.role === "admin" || user.role === "super_admin") {
    return { allowed: true, role: "admin", userId: user.id };
  }

  const rows = await sql`
    SELECT
      b.id,
      cust.user_id  AS customer_user_id,
      cl.user_id    AS cleaner_user_id
    FROM bookings b
    LEFT JOIN customers cust ON cust.id = b.customer_id
    LEFT JOIN cleaners  cl   ON cl.id   = b.cleaner_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  ` as Array<{ id: string; customer_user_id: string | null; cleaner_user_id: string | null }>;

  const booking = rows[0];
  if (!booking) return { allowed: false, reason: "Booking not found" };

  const isCustomer = booking.customer_user_id === user.id;
  const isCleaner  = booking.cleaner_user_id  === user.id;

  if (!isCustomer && !isCleaner) {
    return { allowed: false, reason: "Forbidden" };
  }

  return {
    allowed: true,
    role: isCustomer ? "customer" : "cleaner",
    userId: user.id,
  };
}
