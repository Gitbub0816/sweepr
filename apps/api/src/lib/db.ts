/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// All queries use @neondatabase/serverless tagged templates which are
// parameterized — never interpolate user input outside of template slots.
import { createClient, type Sql } from "@sweepr/db";

// The Neon HTTP driver (`neon()`) is a stateless fetch wrapper, not a real
// connection — so memoizing the client per connection string is safe across
// invocations within the same Workers isolate and avoids rebuilding it on
// every getDb() call within (and across) a request.
const clientCache = new Map<string, Sql>();

/** Create (or reuse) a Neon SQL client bound to the worker's DATABASE_URL. */
export function getDb(databaseUrl: string): Sql {
  let sql = clientCache.get(databaseUrl);
  if (!sql) {
    sql = createClient(databaseUrl);
    clientCache.set(databaseUrl, sql);
  }
  return sql;
}

export type { Sql };
