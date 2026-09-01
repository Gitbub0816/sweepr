/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

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

/**
 * Course Builder (migration 011) → legacy training_modules (migration 007)
 * cutover. A `courses` row can name the legacy module it's meant to replace
 * (`replaces_module_id`); this is the ONLY place that link does anything.
 *
 * Deactivates the legacy module the moment a course that replaces it goes
 * `status = 'published'` (it stops being returned by every `active = true`
 * query — /training/modules, /training/progress, /training/modules/:id —
 * so it "dies" cleaner-side without a schema change), and reactivates it the
 * moment no published course claims to replace it any more (a course
 * archived, reverted to draft, or deleted). Cutover is per-module and
 * independent: publishing one course never touches any other module.
 *
 * Shared between apps/api's admin course routes (the console publish/patch/
 * delete flow) and apps/mcp's course tools (the MCP publish_course tool) —
 * both are separate Workers that talk to Postgres directly, so this lives in
 * the shared @sweepr/db package rather than being duplicated.
 *
 * Deliberately does NOT touch a module an admin deactivated by hand with no
 * course ever pointed at it (`replaces_module_id` was always null) — this
 * only manages modules that are, or were, actually claimed by a course.
 */
export async function syncLegacyModuleCutover(
  sql: Sql,
  legacyModuleId: string | null | undefined
): Promise<void> {
  if (!legacyModuleId) return;
  await sql`
    UPDATE training_modules
    SET active = NOT EXISTS (
      SELECT 1 FROM courses
      WHERE replaces_module_id = ${legacyModuleId} AND status = 'published'
    ),
    updated_at = NOW()
    WHERE id = ${legacyModuleId}
  `;
}
