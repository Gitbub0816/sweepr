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
 * MCP resources — the static "skill" material a connected LLM can read:
 * the payload template, a field guide for PricingConfigV2, and the
 * operating workflow.
 */

import { buildPayloadTemplate } from "./tools";

export interface ResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  {
    uri: "sweepr://payload-template",
    name: "Pricing payload template",
    description:
      "A complete, valid cold-start PricingConfigV2 with field-by-field instructions — the exact shape draft_pricing_payload emits.",
    mimeType: "application/json",
  },
  {
    uri: "sweepr://config-field-guide",
    name: "PricingConfigV2 field guide",
    description:
      "Every configuration field explained, with units (minutes, integer cents, bps, permille) and validation bounds.",
    mimeType: "text/markdown",
  },
  {
    uri: "sweepr://workflow",
    name: "Pricing sandbox workflow",
    description: "The explore → sandbox → simulate → emit → human-uploads operating guide.",
    mimeType: "text/markdown",
  },
];

export const CONFIG_FIELD_GUIDE = `# PricingConfigV2 field guide

Sweepr's Pricing v2 engine turns a home description into expected LABOR
MINUTES, then into money. Three unit rules are absolute:

- **Money is INTEGER CENTS** everywhere. Never dollars, never floats.
- **Durations are INTEGER MINUTES** at every stored boundary.
- Percentage-like rates are integers in smaller units: **basis points**
  (bps, 1/100 of a percent — 825 bps = 8.25%) or **permille** (1/1000 —
  1000 = 1.0×).

Room types: \`kitchen\`, \`bathroom\`, \`bedroom\`, \`living_room\`.
Condition levels 1–4 are ORDERED CATEGORIES (1 light … 4 heavy), never an
equally spaced score.

## laborMatrix
Per room type, an array of four integers: expected minutes for ONE room at
condition levels 1..4. Bounds: whole minutes ≥ 0, non-decreasing across
levels, ≤ 600 minutes per cell.

## clutter
- \`minutesByType\`: per room type, three integers — extra minutes for one
  room at clutter state [clear, some items, substantially obstructed].
  Non-decreasing.
- \`unobservedFactorPermille\`: unobserved same-type rooms are charged this
  permille fraction of the reported (worst-room) clutter minutes.
  1000 = charge every room fully.
- \`obstructedRequiresReview\`: true → an "obstructed" report flags the quote
  for pre-service review.

## size
- \`includedSqft\`: square footage inside this allowance adds no time.
- \`incrementSqft\` / \`minutesPerIncrement\`: whole minutes added per band
  above the allowance.
- \`maxAdjustmentMinutes\`: cap on total size-based minutes.

## operational
\`setupMinutes\`, \`packdownMinutes\` (per visit), and
\`perExtraRoomTransitionMinutes\` (per counted room beyond the first).

## extras
Catalog of purchasable add-ons. This is a full list you REPLACE wholesale, so
you can **re-price existing add-ons AND introduce brand-new ones** — append a
new object to the array with a fresh, unique \`key\` and it becomes a real
add-on that prices and simulates immediately. You are not limited to the
add-ons already present. Per extra:
- \`key\` (unique, snake_case, e.g. \`inside_fridge\`), \`label\`, \`unitLabel\`
  — all required for active extras.
- \`mode\`: \`minutes\` (billed via the labor rate), \`fixed\` (flat cents),
  or \`both\`.
- \`minutesPerUnit\` (whole minutes), \`fixedCentsPerUnit\` (whole cents).
- \`minQuantity\` ≤ \`maxQuantity\` (both whole numbers).
- \`eligibleRooms\` (optional), \`overlapGroup\` / \`incompatibleWith\`:
  combination constraints (any incompatible key must exist in the catalog).
- \`payoutTreatment\`: \`standard\` or \`cleaner_full\` (100% to the cleaner).
- \`active\`: availability toggle (must be \`true\` to be bookable/priceable).

New add-on example (append to \`extras\`):
\`\`\`json
{ "key": "inside_windows", "label": "Interior windows", "mode": "both",
  "minutesPerUnit": 4, "fixedCentsPerUnit": 300, "unitLabel": "window",
  "minQuantity": 1, "maxQuantity": 30, "payoutTreatment": "standard",
  "active": true }
\`\`\`
To simulate it, pass \`extras: [{ "key": "inside_windows", "quantity": 6 }]\`
to \`simulate_quote\`.

IMPORTANT for the human uploading the payload: a new add-on defined here prices
and simulates correctly, and it lands in the drafted pricing version. But the
customer booking wizard offers add-ons from a separate static catalog
(\`ADD_ONS\` in packages/utils/src/pricing.ts). Until an engineer also adds the
new key there (with its customer-facing label/description), a brand-new add-on
is priceable server-side but is NOT yet selectable by customers in the booking
flow. Tell the human this whenever the payload introduces a new add-on key.

Do NOT invent config fields outside this shape — the validator refuses unknown
shapes.

## rates
- \`customerLaborRateCentsPerHour\`: integer cents per labor-hour.
  **Bounds: 2000–25000** ($20–$250).
- \`fixedServiceCents\`: flat per-booking amount, own line item.
- \`minimumBookingCents\`: floor on the pre-tax total (≤ maxAutoQuoteCents).
- \`maxAutoQuoteCents\`: quotes above this require manual review.
- \`taxRateBps\`: 0–2000 bps.
- \`roundTotalUpToEndingDigit\`: charm rounding — round the total UP so its
  dollar part ends in this digit (0–9), or null = off.
- \`emergencySurchargeBps\`: disclosed short-notice (<48h) surcharge,
  0–5000 bps.
- \`extraCleanerFeeCentsPer100Sqft\`: flat fee in INTEGER CENTS per 100 sqft,
  charged ONLY when the customer opts to add one extra cleaner for speed.
  Whole cents ≥ 0, max 5000 ($50) per 100 sqft. Default 100 ($1) per 100 sqft.
  It is a customer-elected line item, never a multiplier on the whole price by
  crew size, and it never touches labor minutes or cleaner payout.

## payout
- \`mode\`: \`per_labor_hour\` → \`centsPerLaborHour\` must be positive;
  \`percent_of_subtotal\` → \`percentBps\` in 1–10000.

## scheduling
- \`reservePercentile\`: 50–99 (capacity planning, NOT billed).
- \`bufferRatePermille\`: 0–500 extra cold-start buffer on scheduled minutes.
- \`roundUpToIncrementMinutes\`: ≥ 1.
- \`teamProductivityPermille\`: effective productivity by team size, permille
  of one cleaner (each team-of-N between 500 and N×1000).
- \`twoPersonThresholdMinutes\`: scheduled labor above this recommends a
  two-person team.

## inference
Ordinal condition-inference parameters. \`modelVersion\` is an immutable
identifier stamped on every quote; \`provenance\` is cold_start | learned |
blended. \`thresholds\`: three STRICTLY increasing values per room type.
\`betaHome\`: whole-home sensitivity, 0–5 per type. \`hGridPoints\`: 5–51.
Change these only with statistical review.

## Completeness (provide all fields, or accept defaults)
Provide ALL PricingConfigV2 fields, or accept the built-in defaults. Before
validating, \`set_simulator_config\` and \`draft_pricing_payload\` DEEP-MERGE
your config over the cold-start defaults, so any field you omit is filled from
defaults and reported back in \`defaultedFields\`. The result is always a
complete config — a partial config becomes complete-with-defaults, never a
partial/incomplete pricing model. Arrays (like \`extras\` and the labor-matrix
rows) are replaced wholesale, not merged: send the whole array when you change
one entry.

## Validation
After the defaults-merge, \`set_simulator_config\` runs the same validator the
admin console uses: hard errors REFUSE the save (including any out-of-bounds
value you DID set); warnings store but surface for review. The validator also
prices three reference scenarios and rejects configs that produce ≤ $0 totals,
zero labor, or negative margin (cleaner payout ≥ pre-tax subtotal).
`;

