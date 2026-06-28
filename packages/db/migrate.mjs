#!/usr/bin/env node
/**
 * Migration runner — applies every src/migrations/*.sql file that hasn't been
 * applied yet, in filename order, each inside its own transaction, and records
 * it in a `schema_migrations` table so it only ever runs once.
 *
 * This keeps the database in sync without anyone pasting SQL by hand.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node packages/db/migrate.mjs
 *   pnpm --filter @sweepr/db migrate
 *
 * Safe to run repeatedly — already-applied migrations are skipped. Uses the
 * standard `pg` driver (simple query protocol) so multi-statement files and
 * DO $$ blocks run correctly.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(__dirname, "src", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const freshTracking =
    (await client.query("SELECT to_regclass('public.schema_migrations') AS t"))
      .rows[0].t === null;

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    // Only numbered migrations run automatically. Helper/repair files like
    // neon-ensure.sql (not prefixed with a number) are skipped here.
    .filter((f) => /^\d{3}/.test(f))
    .sort();

  // Auto-baseline: this database already had migrations 001–025 applied by hand
  // before the runner existed. If we're setting up tracking for the first time
  // on an already-initialized DB, record those historical migrations as applied
  // (without re-running them) so only new ones (026+) execute.
  const dbInitialized =
    (await client.query("SELECT to_regclass('public.users') AS t")).rows[0].t !== null;
  if (freshTracking && dbInitialized) {
    const prefix = (f) => parseInt(f.match(/^(\d+)/)?.[1] ?? "0", 10);
    const baseline = files.filter((f) => prefix(f) <= 25);
    for (const f of baseline) {
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        [f],
      );
    }
    console.log(`• Baselined ${baseline.length} pre-existing migrations (≤ 025)`);
  }

  const { rows } = await client.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = readFileSync(join(MIG_DIR, file), "utf8");
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(text);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("done");
      count++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      console.error(err);
      process.exit(1);
    }
  }

  console.log(
    count === 0
      ? "✓ Database already up to date"
      : `✓ Applied ${count} migration${count === 1 ? "" : "s"}`,
  );

  // Heal step: apply the consolidated, fully-idempotent schema so any table or
  // column a prior over-eager baseline marked "applied" but never created gets
  // created now. Safe to run every time (CREATE ... IF NOT EXISTS throughout).
  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    process.stdout.write("→ healing schema (idempotent) ... ");
    try {
      await client.query(readFileSync(schemaPath, "utf8"));
      console.log("done");
    } catch (err) {
      console.log("FAILED");
      console.error(err);
      process.exit(1);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
