/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Sql } from "@sweepr/db";

/**
 * Admin-tunable operational knobs for Team Cleans, stored as a single JSON row
 * in site_settings (key = 'crew_config'), modeled exactly on matchingConfig.ts.
 * Defaults reproduce the intended behavior, so an empty/absent row is safe.
 *
 * PRICING-facing knobs (team efficiency, extra-cleaner fee) do NOT live here —
 * they belong in PricingConfigV2 so they version with a pricing snapshot. This
 * bag holds only staffing/operational values.
 */
export interface CrewConfig {
  /** App-enforced max crew size (data model supports more; admin can raise). */
  maxCrewSize: number;
  /** Minutes a crew-seat invitation stays open before it expires and cascades. */
  crewInvitationTtlMinutes: number;
  /** How many candidates are invited in parallel per open MEMBER seat. */
  parallelInvitationCount: number;
  /** A helper seat must have at least this much useful work, or it is dropped. */
  minUsefulMinutesPerCleaner: number;
  /** A solo shift longer than this pushes the job toward a crew. */
  maxSoloElapsedMinutes: number;
  /** Preferred ceiling on a crew's on-site elapsed time. */
  targetMaxElapsedMinutes: number;
  /** Extra workload the LEAD carries for walkthrough/coordination/completion. */
  leadOverheadMinutes: number;
  /**
   * Person-minute thresholds that floor the recommended crew size by labor
   * volume. e.g. { "1": 300, "2": 540, "3": 900 } → up to 300 min favors 1,
   * up to 540 favors 2, etc. Keyed by the crew size that becomes the floor.
   */
  crewSizeThresholdsPersonMinutes: Record<string, number>;
  /**
   * Cleaner-payout POOL split percentages by crew size (primary first). Each
   * array must sum to 100. Owner-decided splits (2026-09):
   * { "1": [100], "2": [54,46], "3": [36,32,32] }. Rounding: every non-primary
   * seat is rounded from its fraction and the LEAD absorbs the remainder
   * (splitPoolCents), so the pool is conserved exactly in integer cents.
   */
  payoutSplitByCrewSize: Record<string, number[]>;
}

export const DEFAULT_CREW_CONFIG: CrewConfig = {
  maxCrewSize: 3,
  crewInvitationTtlMinutes: 10,
  parallelInvitationCount: 3,
  minUsefulMinutesPerCleaner: 90,
  maxSoloElapsedMinutes: 360,
  targetMaxElapsedMinutes: 300,
  leadOverheadMinutes: 20,
  crewSizeThresholdsPersonMinutes: { "1": 540, "2": 900, "3": 1320 },
  payoutSplitByCrewSize: { "1": [100], "2": [54, 46], "3": [36, 32, 32] },
};

const KEY = "crew_config";

function clamp(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : dflt;
  return Math.max(lo, Math.min(hi, v));
}

/** A split array is valid only if every entry is a positive number summing to 100. */
function validSplit(arr: unknown): arr is number[] {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (!arr.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) return false;
  return Math.round(arr.reduce((a, b) => a + b, 0)) === 100;
}

