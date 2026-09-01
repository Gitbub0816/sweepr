#!/usr/bin/env node
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
 * Seeds the two demo.getsweepr.com personas — one customer, one cleaner —
 * inside the isolated `demo` Postgres schema, so both sides of the
 * booking → day-of-service handoff can be tested against the real app +
 * real API with an actual Clerk session (no auth bypass code anywhere).
 *
 * Creates (idempotent — safe to re-run on every deploy):
 *   • Two real Clerk users (via the Clerk Backend API) with fixed, published
 *     credentials — demo-customer@getsweepr.com / demo-cleaner@getsweepr.com,
 *     same password — created once, reused after.
 *   • demo.users + demo.customers row for the customer persona, with a saved
 *     address inside the live Bay Area service area.
 *   • demo.users + demo.cleaners row for the cleaner persona: status
 *     approved, background check clear, identity approved, required training
 *     complete, service area centered on that same address — so a booking
 *     the demo customer places is immediately assignable to the demo cleaner.
 *
 * Usage:
 *   DATABASE_URL=postgres://...   (must already have the `demo` schema —
 *                                  run clone-demo-schema.mjs first)
 *   CLERK_SECRET_KEY=sk_...       (to create/find the two Clerk accounts)
 *   DEMO_ACCOUNT_PASSWORD=...     (shared password for both demo accounts —
 *                                  also shown on service.getsweepr.com, so
 *                                  this is intentionally NOT a secret in the
 *                                  security sense — just needs to be a
 *                                  password Clerk's strength check accepts)
 *   node packages/db/seed-demo.mjs
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;
if (!DATABASE_URL) { console.error("✗ DATABASE_URL is not set"); process.exit(1); }
if (!CLERK_SECRET_KEY) { console.error("✗ CLERK_SECRET_KEY is not set"); process.exit(1); }
if (!PASSWORD) { console.error("✗ DEMO_ACCOUNT_PASSWORD is not set"); process.exit(1); }

const CUSTOMER_EMAIL = "demo-customer@getsweepr.com";
const CLEANER_EMAIL = "demo-cleaner@getsweepr.com";

// A real address inside the live Bay Area service area (San Francisco City
// Hall) — arbitrary landmark, just needs to resolve inside the service_areas
// polygon so the booking wizard's availability check passes.
const DEMO_ADDRESS = {
  street: "1 Dr Carlton B Goodlett Pl",
  city: "San Francisco",
  state: "CA",
  zip: "94102",
  lat: 37.7793,
  lng: -122.4193,
};

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/** Find-or-create a Clerk user with a fixed email/password. Returns its id. */
async function ensureClerkUser(email, firstName, lastName) {
  const existing = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } },
  );
  if (existing.ok) {
    const found = await existing.json();
    if (Array.isArray(found) && found[0]?.id) return found[0].id;
  }
  const created = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: [email],
      password: PASSWORD,
      first_name: firstName,
      last_name: lastName,
      skip_password_checks: true,
    }),
  });
  if (!created.ok) {
    throw new Error(`Clerk user create failed for ${email}: ${created.status} ${await created.text()}`);
  }
  const data = await created.json();
  console.log(`  created Clerk user ${data.id} (${email})`);
  return data.id;
}

