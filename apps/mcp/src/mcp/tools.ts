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
 * MCP tool surface for the Sweepr pricing sandbox.
 *
 * Quarantine invariants:
 *  - READ tools touch only allowlisted config tables (pricing_versions,
 *    zip_pricing_multipliers, service_areas, allowlisted site_settings keys).
 *    Never PII, never money rows.
 *  - The ONLY writes are to mcp_simulator_configs (the per-admin sandbox)
 *    and mcp_action_log (audit). There is no path to live pricing: going
 *    live requires a human loading the proposal in the admin console
 *    (Pricing Studio → Proposals, or Pricing → Import Payload) and
 *    publishing in Pricing Studio.
 *  - Every tool call is logged to mcp_action_log.
 *
 * Pay-model language (keep it precise everywhere this worker speaks):
 * cleaners are NOT paid hourly. The standard split is 70% to the cleaner/team
 * pool and 30% to Sweepr — the Marketplace Services Fee
 * (apps/api/src/lib/payoutEngine.ts) — plus 100% of tips to the cleaner,
 * outside the split. The config's "customer labor rate" is a pricing-model
 * input (estimated-labor-minutes → customer price) and the config's payout
 * block is an internal planning estimate; neither is a wage.
 */

import {
  buildColdStartConfig,
  buildDefaultExtendedRules,
  computeQuoteV2,
  unwrapPricingRuleset,
  validatePricingConfig,
  REFERENCE_SCENARIOS,
  ROOM_TYPES_V2,
  type PetHairLevel,
  type PricingConfigV2,
  type QuoteInputV2,
  type QuoteResultV2,
  type RoomTypeV2,
  type ConditionLevel,
  type ServiceTypeV2,
} from "@sweepr/quote-engine";
import { SITE_SETTINGS_ALLOWLIST } from "../lib/allowlist";
import { mintShareToken } from "../lib/oauth";
import type { Sql } from "../lib/db";
import type { Env } from "../types";