/** Load crew config, merged over defaults with each field clamped/validated. */
export async function loadCrewConfig(sql: Sql): Promise<CrewConfig> {
  try {
    const rows = (await sql`SELECT value FROM site_settings WHERE key = ${KEY} LIMIT 1`) as Array<{
      value: unknown;
    }>;
    const raw = rows[0]?.value;
    const obj = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<CrewConfig> | null;
    if (!obj || typeof obj !== "object") return { ...DEFAULT_CREW_CONFIG };

    const thresholds =
      obj.crewSizeThresholdsPersonMinutes && typeof obj.crewSizeThresholdsPersonMinutes === "object"
        ? obj.crewSizeThresholdsPersonMinutes
        : DEFAULT_CREW_CONFIG.crewSizeThresholdsPersonMinutes;

    // Keep only splits that validate; fall back to defaults per size otherwise.
    const splits: Record<string, number[]> = { ...DEFAULT_CREW_CONFIG.payoutSplitByCrewSize };
    if (obj.payoutSplitByCrewSize && typeof obj.payoutSplitByCrewSize === "object") {
      for (const [size, arr] of Object.entries(obj.payoutSplitByCrewSize)) {
        if (validSplit(arr)) splits[size] = arr;
      }
    }

    return {
      maxCrewSize: Math.round(clamp(obj.maxCrewSize, 1, 10, DEFAULT_CREW_CONFIG.maxCrewSize)),
      crewInvitationTtlMinutes: Math.round(
        clamp(obj.crewInvitationTtlMinutes, 1, 120, DEFAULT_CREW_CONFIG.crewInvitationTtlMinutes),
      ),
      parallelInvitationCount: Math.round(
        clamp(obj.parallelInvitationCount, 1, 20, DEFAULT_CREW_CONFIG.parallelInvitationCount),
      ),
      minUsefulMinutesPerCleaner: Math.round(
        clamp(obj.minUsefulMinutesPerCleaner, 15, 600, DEFAULT_CREW_CONFIG.minUsefulMinutesPerCleaner),
      ),
      maxSoloElapsedMinutes: Math.round(
        clamp(obj.maxSoloElapsedMinutes, 60, 1440, DEFAULT_CREW_CONFIG.maxSoloElapsedMinutes),
      ),
      targetMaxElapsedMinutes: Math.round(
        clamp(obj.targetMaxElapsedMinutes, 60, 1440, DEFAULT_CREW_CONFIG.targetMaxElapsedMinutes),
      ),
      leadOverheadMinutes: Math.round(
        clamp(obj.leadOverheadMinutes, 0, 240, DEFAULT_CREW_CONFIG.leadOverheadMinutes),
      ),
      crewSizeThresholdsPersonMinutes: thresholds as Record<string, number>,
      payoutSplitByCrewSize: splits,
    };
  } catch {
    return { ...DEFAULT_CREW_CONFIG };
  }
}

/** Persist crew config (upsert the singleton site_settings row). */
export async function saveCrewConfig(sql: Sql, cfg: CrewConfig): Promise<void> {
  await sql`
    INSERT INTO site_settings (key, value) VALUES (${KEY}, ${JSON.stringify(cfg)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

/**
 * The payout-pool split for a crew of `size`, as fractions summing to 1
 * (primary first). Falls back to an even split if no configured/valid entry.
 */
export function payoutSplitFractions(cfg: CrewConfig, size: number): number[] {
  const pct = cfg.payoutSplitByCrewSize[String(size)];
  if (validSplit(pct) && pct.length === size) return pct.map((p) => p / 100);
  return Array.from({ length: Math.max(1, size) }, () => 1 / Math.max(1, size));
}

// ─── Feature flags (boolean site_settings keys) ──────────────────────────────

/**
 * Team Cleans master flag + sub-toggles.
 *
 * Team Cleans is LIVE by default (owner decision, 2026-09): a MISSING row
 * counts as ON, and migration 107 seeds every flag row to "true" in
 * production. The flags are kept so admins can still turn any stage off from
 * the Crew Config page — a stored row wins, and only the exact value "true"
 * keeps a stage on.
 */
export const TEAM_FLAG_KEYS = {
  enabled: "team_cleans_enabled",
  autoSizing: "team_auto_crew_sizing_enabled",
  autoMatching: "team_auto_crew_matching_enabled",
  taskAllocation: "team_task_allocation_enabled",
  preferredTeammates: "team_preferred_teammates_enabled",
} as const;

export type TeamFlag = keyof typeof TEAM_FLAG_KEYS;

/**
 * Read a Team Cleans feature flag.
 *  - No stored row → ON (the default is enabled).
 *  - Stored row → ON only when its value is exactly "true" (admin off-switch).
 *  - Any error reading → OFF (fail safe to the legacy solo path).
 */
export async function isTeamFlagEnabled(sql: Sql, flag: TeamFlag): Promise<boolean> {
  try {
    const key = TEAM_FLAG_KEYS[flag];
    const rows = (await sql`SELECT value FROM site_settings WHERE key = ${key} LIMIT 1`) as Array<{
      value: unknown;
    }>;
    if (!rows[0]) return true; // absent row = enabled by default
    return String(rows[0].value ?? "").trim() === "true";
  } catch {
    return false;
  }
}