async function main() {
  await client.connect();

  const demoSchema = (
    await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'demo'")
  ).rows.length > 0;
  if (!demoSchema) {
    console.error("✗ demo schema doesn't exist — run clone-demo-schema.mjs first");
    process.exit(1);
  }
  await client.query("SET search_path TO demo, public");

  // ── Customer persona ────────────────────────────────────────────────────
  const customerClerkId = await ensureClerkUser(CUSTOMER_EMAIL, "Demo", "Customer");
  const { rows: custUserRows } = await client.query(
    `INSERT INTO users (clerk_id, email, role)
     VALUES ($1, $2, 'customer')
     ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [customerClerkId, CUSTOMER_EMAIL],
  );
  const customerUserId = custUserRows[0].id;

  const { rows: customerRows } = await client.query(
    `INSERT INTO customers (user_id, first_name, last_name, phone)
     VALUES ($1, 'Demo', 'Customer', '+15555550100')
     ON CONFLICT (user_id) DO UPDATE SET first_name = 'Demo', last_name = 'Customer'
     RETURNING id`,
    [customerUserId],
  );
  console.log(`• customer    ${customerRows[0].id} (${CUSTOMER_EMAIL})`);

  // addresses has no unique constraint to ON CONFLICT against — check first
  // so re-running this script doesn't pile up duplicate rows.
  const { rows: existingAddr } = await client.query(
    `SELECT id FROM addresses WHERE user_id = $1 AND street = $2 LIMIT 1`,
    [customerUserId, DEMO_ADDRESS.street],
  );
  if (existingAddr.length === 0) {
    await client.query(
      `INSERT INTO addresses (user_id, label, street, city, state, zip, lat, lng, is_default)
       VALUES ($1, 'Demo address', $2, $3, $4, $5, $6, $7, true)`,
      [customerUserId, DEMO_ADDRESS.street, DEMO_ADDRESS.city, DEMO_ADDRESS.state, DEMO_ADDRESS.zip, DEMO_ADDRESS.lat, DEMO_ADDRESS.lng],
    );
  }
  console.log(`• address     seeded (${DEMO_ADDRESS.street}, ${DEMO_ADDRESS.city})`);

  // ── Cleaner persona — fully verified, service area centered on the demo
  //    address, so the demo customer's booking is immediately assignable ──
  const cleanerClerkId = await ensureClerkUser(CLEANER_EMAIL, "Demo", "Cleaner");
  const { rows: cleanerUserRows } = await client.query(
    `INSERT INTO users (clerk_id, email, role)
     VALUES ($1, $2, 'cleaner')
     ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email, role = 'cleaner'
     RETURNING id`,
    [cleanerClerkId, CLEANER_EMAIL],
  );
  const cleanerUserId = cleanerUserRows[0].id;

  const { rows: cleanerRows } = await client.query(
    `INSERT INTO cleaners
       (user_id, first_name, last_name, phone, bio, status,
        yardstik_status, didit_status, required_training_completed,
        training_completed_at, tier, rating, total_jobs)
     VALUES
       ($1, 'Demo', 'Cleaner', '+15555550101',
        'Demo account — approved for testing the day-of-service flow.',
        'approved', 'clear', 'approved', true, NOW(), 'preferred', 4.90, 12)
     ON CONFLICT (user_id) DO UPDATE SET
        status = 'approved', yardstik_status = 'clear', didit_status = 'approved',
        required_training_completed = true,
        training_completed_at = COALESCE(cleaners.training_completed_at, NOW())
     RETURNING id`,
    [cleanerUserId],
  );
  const cleanerId = cleanerRows[0].id;
  console.log(`• cleaner     ${cleanerId} (${CLEANER_EMAIL}, approved)`);

  await client.query(`UPDATE cleaners SET background_check_unlocked = true WHERE id = $1`, [cleanerId]).catch(() => {});

  // cleaner_service_areas has no unique constraint on cleaner_id (the API's
  // own save path does the same delete+insert) — mirror that here.
  await client.query(`DELETE FROM cleaner_service_areas WHERE cleaner_id = $1`, [cleanerId]);
  await client.query(
    `INSERT INTO cleaner_service_areas (cleaner_id, center_lat, center_lng, radius_miles) VALUES ($1, $2, $3, 25)`,
    [cleanerId, DEMO_ADDRESS.lat, DEMO_ADDRESS.lng],
  );
  console.log("• service area seeded (25mi around the demo address)");

  const { rows: modules } = await client.query(
    `SELECT id, version FROM training_modules WHERE required_type = 'base' AND active = true`,
  );
  for (const m of modules) {
    await client.query(
      `INSERT INTO cleaner_training_progress
         (cleaner_id, module_id, module_version, status, score, attempt_count, started_at, completed_at, required_for_activation)
       VALUES ($1, $2, $3, 'passed', 100, 1, NOW(), NOW(), true)
       ON CONFLICT (cleaner_id, module_id) DO UPDATE SET status = 'passed', score = 100, completed_at = NOW()`,
      [cleanerId, m.id, m.version ?? 1],
    ).catch(() => {});
  }

  // Publish the approved status to Clerk metadata so the frontend onboarding
  // guard treats this account as fully approved on first sign-in.
  await fetch(`https://api.clerk.com/v1/users/${cleanerClerkId}/metadata`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ public_metadata: { cleanerStatus: "approved" } }),
  }).catch(() => {});

  console.log("\n✓ Demo personas ready:");
  console.log(`  Customer: ${CUSTOMER_EMAIL} / (shared demo password)`);
  console.log(`  Cleaner:  ${CLEANER_EMAIL} / (shared demo password)`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
