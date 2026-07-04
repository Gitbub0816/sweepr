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

/**
 * Run multiple queries as a single atomic Postgres transaction over HTTP.
 *
 * `Sql` (== `NeonQueryFunction<false, false>`) already exposes `.transaction()`
 * from the underlying `@neondatabase/serverless` driver — this is a thin,
 * typed wrapper so call sites don't need to know that detail. Pass an array
 * of *unawaited* `sql\`...\`` tagged-template calls; they run together in one
 * BEGIN/COMMIT round-trip and either all apply or none do.
 *
 * Use this when a set of statements must be all-or-nothing (e.g. an insert
 * plus a dependent status update). For a single check-then-write, prefer a
 * single conditional `UPDATE ... WHERE <precondition> RETURNING` instead —
 * it's one round trip and needs no transaction at all.
 *
 * We deliberately do NOT switch to the websocket `Pool` driver to get
 * interactive (multi-round-trip) transactions — that would break the
 * stateless-per-request connection model this Worker relies on. This array
 * form transaction is the HTTP driver's non-interactive equivalent.
 */
export function transact(
  sql: Sql,
  queries: Parameters<Sql["transaction"]>[0],
): ReturnType<Sql["transaction"]> {
  return sql.transaction(queries);
}

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
  try {
    const rows = (await sql`
      INSERT INTO users (clerk_id, email, role)
      VALUES (${input.clerkId}, ${input.email}, ${input.role ?? "customer"})
      ON CONFLICT (clerk_id) DO UPDATE
        SET email = EXCLUDED.email, updated_at = NOW()
      RETURNING *
    `) as UserRow[];
    return rows[0];
  } catch (err) {
    if (!isEmailUniqueViolation(err)) throw err;
    // The email is owned by a row with a DIFFERENT clerk_id. Clerk enforces
    // unique verified emails per instance, so this means the Clerk account
    // was recreated (new clerk_id, same person) and the old row is stale.
    // If the caller already has their own row, keep it (don't clobber its
    // email); otherwise relink the stale row to the new clerk_id so the
    // account (role, customer/cleaner links) is preserved instead of 500ing.
    const own = await getUserByClerkId(sql, input.clerkId);
    if (own) return own;
    const relinked = (await sql`
      UPDATE users
      SET clerk_id = ${input.clerkId}, updated_at = NOW()
      WHERE LOWER(email) = LOWER(${input.email})
      RETURNING *
    `) as UserRow[];
    if (relinked[0]) return relinked[0];
    throw err;
  }
}

function isEmailUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; constraint?: string } | null;
  if (!e) return false;
  if (e.constraint === "users_email_key") return true;
  return (
    (e.code === "23505" || /unique constraint/i.test(e.message ?? "")) &&
    /users_email_key/.test(e.message ?? "")
  );
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