export const WORKFLOW_GUIDE = `# Sweepr pricing sandbox — operating workflow

You are connected to Sweepr's QUARANTINED pricing sandbox. You can NEVER
change live pricing. Your only write target is your own simulator config;
everything else is read-only. Every tool call is audit-logged.

## The loop: explore → sandbox → simulate → emit → human uploads

1. **Explore** the live setup read-only: \`get_active_pricing\`,
   \`list_pricing_versions\` / \`get_pricing_version\`,
   \`get_zip_multipliers\`, \`list_service_areas\`, \`get_site_settings\`.
2. **Sandbox**: start from \`reset_simulator\` (cold-start defaults) or copy
   a real version's config, then adjust and store with
   \`set_simulator_config\`. Provide all fields or accept the defaults — any
   field you omit is filled from cold-start defaults before validation and
   listed in \`defaultedFields\`, so you never ship a partial model; hard
   errors still refuse the save.
3. **Simulate**: \`simulate_quote\` for specific homes;
   \`compare_scenarios\` for a side-by-side vs. the active version.
   \`get_simulator_link\` gives the human a customer-look page.
4. **Emit**: \`draft_pricing_payload\` produces the upload artifact
   ({name, note, config}).
5. **Human uploads**: give the JSON to a Sweepr admin. In the admin
   console they open Pricing → Import Payload, paste it, review the
   validation output, then review and publish in Pricing Studio. Only that
   human publish can ever affect customers.

## Hard rules

- Money is INTEGER CENTS; durations are INTEGER MINUTES; rates are bps or
  permille (see sweepr://config-field-guide).
- Do not invent config fields; start from sweepr://payload-template.
- Never claim a change is live: your work products are proposals only.
- Prices you compute are simulations, not quotes to customers.
`;

/** Read one resource by uri; returns null for unknown uris. */
export function readResource(uri: string): { mimeType: string; text: string } | null {
  switch (uri) {
    case "sweepr://payload-template":
      return {
        mimeType: "application/json",
        text: JSON.stringify(buildPayloadTemplate(), null, 2),
      };
    case "sweepr://config-field-guide":
      return { mimeType: "text/markdown", text: CONFIG_FIELD_GUIDE };
    case "sweepr://workflow":
      return { mimeType: "text/markdown", text: WORKFLOW_GUIDE };
    default:
      return null;
  }
}
