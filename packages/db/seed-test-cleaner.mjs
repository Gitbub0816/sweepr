#!/usr/bin/env node
/**
 * Seed one fully-verified test cleaner so you can walk the whole cleaner flow
 * end-to-end without grinding through onboarding every time.
 *
 * Creates / updates:
 *   • a users row (role = cleaner)
 *   • a cleaners row: status approved, background check CLEAR, identity APPROVED,
 *     all required training marked complete
 *   • passed cleaner_training_progress rows for every required (base) module
 *
 * The frontend onboarding guard reads cleanerStatus from Clerk publicMetadata,
 * so to make the account work end-to-end this script will ALSO set
 * publicMetadata.cleanerStatus = "approved" in Clerk when CLERK_SECRET_KEY and
 * SEED_CLERK_ID are provided.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *   SEED_EMAIL=tester@getsweepr.com \
 *   SEED_CLERK_ID=user_xxx \           # the Clerk user id to bind to (optional but recommended)
 *   CLERK_SECRET_KEY=sk_test_xxx \     # optional: also flips Clerk metadata to approved
 *   node packages/db/seed-test-cleaner.mjs
 *
 * Idempotent — re-running updates the same account.
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set");
  process.exit(1);
}

const EMAIL = process.env.SEED_EMAIL || "test.sweepr@getsweepr.com";
const CLERK_ID = process.env.SEED_CLERK_ID || `seed_${EMAIL.replace(/[^a-z0-9]/gi, "_")}`;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 1. User
  const { rows: userRows } = await client.query(
    `INSERT INTO users (clerk_id, email, role)
     VALUES ($1, $2, 'cleaner')
     ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email, role = 'cleaner'
     RETURNING id`,
    [CLERK_ID, EMAIL],
  );
  const userId = userRows[0].id;
  console.log(`• user        ${userId} (${EMAIL})`);

  // 2. Cleaner — fully verified & approved
  const { rows: cleanerRows } = await client.query(
    `INSERT INTO cleaners
       (user_id, first_name, last_name, phone, bio, status,
        checkr_status, didit_status, required_training_completed,
        training_completed_at, tier, rating, total_jobs)
     VALUES
       ($1, 'Test', 'Sweepr', '+15555550123',
        'Seeded test account — fully verified for end-to-end testing.',
        'approved', 'clear', 'approved', true, NOW(), 'preferred', 4.90, 12)
     ON CONFLICT (user_id) DO UPDATE SET
        status                      = 'approved',
        checkr_status               = 'clear',
        didit_status                = 'approved',
        required_training_completed = true,
        training_completed_at       = COALESCE(cleaners.training_completed_at, NOW())
     RETURNING id`,
    [userId],
  );
  const cleanerId = cleanerRows[0].id;
  console.log(`• cleaner     ${cleanerId} (approved, bg=clear, id=approved)`);

  // background_check_unlocked lives on cleaners in the training system — set it
  // if the column exists.
  await client.query(
    `UPDATE cleaners SET background_check_unlocked = true WHERE id = $1`,
    [cleanerId],
  ).catch(() => {});

  // 3. Mark every required (base) training module as passed
  const { rows: modules } = await client.query(
    `SELECT id, version FROM training_modules WHERE required_type = 'base' AND active = true`,
  );
  for (const m of modules) {
    await client.query(
      `INSERT INTO cleaner_training_progress
         (cleaner_id, module_id, module_version, status, score, attempt_count,
          started_at, completed_at, required_for_activation)
       VALUES ($1, $2, $3, 'passed', 100, 1, NOW(), NOW(), true)
       ON CONFLICT (cleaner_id, module_id) DO UPDATE SET
         status = 'passed', score = 100, completed_at = NOW()`,
      [cleanerId, m.id, m.version ?? 1],
    ).catch((e) => console.warn(`  (skipped module ${m.id}: ${e.message})`));
  }
  console.log(`• training    ${modules.length} required modules marked passed`);

  // 4. Optionally flip Clerk publicMetadata so the frontend guard sees approved
  if (CLERK_SECRET_KEY && !CLERK_ID.startsWith("seed_")) {
    const res = await fetch(`https://api.clerk.com/v1/users/${CLERK_ID}/metadata`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ public_metadata: { cleanerStatus: "approved" } }),
    });
    if (res.ok) console.log("• clerk       publicMetadata.cleanerStatus = approved");
    else console.warn(`• clerk       metadata update failed (${res.status})`);
  } else {
    console.log(
      "• clerk       skipped — set SEED_CLERK_ID (real Clerk id) + CLERK_SECRET_KEY,",
    );
    console.log(
      '              or set publicMetadata.cleanerStatus = "approved" manually in the Clerk dashboard.',
    );
  }

  console.log("\n✓ Seed complete. Sign in as this Clerk user to test the verified flow.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
