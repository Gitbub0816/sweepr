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
 * Pricing v2 service layer — everything that touches the database around the
 * pure engine: resolving the Active pricing version, persisting immutable
 * quote snapshots, activating scheduled versions from cron, and the
 * append-only workspace audit trail.
 */

import type { Sql } from "@sweepr/db";
import { logger } from "../logger";
import type { PricingConfigV2, QuoteInputV2, QuoteResultV2 } from "@sweepr/quote-engine";
import { computeQuoteV2 } from "@sweepr/quote-engine";

export interface ActivePricingVersion {
  id: string;
  name: string;
  config: PricingConfigV2;
}

/** Quotes are honored for 30 minutes; checkout re-quotes after that. */
export const QUOTE_TTL_MINUTES = 30;

// Per-isolate cache: the active version changes rarely and every quote needs
// it. Publishing takes effect everywhere within this TTL.
const ACTIVE_CACHE_TTL_MS = 60_000;
const activeCache = new Map<string, { value: ActivePricingVersion | null; expiresAt: number }>();

/** For tests and post-publish freshness within the publishing isolate. */
export function clearActivePricingVersionCache(): void {
  activeCache.clear();
}

export async function loadActivePricingVersion(
  sql: Sql,
  serviceArea = "default",
  currency = "USD",
): Promise<ActivePricingVersion | null> {
  const key = `${serviceArea}|${currency}`;
  const cached = activeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value: ActivePricingVersion | null = null;
  try {
    const rows = (await sql`
      SELECT id, name, config FROM pricing_versions
      WHERE status = 'active' AND service_area = ${serviceArea} AND currency = ${currency}
      LIMIT 1
    `) as Array<{ id: string; name: string; config: PricingConfigV2 }>;
    if (rows[0]) value = { id: rows[0].id, name: rows[0].name, config: rows[0].config };
  } catch (err) {
    // Missing table (pre-migration) or transient failure → v2 stays dark.
    logger.warn("loadActivePricingVersion failed", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
  activeCache.set(key, { value, expiresAt: Date.now() + ACTIVE_CACHE_TTL_MS });
  return value;
}

/** Compute a quote against the active version and persist the immutable
 *  snapshot. Returns null when no version is active (v2 dark). */
export async function quoteAndPersist(
  sql: Sql,
  input: QuoteInputV2,
  opts: { customerId: string | null },
): Promise<{ quoteId: string; expiresAt: string; version: ActivePricingVersion; result: QuoteResultV2 } | null> {
  const version = await loadActivePricingVersion(sql, input.serviceArea, input.currency);
  if (!version) return null;
  const result = computeQuoteV2(version.config, input, { pricingVersionId: version.id });
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60_000).toISOString();
  const rows = (await sql`
    INSERT INTO pricing_quotes_v2 (
      pricing_version_id, input, result, currency, total_cents,
      expected_labor_minutes, scheduled_labor_minutes, fingerprint,
      manual_review_required, customer_id, expires_at
    ) VALUES (
      ${version.id}, ${JSON.stringify(input)}, ${JSON.stringify(result)},
      ${result.currency}, ${result.totalCents}, ${result.expectedLaborMinutes},
      ${result.scheduledLaborMinutes}, ${result.calculationFingerprint},
      ${result.manualReviewRequired}, ${opts.customerId}, ${expiresAt}
    ) RETURNING id
  `) as Array<{ id: string }>;
  return { quoteId: rows[0].id, expiresAt, version, result };
}

/** Append a pricing workspace audit event (never throws). */
export async function pricingAudit(
  sql: Sql,
  entry: {
    versionId: string | null;
    actorClerkId: string | null;
    event: string;
    detail?: Record<string, unknown>;
    requestId?: string | null;
  },
): Promise<void> {
  try {
    await sql`
      INSERT INTO pricing_audit_events (version_id, actor_clerk_id, event, detail, request_id)
      VALUES (${entry.versionId}, ${entry.actorClerkId}, ${entry.event},
              ${JSON.stringify(entry.detail ?? {})}, ${entry.requestId ?? null})
    `;
  } catch (err) {
    logger.error("pricing audit write failed", err, { event: entry.event });
  }
}

/**
 * Cron: activate Scheduled versions whose effective time has arrived.
 * Two steps without a wrapping transaction (the Neon HTTP driver is
 * single-statement); the failure mode between steps is "no active version",
 * which safely disables v2 (bookings fall back to the legacy chain) until the
 * next cron fire completes the activation. The partial unique index
 * guarantees two racing activations can't both win.
 */
export async function activateScheduledPricingVersions(sql: Sql): Promise<number> {
  const due = (await sql`
    SELECT id, service_area, currency FROM pricing_versions
    WHERE status = 'scheduled' AND effective_at <= NOW()
    ORDER BY effective_at ASC
  `) as Array<{ id: string; service_area: string; currency: string }>;
  let activated = 0;
  for (const v of due) {
    try {
      await sql`
        UPDATE pricing_versions SET status = 'superseded', effective_end = NOW(), updated_at = NOW()
        WHERE status = 'active' AND service_area = ${v.service_area} AND currency = ${v.currency}
      `;
      const claimed = (await sql`
        UPDATE pricing_versions SET status = 'active', updated_at = NOW()
        WHERE id = ${v.id} AND status = 'scheduled'
        RETURNING id
      `) as Array<{ id: string }>;
      if (claimed[0]) {
        activated++;
        clearActivePricingVersionCache();
        await pricingAudit(sql, {
          versionId: v.id,
          actorClerkId: "system:cron",
          event: "activated",
          detail: { via: "scheduled" },
        });
      }
    } catch (err) {
      logger.error("scheduled pricing activation failed", err, { versionId: v.id });
    }
  }
  return activated;
}
