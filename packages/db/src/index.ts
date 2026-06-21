import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export * from "./types";
import type {
  BookingRow,
  CustomerRow,
  UserRow,
  CleanerRow,
} from "./types";

/**
 * Create a Neon SQL client. Pass the connection string (from the worker env).
 * The returned tagged-template function is safe against SQL injection.
 */
export function createClient(connectionString: string): NeonQueryFunction<false, false> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Neon client");
  }
  return neon(connectionString);
}

export type Sql = NeonQueryFunction<false, false>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getUserByClerkId(
  sql: Sql,
  clerkId: string
): Promise<UserRow | null> {
  const rows = (await sql`
    SELECT * FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function upsertUser(
  sql: Sql,
  input: { clerkId: string; email: string; role?: string }
): Promise<UserRow> {
  const rows = (await sql`
    INSERT INTO users (clerk_id, email, role)
    VALUES (${input.clerkId}, ${input.email}, ${input.role ?? "customer"})
    ON CONFLICT (clerk_id) DO UPDATE
      SET email = EXCLUDED.email, updated_at = NOW()
    RETURNING *
  `) as UserRow[];
  return rows[0];
}

export async function getCustomerByUserId(
  sql: Sql,
  userId: string
): Promise<CustomerRow | null> {
  const rows = (await sql`
    SELECT * FROM customers WHERE user_id = ${userId} LIMIT 1
  `) as CustomerRow[];
  return rows[0] ?? null;
}

export async function getCleanerByUserId(
  sql: Sql,
  userId: string
): Promise<CleanerRow | null> {
  const rows = (await sql`
    SELECT * FROM cleaners WHERE user_id = ${userId} LIMIT 1
  `) as CleanerRow[];
  return rows[0] ?? null;
}

export async function listBookingsForCustomer(
  sql: Sql,
  customerId: string
): Promise<BookingRow[]> {
  return (await sql`
    SELECT * FROM bookings
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC
  `) as BookingRow[];
}

export async function getBooking(
  sql: Sql,
  id: string
): Promise<BookingRow | null> {
  const rows = (await sql`
    SELECT * FROM bookings WHERE id = ${id} LIMIT 1
  `) as BookingRow[];
  return rows[0] ?? null;
}

export async function updateBookingStatus(
  sql: Sql,
  id: string,
  status: string
): Promise<BookingRow | null> {
  const rows = (await sql`
    UPDATE bookings SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as BookingRow[];
  return rows[0] ?? null;
}