export interface ToolContext {
  sql: Sql;
  env: Env;
  adminEmail: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const nameArg = {
  type: "string",
  description: "Sandbox config name (each admin can keep several). Defaults to 'default'.",
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "list_pricing_versions",
    description:
      "READ-ONLY: list stored Pricing v2 versions (id, name, service area, currency, status, timestamps — no config bodies). Newest first, capped at 50.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_pricing_version",
    description:
      "READ-ONLY: fetch one pricing version by id, including its full PricingConfigV2 config JSON and status.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "pricing_versions.id (UUID)" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_active_pricing",
    description:
      "READ-ONLY: the currently ACTIVE pricing version's config for a service area + currency (defaults: 'default' / 'USD'). Returns null with an explanation when no version is active (legacy pricing is then in effect).",
    inputSchema: {
      type: "object",
      properties: {
        serviceArea: { type: "string", description: "Service area slug (default 'default')." },
        currency: { type: "string", description: "Currency code (default 'USD')." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_zip_multipliers",
    description:
      "READ-ONLY: ZIP-code pricing multiplier table (zip, multiplier_pct, active, notes).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_service_areas",
    description: "READ-ONLY: service areas (id, name, slug, status, center coordinates).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_site_settings",
    description:
      "READ-ONLY: the explicitly allowlisted site settings (platform basics, prelaunch gates, scope-review fee tiers, founding-member program gates). No other settings are reachable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_simulator_config",
    description:
      "SANDBOX: fetch your quarantined simulator PricingConfigV2 (never live pricing). Returns null when you have not stored one yet.",
    inputSchema: {
      type: "object",
      properties: { name: nameArg },
      additionalProperties: false,
    },
  },
  {
    name: "set_simulator_config",
    description:
      "SANDBOX: store/replace your quarantined simulator config (upsert by name). Accepts a flat PricingConfigV2, a formatVersion-2 config carrying `extendedRules` (the multi-service ruleset: Move-In/Out matrix, Airbnb/STR matrix + staffing + turnover rules, deep-clean classification, short-notice tiers, location tiers, extras overrides), or the full SweeprExtendedPricingRuleset wrapper — the master ruleset JSON imports as-is and is flattened for storage with every extended section preserved verbatim. Provide ALL PricingConfigV2 fields, or accept the built-in defaults: any field you omit is filled from the cold-start defaults BEFORE validation and reported back in defaultedFields, so a partial config becomes complete-with-defaults (never a partial pricing model). The completed config is then validated: hard errors REFUSE the save; warnings are stored and returned. Stored configs automatically appear in the admin console's Pricing Studio under the Proposals tab, where an admin can 'Load into Studio' to open them as a fully pre-filled, field-by-field editable DRAFT. This NEVER affects live pricing — only a human can import, review, and publish. Minimum-plus-hourly pricing is expressed via rates.minimumBookingCents (integer cents; 0 = no minimum).",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "object", description: "PricingConfigV2 object, optionally with extendedRules, or a SweeprExtendedPricingRuleset wrapper (see the sweepr://config-field-guide resource)." },
        name: nameArg,
        notes: { type: "string", description: "Free-form notes about this proposal." },
        basedOnVersionId: {
          type: "string",
          description: "Informational provenance: the pricing_versions.id this proposal started from.",
        },
      },
      required: ["config"],
      additionalProperties: false,
    },
  },
  {
    name: "reset_simulator",
    description:
      "SANDBOX: reset your simulator config to the built-in cold-start defaults (a fresh, valid starting point).",
    inputSchema: {
      type: "object",
      properties: { name: nameArg },
      additionalProperties: false,
    },
  },
  {
    name: "simulate_quote",
    description:
      "Run one quote through the real Pricing v2 engine against your SANDBOX config (default), or read-only against a stored version's config by passing versionId. Supports all three service types when the config carries extendedRules: serviceType 'standard' (default), 'moveInOut' (BR/BA matrix + condition multipliers), or 'airbnb' (turnover matrix + dirtiness + staffing + turnover window). For the matrix paths pass bedrooms/bathrooms (or counts) plus conditionLevel 1-4; airbnb also takes turnoverWindowHours, severeMess, and airbnbDiscount {kind, percent} to preview the repeat/volume discount the adapter resolves from history in production. hoursUntilService drives the short-notice tiers; petHair ('light'|'moderate'|'heavy') prices the percentage tiers. Returns the full engine result plus a customer-facing summary (incl. deepCleanApplied, requiredTeamSize, laborScheduling, manualReviewReasons); customerSummary.minimumApplied tells you when rates.minimumBookingCents topped the job up to the minimum. Note: result.cleanerPayoutCents is the config's internal planning estimate, NOT cleaner pay — the standard split pays the cleaner/team pool 70% of captured proceeds (the 30% Marketplace Services Fee is Sweepr's), plus 100% of tips. Purely computational — nothing is stored or charged.",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "object",
          description:
            "Quote input. counts: rooms per type {kitchen,bathroom,bedroom,living_room}; conditions: reported MAXIMUM condition per type (1 light … 4 heavy); optional sqft, clutter (0-2 per type), extras [{key,quantity}], countsByLevel, zipMultiplierPct, emergency. Extended: serviceType ('standard'|'moveInOut'|'airbnb'), bedrooms, bathrooms, conditionLevel (1-4 overall), hoursUntilService, turnoverWindowHours, severeMess, unsafeConditions [string], petHair ('light'|'moderate'|'heavy'), airbnbDiscount {kind:'repeat_property'|'host_volume', percent}.",
          properties: {
            counts: { type: "object" },
            conditions: { type: "object" },
            sqft: { type: "number" },
            clutter: { type: "object" },
            countsByLevel: { type: "object" },
            extras: { type: "array" },
            emergency: { type: "boolean" },
            zipMultiplierPct: { type: "number" },
            serviceType: { type: "string", enum: ["standard", "moveInOut", "airbnb"] },
            bedrooms: { type: "number" },
            bathrooms: { type: "number" },
            conditionLevel: { type: "number" },
            hoursUntilService: { type: "number" },
            turnoverWindowHours: { type: "number" },
            severeMess: { type: "boolean" },
            unsafeConditions: { type: "array" },
            petHair: { type: "string", enum: ["light", "moderate", "heavy"] },
            airbnbDiscount: { type: "object" },
          },
          required: [],
        },
        name: nameArg,
        versionId: {
          type: "string",
          description: "Simulate against this stored pricing_versions.id instead of the sandbox.",
        },
      },
      required: ["input"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_scenarios",
    description:
      "Run the reference scenarios (small/typical/large homes) against BOTH the active live version's config and your sandbox config; returns a side-by-side totals table showing the customer impact of your proposal.",
    inputSchema: {
      type: "object",
      properties: { name: nameArg },
      additionalProperties: false,
    },
  },
  {
    name: "get_payload_template",
    description:
      "The upload-payload template: a complete, valid cold-start PricingConfigV2 plus field-by-field documentation (units: MINUTES, INTEGER CENTS, basis points, permille).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "draft_pricing_payload",
    description:
      "Validate your sandbox config and, if valid, emit the exact JSON upload artifact for a HUMAN admin to import in the admin console (Pricing → Import Payload) and later review/publish in Pricing Studio. Usually unnecessary: every stored sandbox config already shows up in Pricing Studio → Proposals for one-click 'Load into Studio' autofill — use this tool when the human specifically wants the raw JSON. This tool does NOT change live pricing — it only produces the artifact.",
    inputSchema: {
      type: "object",
      properties: {
        name: nameArg,
        note: { type: "string", description: "Change summary to carry on the draft." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_simulator_link",
    description:
      "A shareable customer-look simulator page for your sandbox config (7-day signed link, read-only) so a human can eyeball prices in a booking-style UI.",
    inputSchema: {
      type: "object",
      properties: { name: nameArg },
      additionalProperties: false,
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function coerceName(args: Record<string, unknown>): string {
  const n = typeof args.name === "string" && args.name.trim() ? args.name.trim() : "default";
  if (n.length > 100) throw new ToolError("Sandbox name too long (max 100 chars).");
  return n;
}

export class ToolError extends Error {}

/**
 * Deep-merge a caller-provided (possibly PARTIAL) config OVER the cold-start
 * defaults so every field is present before validation — a partial config
 * becomes complete-with-defaults rather than shipping incomplete. Objects are
 * merged key-by-key; arrays and primitives are LEAVES (the caller's value
 * replaces the default wholesale — this is how `extras`, the labor-matrix rows,
 * etc. are meant to be replaced as a unit). Records every default-filled field
 * path so the human can see exactly what was defaulted. Override-only keys pass
 * through untouched so the validator can still reject unknown shapes.
 */
function deepMergeDefaults(
  defaults: unknown,
  override: unknown,
  path: string,
  defaulted: string[],
): unknown {
  const defaultsIsObject =
    defaults !== null && typeof defaults === "object" && !Array.isArray(defaults);
  if (!defaultsIsObject) {
    // Default is an array or primitive (a leaf).
    if (override === undefined) {
      if (path) defaulted.push(path);
      return defaults;
    }
    return override;
  }
  if (override === undefined) {
    // Whole subtree missing — take it from defaults and record the parent path.
    if (path) defaulted.push(path);
    return defaults;
  }
  if (override === null || typeof override !== "object" || Array.isArray(override)) {
    // Shape mismatch (object expected): keep the caller's value; the validator
    // will surface the problem as a hard error.
    return override;
  }
  const out: Record<string, unknown> = {};
  const d = defaults as Record<string, unknown>;
  const o = override as Record<string, unknown>;
  for (const key of Object.keys(d)) {
    out[key] = deepMergeDefaults(d[key], o[key], path ? `${path}.${key}` : key, defaulted);
  }
  for (const key of Object.keys(o)) {
    if (!(key in d)) out[key] = o[key];
  }
  return out;
}

/** Fill any missing PricingConfigV2 fields from cold-start defaults, returning
 *  the completed config and the sorted list of default-filled field paths. */
export function mergeConfigWithDefaults(config: unknown): {
  merged: PricingConfigV2;
  defaulted: string[];
} {
  const defaulted: string[] = [];
  const merged = deepMergeDefaults(buildColdStartConfig(), config, "", defaulted) as PricingConfigV2;
  return { merged, defaulted: defaulted.sort() };
}

async function loadSandboxRow(
  ctx: ToolContext,
  name: string,
): Promise<{ config: PricingConfigV2; notes: string | null; updated_at: string } | null> {
  const rows = (await ctx.sql`
    SELECT config, notes, updated_at FROM mcp_simulator_configs
    WHERE admin_email = ${ctx.adminEmail} AND name = ${name} LIMIT 1
  `) as Array<{ config: PricingConfigV2; notes: string | null; updated_at: string }>;
  return rows[0] ?? null;
}

async function loadVersionConfig(
  ctx: ToolContext,
  id: string,
): Promise<{ config: PricingConfigV2; name: string; status: string } | null> {
  const rows = (await ctx.sql`
    SELECT name, status, config FROM pricing_versions WHERE id = ${id}::uuid LIMIT 1
  `) as Array<{ name: string; status: string; config: PricingConfigV2 }>;
  return rows[0] ?? null;
}

async function loadActiveVersion(
  ctx: ToolContext,
  serviceArea: string,
  currency: string,
): Promise<{ id: string; name: string; config: PricingConfigV2 } | null> {
  const rows = (await ctx.sql`
    SELECT id, name, config FROM pricing_versions
    WHERE status = 'active' AND service_area = ${serviceArea} AND currency = ${currency}
    LIMIT 1
  `) as Array<{ id: string; name: string; config: PricingConfigV2 }>;
  return rows[0] ?? null;
}

/** Fill engine-required fields the LLM may omit; the engine renormalizes. */
function normalizeInput(raw: Record<string, unknown>): QuoteInputV2 {
  const counts: Record<RoomTypeV2, number> = {
    kitchen: 1,
    bathroom: 1,
    bedroom: 1,
    living_room: 1,
  };
  const conditions: Record<RoomTypeV2, ConditionLevel> = {
    kitchen: 1,
    bathroom: 1,
    bedroom: 1,
    living_room: 1,
  };
  const rc = (raw.counts ?? {}) as Record<string, unknown>;
  const rcond = (raw.conditions ?? {}) as Record<string, unknown>;
  for (const t of ROOM_TYPES_V2) {
    if (typeof rc[t] === "number") counts[t] = Math.max(0, Math.floor(rc[t] as number));
    if (typeof rcond[t] === "number") {
      const lvl = Math.min(4, Math.max(1, Math.round(rcond[t] as number)));
      conditions[t] = lvl as ConditionLevel;
    }
  }
  // BR/BA shorthand for the matrix paths overrides the per-type counts.
  if (typeof raw.bedrooms === "number") counts.bedroom = Math.max(0, Math.floor(raw.bedrooms));
  if (typeof raw.bathrooms === "number") counts.bathroom = Math.max(1, Math.ceil(raw.bathrooms));
  const input: QuoteInputV2 = {
    serviceArea: "default",
    currency: "USD",
    counts,
    conditions,
    countsByLevel: raw.countsByLevel as QuoteInputV2["countsByLevel"],
    clutter: raw.clutter as QuoteInputV2["clutter"],
    sqft: typeof raw.sqft === "number" ? raw.sqft : undefined,
    extras: Array.isArray(raw.extras) ? (raw.extras as QuoteInputV2["extras"]) : [],
    emergency: raw.emergency === true,
    zipMultiplierPct:
      typeof raw.zipMultiplierPct === "number" ? (raw.zipMultiplierPct as number) : undefined,
  };
  if (typeof raw.serviceType === "string") input.serviceType = raw.serviceType as ServiceTypeV2;
  if (typeof raw.conditionLevel === "number") {
    input.conditionLevel = Math.min(4, Math.max(1, Math.round(raw.conditionLevel))) as ConditionLevel;
  }
  if (typeof raw.hoursUntilService === "number") input.hoursUntilService = raw.hoursUntilService;
  if (typeof raw.turnoverWindowHours === "number") {
    input.turnoverWindowHours = raw.turnoverWindowHours;
  }
  if (raw.severeMess === true) input.severeMess = true;
  if (Array.isArray(raw.unsafeConditions)) {
    input.unsafeConditions = raw.unsafeConditions.map((s) => String(s));
  }
  if (typeof raw.petHair === "string") input.petHair = raw.petHair as PetHairLevel;
  if (raw.airbnbDiscount && typeof raw.airbnbDiscount === "object") {
    input.airbnbDiscount = raw.airbnbDiscount as QuoteInputV2["airbnbDiscount"];
  }
  return input;
}

function customerSummary(q: QuoteResultV2): Record<string, unknown> {
  return {
    total: dollars(q.totalCents),
    subtotal: dollars(q.subtotalCents),
    tax: dollars(q.taxCents),
    serviceType: q.serviceType,
    expectedLaborMinutes: q.expectedLaborMinutes,
    scheduledLaborMinutes: q.scheduledLaborMinutes,
    estimatedElapsedMinutes: q.estimatedElapsedMinutes,
    recommendedTeamSize: q.recommendedTeamSize,
    requiredTeamSize: q.requiredTeamSize,
    deepCleanApplied: q.deepCleanApplied === true,
    laborScheduling: q.laborScheduling,
    manualReviewRequired: q.manualReviewRequired,
    manualReviewReasons: q.manualReviewReasons,
    ...(q.appliedDiscount ? { appliedDiscount: q.appliedDiscount } : {}),
    minimumApplied: q.minimumApplied === true,
    ...(q.minimumApplied
      ? {
          minimumNote:
            "The configured minimum job total (rates.minimumBookingCents) kicked in — the pre-tax subtotal was topped up to the minimum; see the 'policy.minimum' component for the amount.",
        }
      : {}),
    warnings: q.warnings,
  };
}

export const PAYLOAD_INSTRUCTIONS =
  "Hand off to a Sweepr admin: this proposal is already visible in the admin console under " +
  "Pricing Studio → Proposals, where 'Load into Studio' opens it as a fully pre-filled draft " +
  "for field-by-field review. Alternatively they can paste this JSON in Pricing → Import Payload. " +
  "Either way, nothing changes live pricing until a human reviews and publishes in Pricing Studio.";

export function buildPayloadTemplate(): Record<string, unknown> {
  return {
    description:
      "PricingConfigV2 upload template (all values are the built-in cold-start defaults — a complete, valid config). Units: labor is INTEGER MINUTES, money is INTEGER CENTS, percentage-like rates are basis points (bps, 1/100 of a percent) or permille (1/1000). Pay-model reminder: nothing in this config sets cleaner wages — cleaners are NOT paid hourly; the cleaner/team pool earns 70% of captured booking proceeds (the 30% Marketplace Services Fee is Sweepr's share), plus 100% of tips outside the split; the labor rate here only converts estimated minutes into a CUSTOMER price. Multi-service pricing (formatVersion 2): add an `extendedRules` block — see extendedRulesTemplate below and the sweepr://config-field-guide resource.",
    template: buildColdStartConfig(),
    extendedRulesTemplate: buildDefaultExtendedRules(),
    instructions: {
      laborMatrix:
        "Per room type, expected minutes for ONE room at condition levels 1..4. Whole minutes ≥ 0, non-decreasing across levels, ≤ 600 per cell. Levels are ORDERED CATEGORIES, not a linear score.",
      "clutter.minutesByType":
        "Extra minutes for one room at clutter [clear, some items, substantially obstructed]. Whole minutes, non-decreasing.",
      "clutter.unobservedFactorPermille":
        "Unobserved same-type rooms are charged this permille fraction of the reported (worst-room) clutter minutes. 1000 = charge every room fully.",
      "clutter.obstructedRequiresReview":
        "true → a 'substantially obstructed' report flags the quote for pre-service review.",
      "size.includedSqft": "Square footage inside this allowance adds no time.",
      "size.incrementSqft": "Band size above the allowance.",
      "size.minutesPerIncrement": "Whole minutes added per band.",
      "size.maxAdjustmentMinutes": "Cap on total size-based minutes.",
      "operational.setupMinutes": "Per-visit setup minutes.",
      "operational.packdownMinutes": "Per-visit pack-down minutes.",
      "operational.perExtraRoomTransitionMinutes": "Minutes per counted room beyond the first.",
      extras:
        "Catalog of purchasable extras. mode: 'minutes' (billed via labor rate), 'fixed' (flat cents), 'both'. minutesPerUnit whole minutes; fixedCentsPerUnit whole cents; min/maxQuantity; payoutTreatment 'standard' or 'cleaner_full'; active toggles availability. Do not invent fields.",
      "rates.customerLaborRateCentsPerHour":
        "Integer cents charged to the CUSTOMER per ESTIMATED labor-hour. Bounds: 2000–25000 ($20–$250). PRICING MODEL INPUT ONLY — it converts estimated labor minutes into a customer price. It is NOT a wage and NOT what cleaners receive: the cleaner/team pool is paid 70% of captured booking proceeds (the 30% Marketplace Services Fee is Sweepr's share), plus 100% of tips, regardless of this number.",
      "rates.fixedServiceCents": "Flat per-booking amount (trip/supplies), integer cents.",
      "rates.minimumBookingCents":
        "Minimum job total, integer cents (0 = no minimum; must be ≤ maxAutoQuoteCents). Expresses 'hourly rate PLUS a minimum' (e.g. rate 2500 + minimum 4000 = $25/labor-hour but at least $40/job). Floors the ENTIRE pre-tax subtotal (labor + fixed visit + extras, after zip/short-notice adjustments) before tax and charm rounding, so the customer total is never below minimum + tax. When it bites, the quote carries a 'policy.minimum' component and minimumApplied: true.",
      "rates.maxAutoQuoteCents": "Quotes above this require manual review, integer cents.",
      "rates.taxRateBps": "Tax rate in basis points (825 = 8.25%). Max 2000.",
      "rates.roundTotalUpToEndingDigit":
        "Charm rounding: round the total UP so its dollar part ends in this digit (e.g. 9). null = off.",
      "rates.emergencySurchargeBps": "Short-notice (<48h) surcharge in bps. Max 5000.",
      "rates.extraCleanerFeeCentsPer100Sqft":
        "Flat fee in INTEGER CENTS per 100 sqft, charged ONLY when the customer opts to add one extra cleaner for speed. Whole cents ≥ 0, max 5000 ($50) per 100 sqft. Default 100 ($1) per 100 sqft. Never multiplies the whole price by crew size.",
      payout:
        "INTERNAL PLANNING ESTIMATE — NOT how cleaners are paid. Cleaners are NOT paid hourly: the cleaner/team pool receives 70% of captured booking proceeds (the 30% Marketplace Services Fee is Sweepr's share, configured in Platform Fees), plus 100% of tips outside the split. This block only models an estimated cost-of-labor figure (mode 'per_labor_hour' with centsPerLaborHour, or 'percent_of_subtotal' with percentBps 1–10000) used for margin validation and planning; no payout transfer ever reads it.",
      "scheduling.reservePercentile": "Capacity planning percentile 50–99 (NOT billed).",
      "scheduling.bufferRatePermille": "Extra cold-start buffer on scheduled minutes, permille (max 500).",
      "scheduling.roundUpToIncrementMinutes": "Scheduled minutes round up to this increment.",
      "scheduling.teamProductivityPermille":
        "Effective productivity by team size, permille of one cleaner (e.g. {\"1\":1000,\"2\":1800}).",
      "scheduling.twoPersonThresholdMinutes": "Scheduled labor above this recommends a 2-person team.",
      inference:
        "Ordinal condition-inference parameters (modelVersion, provenance, thresholds — three strictly increasing values per room type, betaHome 0–5, hGridPoints 5–51, hGridSpan). Change only with statistical review; keep modelVersion immutable per parameter set.",
      extendedRules:
        "OPTIONAL formatVersion-2 multi-service ruleset (see extendedRulesTemplate for a complete example): moveInOut (BR/BA basePriceMatrixCents + conditionMultipliersPercent L1-L4 + oversizedHomeGuardrail $/250sqft), airbnbSTR (basePriceMatrixCents + sizeGuardrail includedSqftByBedroomCount + dirtinessAdjustmentPercent + staffingMatrix + turnoverWindow + repeatVolumeDiscounts + scopeAndSuppressionRules), deepClean (classification triggers + baseWorkloadMultiplierPercent), shortNotice (tiers replacing the single emergency surcharge; never stack), locationPricing (zip tiers 0/+5/+10 with cap; supersedes legacy negative zip rows), manualReview (sqft/price/clutter/unsafe triggers), extrasAppSideOverrides (decoupled laundry + light tidying, fixed oven/sliding door, pet-hair percentage tiers, patio exclusivity, linens/laundry overlap), payoutAndMarketplaceEconomics (70/30 split documentation + team productivity incl. three-cleaner 2500 permille). Unknown sections are preserved verbatim. Omit the whole block for a legacy standard-only config — it prices exactly as before.",
    },
  };
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Execute one tool call. Returns the JSON-serializable result. Throws
 * ToolError for user-facing failures.
 */
export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_pricing_versions": {
      const rows = await ctx.sql`
        SELECT id, name, service_area, currency, status, inference_provenance,
               effective_at, published_at, created_at, updated_at
        FROM pricing_versions ORDER BY created_at DESC LIMIT 50
      `;
      return { versions: rows };
    }

    case "get_pricing_version": {
      const id = String(args.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ToolError("id must be a UUID.");
      const rows = await ctx.sql`
        SELECT id, name, service_area, currency, status, inference_provenance,
               change_summary, validation, config, effective_at, published_at,
               created_at, updated_at
        FROM pricing_versions WHERE id = ${id}::uuid LIMIT 1
      `;
      if (!rows[0]) throw new ToolError("No pricing version with that id.");
      return { version: rows[0] };
    }

    case "get_active_pricing": {
      const serviceArea = typeof args.serviceArea === "string" ? args.serviceArea : "default";
      const currency = typeof args.currency === "string" ? args.currency : "USD";
      const active = await loadActiveVersion(ctx, serviceArea, currency);
      if (!active) {
        return {
          active: null,
          explanation: `No ACTIVE Pricing v2 version for service area '${serviceArea}' / ${currency} — the legacy pricing chain (roomPricing → rule → legacy) is pricing customers there.`,
        };
      }
      return { active };
    }

    case "get_zip_multipliers": {
      const rows = await ctx.sql`
        SELECT zip, multiplier_pct, active, notes, created_at, updated_at
        FROM zip_pricing_multipliers ORDER BY zip
      `;
      return { zipMultipliers: rows };
    }

    case "list_service_areas": {
      const rows = await ctx.sql`
        SELECT id, name, slug, status, center_lat, center_lng, created_at
        FROM service_areas ORDER BY name
      `;
      return { serviceAreas: rows };
    }

    case "get_site_settings": {
      // Default-deny: only the hardcoded allowlist ever leaves this worker.
      const keys = [...SITE_SETTINGS_ALLOWLIST];
      const rows = (await ctx.sql`
        SELECT key, value FROM site_settings WHERE key = ANY(${keys})
      `) as Array<{ key: string; value: string }>;
      const settings: Record<string, string> = {};
      for (const r of rows) {
        if (SITE_SETTINGS_ALLOWLIST.includes(r.key)) settings[r.key] = r.value;
      }
      return { settings, allowlistedKeys: keys };
    }

    case "get_simulator_config": {
      const cfgName = coerceName(args);
      const row = await loadSandboxRow(ctx, cfgName);
      if (!row) {
        return {
          name: cfgName,
          config: null,
          hint: "No sandbox config stored yet — call reset_simulator to start from cold-start defaults, or set_simulator_config with a full config.",
        };
      }
      return { name: cfgName, config: row.config, notes: row.notes, updatedAt: row.updated_at };
    }

    case "set_simulator_config": {
      const cfgName = coerceName(args);
      const rawConfig = args.config;
      if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
        throw new ToolError("config object is required.");
      }
      // The SweeprExtendedPricingRuleset wrapper (the master ruleset JSON)
      // flattens to { ...config, formatVersion: 2, extendedRules } before the
      // defaults merge; flat configs pass through unchanged.
      const { config: flatConfig } = unwrapPricingRuleset(rawConfig);
      // Completeness guarantee: fill any missing field from cold-start defaults
      // BEFORE validating, so a partial config becomes complete-with-defaults
      // (never a partial/incomplete pricing model). The validator then still
      // REJECTS any hard error (e.g. an out-of-bounds value the caller DID set).
      const { merged: config, defaulted } = mergeConfigWithDefaults(flatConfig);
      let validation;
      try {
        validation = validatePricingConfig(config);
      } catch (err) {
        throw new ToolError(
          `Config is structurally invalid: ${err instanceof Error ? err.message : String(err)}. Start from get_payload_template and do not invent fields.`,
        );
      }
      if (!validation.ok) {
        return {
          stored: false,
          ok: false,
          errors: validation.errors,
          warnings: validation.warnings,
          defaultedFields: defaulted,
          hint: "Fix the errors and call set_simulator_config again — invalid configs are refused. Fields listed in defaultedFields were filled from cold-start defaults.",
        };
      }
      const notes = typeof args.notes === "string" ? args.notes.slice(0, 2000) : null;
      const basedOn =
        typeof args.basedOnVersionId === "string" && /^[0-9a-f-]{36}$/i.test(args.basedOnVersionId)
          ? args.basedOnVersionId
          : null;
      await ctx.sql`
        INSERT INTO mcp_simulator_configs (admin_email, name, config, based_on_version_id, notes)
        VALUES (${ctx.adminEmail}, ${cfgName}, ${JSON.stringify(config)}::jsonb,
                ${basedOn}::uuid, ${notes})
        ON CONFLICT (admin_email, name) DO UPDATE
          SET config = EXCLUDED.config,
              based_on_version_id = EXCLUDED.based_on_version_id,
              notes = COALESCE(EXCLUDED.notes, mcp_simulator_configs.notes),
              updated_at = NOW()
      `;
      return {
        stored: true,
        ok: true,
        errors: [],
        warnings: validation.warnings,
        defaultedFields: defaulted,
        name: cfgName,
      };
    }

    case "reset_simulator": {
      const cfgName = coerceName(args);
      const config = buildColdStartConfig();
      await ctx.sql`
        INSERT INTO mcp_simulator_configs (admin_email, name, config, based_on_version_id, notes)
        VALUES (${ctx.adminEmail}, ${cfgName}, ${JSON.stringify(config)}::jsonb, NULL,
                'Reset to cold-start defaults')
        ON CONFLICT (admin_email, name) DO UPDATE
          SET config = EXCLUDED.config,
              based_on_version_id = NULL,
              notes = EXCLUDED.notes,
              updated_at = NOW()
      `;
      return { reset: true, name: cfgName, config };
    }

    case "simulate_quote": {
      const rawInput = args.input as Record<string, unknown> | undefined;
      if (!rawInput || typeof rawInput !== "object") throw new ToolError("input object is required.");
      const input = normalizeInput(rawInput);

      let config: PricingConfigV2;
      let source: string;
      if (typeof args.versionId === "string" && args.versionId) {
        if (!/^[0-9a-f-]{36}$/i.test(args.versionId)) throw new ToolError("versionId must be a UUID.");
        const v = await loadVersionConfig(ctx, args.versionId);
        if (!v) throw new ToolError("No pricing version with that id.");
        config = v.config;
        source = `stored version "${v.name}" (${v.status})`;
      } else {
        const cfgName = coerceName(args);
        const row = await loadSandboxRow(ctx, cfgName);
        if (row) {
          config = row.config;
          source = `sandbox config "${cfgName}"`;
        } else {
          config = buildColdStartConfig();
          source = `cold-start defaults (no sandbox config "${cfgName}" stored yet)`;
        }
      }

      let result: QuoteResultV2;
      try {
        result = computeQuoteV2(config, input, { pricingVersionId: "mcp-sim" });
      } catch (err) {
        throw new ToolError(
          `Quote failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return { source, input, customerSummary: customerSummary(result), result };
    }

    case "compare_scenarios": {
      const cfgName = coerceName(args);
      const sandboxRow = await loadSandboxRow(ctx, cfgName);
      const sandboxConfig = sandboxRow?.config ?? buildColdStartConfig();
      const active = await loadActiveVersion(ctx, "default", "USD");

      const rowsOut = REFERENCE_SCENARIOS.map((s) => {
        const run = (cfg: PricingConfigV2 | null): Record<string, unknown> | null => {
          if (!cfg) return null;
          try {
            const q = computeQuoteV2(cfg, s.input, { pricingVersionId: "mcp-sim" });
            return {
              total: dollars(q.totalCents),
              totalCents: q.totalCents,
              expectedLaborMinutes: q.expectedLaborMinutes,
              modeledCleanerPayout: dollars(q.cleanerPayoutCents),
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        };
        const a = run(active?.config ?? null);
        const b = run(sandboxConfig);
        const deltaCents =
          a && b && typeof a.totalCents === "number" && typeof b.totalCents === "number"
            ? (b.totalCents as number) - (a.totalCents as number)
            : null;
        return {
          scenario: s.label,
          active: a ?? "no active version (legacy pricing in effect)",
          sandbox: b,
          deltaCents,
          delta: deltaCents === null ? null : `${deltaCents >= 0 ? "+" : "-"}${dollars(Math.abs(deltaCents))}`,
        };
      });
      return {
        sandboxName: cfgName,
        sandboxSource: sandboxRow ? "stored sandbox config" : "cold-start defaults (nothing stored yet)",
        activeVersion: active ? { id: active.id, name: active.name } : null,
        comparison: rowsOut,
        payoutNote:
          "modeledCleanerPayout is the config's internal planning estimate, not what cleaners are paid — the cleaner/team pool earns 70% of captured proceeds (the 30% Marketplace Services Fee is Sweepr's share), plus 100% of tips.",
      };
    }

    case "get_payload_template":
      return buildPayloadTemplate();

    case "draft_pricing_payload": {
      const cfgName = coerceName(args);
      const row = await loadSandboxRow(ctx, cfgName);
      if (!row) {
        throw new ToolError(
          `No sandbox config "${cfgName}" to draft from — build one with set_simulator_config first.`,
        );
      }
      // Complete the stored config from defaults before validating/emitting, so
      // an older or partial stored config can never ship incomplete — any
      // missing field (e.g. a newly added one) is filled from cold-start
      // defaults, and hard errors still block the draft.
      const { merged: config, defaulted } = mergeConfigWithDefaults(row.config);
      const validation = validatePricingConfig(config);
      if (!validation.ok) {
        return {
          ok: false,
          errors: validation.errors,
          warnings: validation.warnings,
          defaultedFields: defaulted,
          hint: "The sandbox config no longer validates — fix it before drafting the payload.",
        };
      }
      const note = typeof args.note === "string" ? args.note.slice(0, 2000) : (row.notes ?? "");
      return {
        ok: true,
        warnings: validation.warnings,
        defaultedFields: defaulted,
        payload: { name: cfgName, note, config },
        instructions: PAYLOAD_INSTRUCTIONS,
      };
    }

    case "get_simulator_link": {
      const cfgName = coerceName(args);
      const token = await mintShareToken(ctx.env.MCP_TOKEN_SECRET, ctx.adminEmail, cfgName);
      return {
        url: `https://mcp.getsweepr.com/simulator?token=${encodeURIComponent(token)}`,
        expiresInDays: 7,
        note: "Read-only customer-look simulation page for your sandbox config. Anyone with the link can view it until it expires.",
      };
    }

    default:
      throw new ToolError(`Unknown tool: ${name}`);
  }
}

/**
 * Audit-log one tool call. Large args (configs) are summarized so the log
 * stays reviewable; failures are logged too.
 */
export async function logToolCall(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  outcome: "ok" | "error",
  errorMessage?: string,
): Promise<void> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "config" && v && typeof v === "object") {
      sanitized[k] = { summarized: true, keys: Object.keys(v as object) };
    } else if (k === "input") {
      sanitized[k] = v;
    } else if (typeof v === "string") {
      sanitized[k] = v.slice(0, 500);
    } else {
      sanitized[k] = v;
    }
  }
  try {
    await ctx.sql`
      INSERT INTO mcp_action_log (admin_email, tool, detail)
      VALUES (${ctx.adminEmail}, ${tool},
              ${JSON.stringify({ args: sanitized, outcome, error: errorMessage ?? null })}::jsonb)
    `;
  } catch {
    // Audit logging is best-effort; the action itself already succeeded/failed.
  }
}
