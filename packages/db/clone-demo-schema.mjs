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
 * Builds (or rebuilds) an isolated `demo` Postgres schema — same tables,
 * primary keys, and foreign keys as `public`, zero rows — so
 * service.getsweepr.com's demo apps can run the REAL apps/api code against
 * REAL tables without ever touching production data. The demo API worker
 * points its DATABASE_URL at this schema via a `search_path=demo,public`
 * connection option; every unqualified table reference in the app then
 * resolves to `demo.*` instead of `public.*`.
 *
 * Deliberately NOT copied (not needed for a demo island, and simpler this
 * way): row-level security policies, triggers, views. Tables created without
 * RLS enabled just work normally for the schema's owning role.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node packages/db/clone-demo-schema.mjs [--reset]
 *   pnpm --filter @sweepr/db clone-demo-schema -- --reset
 *
 * --reset drops and recreates the demo schema from scratch (fresh test
 * island). Without it, the script is a no-op if `demo` already exists —
 * safe to run on every deploy.
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set");
  process.exit(1);
}
const reset = process.argv.includes("--reset");

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  const exists = (
    await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'demo'")
  ).rows.length > 0;

  if (exists && !reset) {
    console.log("✓ demo schema already exists (pass --reset to rebuild)");
    await client.end();
    return;
  }

  if (exists && reset) {
    process.stdout.write("→ dropping existing demo schema ... ");
    await client.query("DROP SCHEMA demo CASCADE");
    console.log("done");
  }

  await client.query("CREATE SCHEMA demo");

  const tables = (
    await client.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename != 'schema_migrations'
       ORDER BY tablename`
    )
  ).rows.map((r) => r.tablename);

  console.log(`→ cloning ${tables.length} tables into demo schema`);

  // Pass 1: structure (columns, defaults, CHECK/NOT NULL constraints, indexes)
  // — LIKE never copies PRIMARY KEY or FOREIGN KEY constraints, so those are
  // rebuilt explicitly in passes 2/3 below.
  for (const t of tables) {
    await client.query(
      `CREATE TABLE demo.${quoteIdent(t)} (LIKE public.${quoteIdent(t)}
         INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
         INCLUDING IDENTITY INCLUDING GENERATED)`
    );
  }

  // Pass 2: primary keys.
  const pks = await client.query(`
    SELECT conrelid::regclass::text AS tbl, conname,
           pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'p' AND connamespace = 'public'::regnamespace
  `);
  for (const row of pks.rows) {
    const tbl = unqualify(row.tbl);
    if (!tables.includes(tbl)) continue;
    await client.query(
      `ALTER TABLE demo.${quoteIdent(tbl)} ADD CONSTRAINT ${quoteIdent(`demo_${row.conname}`)} ${row.def}`
    );
  }

  // Pass 3: foreign keys, retargeted at demo.<table> instead of public.<table>.
  const fks = await client.query(`
    SELECT conrelid::regclass::text AS tbl, conname,
           pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  `);
  let fkCount = 0;
  for (const row of fks.rows) {
    const tbl = unqualify(row.tbl);
    if (!tables.includes(tbl)) continue;
    // pg_get_constraintdef emits "FOREIGN KEY (...) REFERENCES public.other(...)  ..."
    // (or unqualified "REFERENCES other(...)" if other is found via search_path);
    // normalize both forms to point at demo.other.
    const def = row.def
      .replace(/REFERENCES\s+public\./i, "REFERENCES demo.")
      .replace(/REFERENCES\s+(?!demo\.)([a-zA-Z_][\w]*)/i, "REFERENCES demo.$1");
    try {
      await client.query(
        `ALTER TABLE demo.${quoteIdent(tbl)} ADD CONSTRAINT ${quoteIdent(`demo_${row.conname}`)} ${def}`
      );
      fkCount++;
    } catch (err) {
      console.warn(`  ⚠ skipped FK ${row.conname} on ${tbl}: ${err.message}`);
    }
  }

  console.log(`✓ demo schema built: ${tables.length} tables, ${pks.rows.length} primary keys, ${fkCount} foreign keys`);
  await client.end();
}

function quoteIdent(id) {
  return `"${id.replace(/"/g, '""')}"`;
}
function unqualify(regclass) {
  // regclass::text is schema-qualified only when not on search_path; strip
  // any leading "public." and surrounding quotes either way.
  return regclass.replace(/^public\./, "").replace(/"/g, "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
