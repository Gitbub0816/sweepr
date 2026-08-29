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
//
// Quarantine model: this worker READS pricing_versions,
// zip_pricing_multipliers, service_areas, allowlisted site_settings keys and
// the users row for role gating; it WRITES only mcp_simulator_configs and
// mcp_action_log. There is deliberately no code path that writes any other
// table.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Sql = NeonQueryFunction<false, false>;

// The Neon HTTP driver is a stateless fetch wrapper — memoizing per
// connection string is safe across invocations within the same isolate.
const clientCache = new Map<string, Sql>();

/** Create (or reuse) a Neon SQL client bound to the worker's DATABASE_URL. */
export function getDb(databaseUrl: string): Sql {
  let sql = clientCache.get(databaseUrl);
  if (!sql) {
    sql = neon(databaseUrl);
    clientCache.set(databaseUrl, sql);
  }
  return sql;
}
