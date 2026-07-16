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
 * ZIP-code-specific pricing multiplier. Admin-managed, applied to a booking's
 * base total before the platform fee split — a positive percentage raises the
 * total (customer pays more, cleaner earns proportionally more), a negative
 * percentage lowers it the same way. This is NOT a fee-only adjustment like
 * the Founding Member customer discount (lib/foundingMember.ts) — it changes
 * the whole price, the same way the cleaning-level and rush-hour surcharges
 * already do.
 */

import type { Sql } from "./db";

export interface ZipPricingMultiplier {
  zip: string;
  multiplierPct: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ZipMultiplierRow {
  zip: string;
  multiplier_pct: string | number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toZipMultiplier(r: ZipMultiplierRow): ZipPricingMultiplier {
  return {
    zip: r.zip,
    multiplierPct: Number(r.multiplier_pct),
    active: r.active,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The active adjustment percentage for a ZIP code, 0 if none is configured
 *  or the row is inactive. Never throws — a lookup failure prices as if no
 *  adjustment exists rather than blocking checkout. */
export async function loadZipMultiplierPct(sql: Sql, zip: string | null | undefined): Promise<number> {
  if (!zip) return 0;
  try {
    const rows = (await sql`
      SELECT multiplier_pct FROM zip_pricing_multipliers
      WHERE zip = ${zip} AND active = TRUE
      LIMIT 1
    `) as Array<{ multiplier_pct: string | number }>;
    return rows[0] ? Number(rows[0].multiplier_pct) : 0;
  } catch {
    return 0;
  }
}

export async function listZipMultipliers(sql: Sql): Promise<ZipPricingMultiplier[]> {
  const rows = (await sql`
    SELECT zip, multiplier_pct, active, notes, created_at, updated_at
    FROM zip_pricing_multipliers
    ORDER BY zip ASC
  `) as ZipMultiplierRow[];
  return rows.map(toZipMultiplier);
}

/** Creates or updates the multiplier for a ZIP (upsert on the ZIP primary key). */
export async function upsertZipMultiplier(
  sql: Sql,
  input: { zip: string; multiplierPct: number; active: boolean; notes: string | null; createdByClerkId: string },
): Promise<ZipPricingMultiplier> {
  const rows = (await sql`
    INSERT INTO zip_pricing_multipliers (zip, multiplier_pct, active, notes, created_by_clerk_id)
    VALUES (${input.zip}, ${input.multiplierPct}, ${input.active}, ${input.notes}, ${input.createdByClerkId})
    ON CONFLICT (zip) DO UPDATE SET
      multiplier_pct = EXCLUDED.multiplier_pct,
      active = EXCLUDED.active,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING zip, multiplier_pct, active, notes, created_at, updated_at
  `) as ZipMultiplierRow[];
  return toZipMultiplier(rows[0]);
}

export async function deleteZipMultiplier(sql: Sql, zip: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM zip_pricing_multipliers WHERE zip = ${zip} RETURNING zip
  `) as Array<{ zip: string }>;
  return rows.length > 0;
}
