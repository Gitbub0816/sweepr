import type { Sql } from "@sweepr/db";
import { OFFER_EXPIRY_MINUTES } from "./constants";

/**
 * Admin-tunable knobs for the assignment engine. Stored as a single JSON row in
 * site_settings (key = 'matching_config'); the engine reads it per assignment.
 * Defaults reproduce the built-in behavior, so an empty/absent row is safe.
 */
export interface MatchingConfig {
  /** Weighted-random floor (0..1): higher = more deterministic, lower = more chance. */
  randomnessFloor: number;
  /** Free declines a cleaner gets per day before declines dent acceptance rate. */
  freeDeclinesPerDay: number;
  /** Minutes an offer stays open before it expires and cascades. */
  offerExpiryMinutes: number;
  /** How many cleaners are queued (offered in sequence) per booking. */
  maxCandidates: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  randomnessFloor: 0.35,
  freeDeclinesPerDay: 1,
  offerExpiryMinutes: OFFER_EXPIRY_MINUTES,
  maxCandidates: 5,
};

const KEY = "matching_config";

function clamp(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : dflt;
  return Math.max(lo, Math.min(hi, v));
}

/** Load the config (merged over defaults, each field clamped to a sane range). */
export async function loadMatchingConfig(sql: Sql): Promise<MatchingConfig> {
  try {
    const rows = (await sql`SELECT value FROM site_settings WHERE key = ${KEY} LIMIT 1`) as Array<{
      value: unknown;
    }>;
    const raw = rows[0]?.value;
    const obj = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<MatchingConfig> | null;
    if (!obj || typeof obj !== "object") return { ...DEFAULT_MATCHING_CONFIG };
    return {
      randomnessFloor: clamp(obj.randomnessFloor, 0, 0.9, DEFAULT_MATCHING_CONFIG.randomnessFloor),
      freeDeclinesPerDay: Math.round(clamp(obj.freeDeclinesPerDay, 0, 20, DEFAULT_MATCHING_CONFIG.freeDeclinesPerDay)),
      offerExpiryMinutes: Math.round(clamp(obj.offerExpiryMinutes, 1, 1440, DEFAULT_MATCHING_CONFIG.offerExpiryMinutes)),
      maxCandidates: Math.round(clamp(obj.maxCandidates, 1, 25, DEFAULT_MATCHING_CONFIG.maxCandidates)),
    };
  } catch {
    return { ...DEFAULT_MATCHING_CONFIG };
  }
}

/** Persist the config (upsert the singleton site_settings row). */
export async function saveMatchingConfig(sql: Sql, cfg: MatchingConfig): Promise<void> {
  await sql`
    INSERT INTO site_settings (key, value) VALUES (${KEY}, ${JSON.stringify(cfg)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}
