/**
 * Booking authorization helpers.
 * Centralizes ownership and state checks so routes don't duplicate auth logic.
 */

import type { Sql } from "./db";

interface BookingAuthCtx {
  bookingId: string;
  isAdmin: boolean;
  isCleaner: boolean;
  isCustomer: boolean;
  bookingStatus: string;
  dayStatus: string | null;
  arrivalVerifiedAt: string | null;
}

export async function getBookingAuthCtx(
  sql: Sql,
  bookingId: string,
  clerkId: string
): Promise<BookingAuthCtx | null> {
  const rows = (await sql`
    SELECT b.id, b.status, b.day_status, b.arrival_verified_at,
           u.role,
           cust.user_id AS customer_user_id,
           u_cl.id AS cleaner_user_id
    FROM bookings b
    LEFT JOIN customers cust ON cust.id = b.customer_id
    LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
    LEFT JOIN users u_cl ON u_cl.id = cl.user_id
    JOIN users u ON u.clerk_id = ${clerkId}
    WHERE b.id = ${bookingId}
    LIMIT 1
  `) as Array<{
    id: string;
    status: string;
    day_status: string | null;
    arrival_verified_at: string | null;
    role: string;
    customer_user_id: string | null;
    cleaner_user_id: string | null;
  }>;

  const row = rows[0];
  if (!row) return null;

  const callerRows = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as Array<{ id: string }>;
  const callerId = callerRows[0]?.id;

  return {
    bookingId,
    isAdmin: row.role === "admin" || row.role === "super_admin",
    isCleaner: !!callerId && callerId === row.cleaner_user_id,
    isCustomer: !!callerId && callerId === row.customer_user_id,
    bookingStatus: row.status,
    dayStatus: row.day_status,
    arrivalVerifiedAt: row.arrival_verified_at,
  };
}

export function canViewBooking(ctx: BookingAuthCtx): boolean {
  return ctx.isAdmin || ctx.isCleaner || ctx.isCustomer;
}

export function canModifyBooking(ctx: BookingAuthCtx): boolean {
  return ctx.isAdmin || ctx.isCleaner || ctx.isCustomer;
}

export function canUploadPhotos(ctx: BookingAuthCtx): boolean {
  if (ctx.isAdmin) return true;
  if (!ctx.isCleaner && !ctx.isCustomer) return false;
  // Photos only during active job states
  const activeStates = ["in_progress", "awaiting_checkout", "arrived", "en_route"];
  return activeStates.includes(ctx.dayStatus ?? "");
}

export function canViewAccessCodes(ctx: BookingAuthCtx): boolean {
  if (ctx.isAdmin) return true;
  // Cleaner can only view codes after GPS arrival verified and job started
  if (ctx.isCleaner) {
    return !!ctx.arrivalVerifiedAt && ctx.dayStatus === "in_progress";
  }
  // Customer can always view their own codes
  return ctx.isCustomer;
}
