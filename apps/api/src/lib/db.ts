import { createClient, type Sql } from "@sweepr/db";

/** Create a Neon SQL client bound to the worker's DATABASE_URL. */
export function getDb(databaseUrl: string): Sql {
  return createClient(databaseUrl);
}

export type { Sql };
