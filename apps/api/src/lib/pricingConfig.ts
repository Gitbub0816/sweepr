/**
 * Admin-configurable pricing config, persisted as JSON in `site_settings`.
 *
 * Two keys:
 *   - home_cleaning_pricing_config  → HomeCleaningPricingConfig
 *   - str_pricing_config            → ShortTermRentalPricingConfig
 *
 * Falls back to the engine defaults so the system is always priceable even
 * before an admin saves anything. Never hardcode fees at call sites — read here.
 */
import {
  DEFAULT_HOME_CLEANING_CONFIG,
  DEFAULT_STR_PRICING_CONFIG,
  type HomeCleaningPricingConfig,
  type ShortTermRentalPricingConfig,
} from "@sweepr/utils";
import type { Sql } from "./db";

const HOME_KEY = "home_cleaning_pricing_config";
const STR_KEY = "str_pricing_config";

async function readJson<T>(sql: Sql, key: string, fallback: T): Promise<T> {
  const rows = (await sql`SELECT value FROM site_settings WHERE key = ${key} LIMIT 1`) as {
    value: string | null;
  }[];
  if (!rows[0]?.value) return fallback;
  try {
    // Shallow-merge over defaults so newly-added config fields are always present.
    return { ...fallback, ...(JSON.parse(rows[0].value) as Partial<T>) };
  } catch {
    return fallback;
  }
}

async function writeJson(sql: Sql, key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export function loadHomeCleaningConfig(sql: Sql): Promise<HomeCleaningPricingConfig> {
  return readJson(sql, HOME_KEY, DEFAULT_HOME_CLEANING_CONFIG);
}
export function saveHomeCleaningConfig(sql: Sql, cfg: HomeCleaningPricingConfig): Promise<void> {
  return writeJson(sql, HOME_KEY, cfg);
}
export function loadStrConfig(sql: Sql): Promise<ShortTermRentalPricingConfig> {
  return readJson(sql, STR_KEY, DEFAULT_STR_PRICING_CONFIG);
}
export function saveStrConfig(sql: Sql, cfg: ShortTermRentalPricingConfig): Promise<void> {
  return writeJson(sql, STR_KEY, cfg);
}
