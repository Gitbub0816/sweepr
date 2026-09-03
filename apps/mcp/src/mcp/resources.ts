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
import {
  COURSE_COMPLETION_RULE_TYPES,
  COURSE_SLIDE_TYPES,
  describeCourseBlockProps,
  PROMO_CTA_ACTIONS,
  PROMO_CLAIM_ACTIONS,
  PROMO_REQUIRE_FIELDS,
  PROMO_CLAIMANTS,
  PROMO_CTA_STYLES,
  PROMO_PAGE_MODES,
  PROMO_BLOCK_TYPES,
  PROMO_THEMES,
  PROMO_MAX_PAGES,
  PROMO_MAX_CTAS_PER_PAGE,
  PROMO_CODE_MAX_BYTES,
} from "@sweepr/utils";

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
    description:
      "The explore → sandbox → simulate → human-loads-in-Studio operating guide (sandbox configs auto-appear in Pricing Studio → Proposals).",
    mimeType: "text/markdown",
  },
  {
    uri: "sweepr://promotions-design-guide",
    name: "Promotion design (PromoDesignV2) field guide",
    description:
      "The full multi-page, multi-CTA, code-mode promotion design shape — every field, the four page modes, the CTA action vocabulary, and worked examples — for list_promotions / get_promotion / save_promotion_draft / preview_promotion / publish_promotion.",
    mimeType: "text/markdown",
  },
  {
    uri: "sweepr://promotions-mcp-exception",
    name: "Why promotions can publish (read this first)",
    description:
      "The ONE deliberate exception in this MCP worker: publish_promotion writes directly to live, customer-facing data. What that tool guarantees before it does, and why every other tool in this worker (including every OTHER promotions tool) stays sandboxed or read-only.",
    mimeType: "text/markdown",
  },
  {
    uri: "sweepr://courses-design-guide",
    name: "Course Builder (v2 training) field guide",
    description:
      "The full slide/block shape for Course Builder v2 training courses — every block type, its props, the 16:9 percentage-based canvas coordinates, and worked examples — for list_courses / get_course / save_course_draft / preview_course / publish_course.",
    mimeType: "text/markdown",
  },
  {
    uri: "sweepr://courses-mcp-exception",
    name: "Why courses can publish, and the legacy-module cutover (read this first)",
    description:
      "The SECOND deliberate exception in this MCP worker: publish_course writes directly to live training content AND deactivates the legacy module it replaces. What that tool guarantees before it does, and how the one-module-at-a-time cutover works.",
    mimeType: "text/markdown",
  },
];

export const PROMOTIONS_MCP_EXCEPTION = `# Why promotions can publish — read this before calling publish_promotion

Every OTHER write tool in this MCP worker — every pricing tool, and three of
the five promotions tools (\`list_promotions\`, \`get_promotion\`,
\`preview_promotion\` are pure reads; \`save_promotion_draft\` writes but ONLY
to rows that stay \`status='draft'\`, which a customer never sees) — is
quarantined. Nothing you do with them can ever reach a customer without a
human admin reviewing and clicking Publish somewhere in the admin console.

**\`publish_promotion\` breaks that pattern on purpose.** It sets an existing
promotion's \`status\` directly (default \`'active'\`), and an active promotion
within its display window is what a customer's browser fetches and renders
right now, with no console step in between. The product owner asked for
exactly this — an LLM that can draft AND ship a promotion widget through
this MCP — as the one deliberate exception to how every other feature in
this worker is quarantined.

## What \`publish_promotion\` guarantees, every single call

1. **Re-verifies your admin role from the database at call time.** Every
   other tool call in this worker trusts the admin email baked into your
   OAuth session token. This one tool doesn't — it re-reads your CURRENT
   role from \`users\` before doing anything, so a demoted or deactivated
   admin loses publish access on their very next call, not at their next
   sign-in.
2. **Validates any design with the exact schema the admin console uses** —
   \`packages/utils/src/promoSchema.ts\`'s constants, the SAME page-count
   (max ${PROMO_MAX_PAGES}), CTA-count-per-page (max ${PROMO_MAX_CTAS_PER_PAGE}),
   code-mode byte cap (${PROMO_CODE_MAX_BYTES.toLocaleString()} bytes,
   html+css+js combined), \`goto_page\` target existence, and \`requireField\`
   sanity checks apps/api/src/routes/adminPromotions.ts enforces. No design
   this tool accepts is less validated than one a human typed into the
   console.
3. **Never loosens the code-mode sandbox.** A code-mode page still renders
   in an iframe with \`sandbox="allow-scripts"\` and NO \`allow-same-origin\` —
   see \`packages/utils/src/promoSandbox.ts\`'s docblock for why that's the
   real isolation boundary. That attribute isn't a parameter anywhere in
   this tool; there is no way to call \`publish_promotion\` and get a looser
   sandbox than the console would produce.
4. **Writes an audit trail you can't skip.** Every tool call already writes
   a generic entry to \`mcp_action_log\`. \`publish_promotion\` ALSO writes to
   \`admin_audit_log\` (action \`promotion.published_via_mcp\`) — the exact
   table and shape a console-driven promotion change writes to, so it shows
   up next to console changes in the SAME audit trail an admin already
   reviews, not a separate log they have to remember exists.
5. **Stamps provenance.** \`created_via = 'mcp'\` on the row — the admin
   promotions list flags these with a robot icon, so nothing you publish is
   silently indistinguishable from a console-authored promotion.

## What this means for you as the connected assistant

- Treat \`publish_promotion\` with the same weight a human clicking "Activate"
  in the console would carry — it is genuinely live the moment it returns.
- Prefer the loop: \`get_promotion\` (or start blank) → iterate the design
  with \`save_promotion_draft\` (inert — a draft is never customer-facing) →
  \`preview_promotion\` to sanity-check pages/CTAs/code srcdoc → only then
  \`publish_promotion\`. Don't skip straight to publish on a first draft
  unless the human explicitly asked you to.
- Never claim you "asked a human to review it first" if you didn't — a
  human account holder is the one whose credentials authorized this session,
  but pressing publish yourself is still YOUR action; say so plainly when
  you report back what you did.
- This exception is scoped to promotions ONLY. Do not generalize "the MCP
  can publish X" to any other feature — every other tool in this worker
  (and any future one) stays sandboxed/proposal-only unless a human product
  decision creates another deliberate, documented exception exactly like
  this one.
`;

export const PROMOTIONS_DESIGN_GUIDE = `# Promotion design (PromoDesignV2) field guide

A promotion is a multi-page, multi-CTA widget. Every promotions tool speaks
this shape (\`packages/utils/src/promoSchema.ts\` is the source of truth for
every enum below — apps/api's admin API, this MCP, and the admin designer
all build their validation from the SAME constants).

\`\`\`
PromoDesignV2 = {
  version: 2,
  theme?: ${JSON.stringify(PROMO_THEMES)},
  accent?: string,        // css color, e.g. "#0f766e"
  background?: string,    // css color/gradient
  entryPageKey: string,   // which page.key shows first
  pages: PromoPageV2[],   // 1..${PROMO_MAX_PAGES}
}

PromoPageV2 = {
  key: string,             // unique within the promotion; letters/digits/-/_ only
  name?: string,           // admin-facing label, e.g. "Alternate offer"
  mode: ${JSON.stringify(PROMO_PAGE_MODES)},
  theme?, background?, accent?,   // per-page overrides of the design-level defaults
  blocks?: PromoBlockV2[],        // used when mode = 'blocks'
  canvas?: { aspect?, background?, backgroundImage?, elements: [...] },  // mode = 'canvas'
  poster?: { src: string, hotspots?: [...] },                            // mode = 'poster'
  code?: { html: string, css?: string, js?: string },                    // mode = 'code'
  ctas: PromoCtaV2[],      // 0..${PROMO_MAX_CTAS_PER_PAGE} buttons, rendered below the content
}

PromoCtaV2 = {
  id: string,               // unique within the WHOLE promotion, not just the page
  label: string,
  action: ${JSON.stringify(PROMO_CTA_ACTIONS)},
  style?: ${JSON.stringify(PROMO_CTA_STYLES)},   // visual weight; default 'primary'
  url?: string,              // required for action='link'; optional redirect for 'book_now'
  requireField?: ${JSON.stringify(PROMO_REQUIRE_FIELDS)},
  claimants?: ${JSON.stringify(PROMO_CLAIMANTS)},
  successMessage?: string,
  targetPageKey?: string,    // required for action='goto_page' — must be another page's key
}
\`\`\`

## Page modes (mutually exclusive per page — pick ONE and fill its field)

- **blocks** — a stack of simple content blocks, in order: ${JSON.stringify(PROMO_BLOCK_TYPES)}.
  Each block: \`{type, text?, src? (image), alt?, items? (bullets), align?, size? (heading only)}\`.
  This is the easiest mode for a straightforward offer.
- **canvas** — a free-form, PowerPoint-style single slide: positioned text,
  images, shapes, and BUTTON elements (each button carries its OWN embedded
  \`PromoCtaV2\`, same shape as above — so a canvas button can \`goto_page\` too).
  Geometry is percent-of-canvas. Best for a designed, on-brand hero moment.
- **poster** — the whole page is one uploaded image with interactive
  hotspot regions drawn on top; each hotspot carries its own \`PromoCtaV2\`.
  Best when the content itself is a finished graphic.
- **code** — raw \`{html, css?, js?}\` you (or an admin) fully control,
  rendered in a SANDBOXED iframe (\`sandbox="allow-scripts"\`, no
  \`allow-same-origin\` — see \`sweepr://promotions-mcp-exception\` and
  \`packages/utils/src/promoSandbox.ts\`). Combined html+css+js is capped at
  ${PROMO_CODE_MAX_BYTES.toLocaleString()} bytes. Use \`preview_promotion\` to
  get back the exact assembled srcdoc before publishing.

## CTA actions

- \`claim\` — records a claim (grants the promotion's reward, if any).
- \`newsletter\` / \`waitlist\` — same as claim, plus a subscriber/waitlist row.
  **Must set \`requireField: "email"\`** — an email is the whole point of
  these two actions; any other value is a validation error.
- \`book_now\` — claim, then optionally redirect to \`url\` (pair with a
  reward's \`offerMinutes\` for a flash-offer countdown).
- \`link\` — opens \`url\` in a new tab. \`url\` is required.
- \`goto_page\` — client-side navigation to another page in the SAME
  promotion, by \`targetPageKey\`. This is how a promotion offers "see an
  alternate design" or a multi-step flow. \`targetPageKey\` is required and
  must match another page's \`key\` (checked at save/publish time).
- \`dismiss\` — closes the widget. No fields.

Claim-eligible actions (${JSON.stringify(PROMO_CLAIM_ACTIONS)}) are the ones
that record a \`promotion_claims\` row — this applies no matter which page or
which of a page's several CTAs the visitor clicked.

## A minimal one-page example

\`\`\`json
{
  "version": 2,
  "theme": "brand",
  "accent": "#0f766e",
  "entryPageKey": "page-1",
  "pages": [{
    "key": "page-1",
    "name": "Main offer",
    "mode": "blocks",
    "blocks": [
      { "type": "heading", "text": "20% off your first clean", "align": "center", "size": "xl" },
      { "type": "text", "text": "New customers only. Applies automatically at checkout.", "align": "center" }
    ],
    "ctas": [
      { "id": "cta-1", "label": "Claim my discount", "action": "claim", "requireField": "email", "style": "primary", "successMessage": "You're set — the discount is on its way." }
    ]
  }]
}
\`\`\`

## A two-page example using goto_page

Page 1 offers the deal with a "See an alternate design" button; page 2 is a
different look at the same offer, with a "Back" button:

\`\`\`json
{
  "version": 2,
  "entryPageKey": "classic",
  "pages": [
    {
      "key": "classic", "name": "Classic", "mode": "blocks",
      "blocks": [{ "type": "heading", "text": "20% off your first clean", "align": "center" }],
      "ctas": [
        { "id": "cta-1", "label": "Claim my discount", "action": "claim", "requireField": "email", "style": "primary" },
        { "id": "cta-2", "label": "See an alternate design", "action": "goto_page", "targetPageKey": "alt", "style": "link" }
      ]
    },
    {
      "key": "alt", "name": "Alternate", "mode": "blocks",
      "blocks": [{ "type": "heading", "text": "First clean, 20% off", "align": "center" }],
      "ctas": [
        { "id": "cta-3", "label": "Claim my discount", "action": "claim", "requireField": "email", "style": "primary" },
        { "id": "cta-4", "label": "Back", "action": "goto_page", "targetPageKey": "classic", "style": "ghost" }
      ]
    }
  ]
}
\`\`\`

Call \`preview_promotion\` with a candidate design (or a saved draft's id) to
see the navigation graph and, for any code-mode page, the exact sandboxed
srcdoc before you \`publish_promotion\`.
`;

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

## How cleaners are actually paid (and how pricing relates)

**Cleaners are NOT paid hourly, and nothing in this config sets their pay.**
The real pay model, verified in the payout code
(\`apps/api/src/lib/payoutEngine.ts\`, applied at capture in
\`apps/api/src/routes/payments.ts\`):

- The standard booking split is **70% to the cleaner/team pool and 30% to
  Sweepr — the Marketplace Services Fee** (founding-cleaner bonuses are
  Sweepr-funded on top; the fee is configured in Platform Fees settings, not
  here). Structural discounts (e.g. the Airbnb repeat/volume discounts)
  reduce the service price BEFORE the 70/30 split.
- **Tips are 100% to the cleaner, outside the split** — no Marketplace
  Services Fee on tips, ever.
- A bigger customer price therefore means a bigger cleaner payout,
  automatically. There is no hourly wage anywhere in the system.

How this config relates:
- \`rates.customerLaborRateCentsPerHour\` is a **pricing-model input**: a cost
  per ESTIMATED labor-hour used to translate estimated labor minutes into a
  CUSTOMER price. It is not a wage and no cleaner ever receives it.
- The \`payout\` block is an **internal planning estimate** used only for
  margin validation and capacity economics; no payout transfer reads it.

Never tell anyone (or let a summary imply) that cleaners "earn $X/hour"
because of this config.

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
- \`customerLaborRateCentsPerHour\`: integer cents per ESTIMATED labor-hour,
  charged to the CUSTOMER. **Bounds: 2000–25000** ($20–$250). Modeling input
  only — cleaner compensation is 70% of captured proceeds regardless of this
  number (see "How cleaners are actually paid" above).
- \`fixedServiceCents\`: flat per-booking amount, own line item.
- \`minimumBookingCents\`: **minimum job total**, integer cents (optional;
  absent or 0 = no minimum; must be ≤ maxAutoQuoteCents). This is how you
  express "an hourly rate PLUS a minimum" — e.g. rate 2500 with minimum 4000
  means $25/labor-hour but never less than $40 per job. Where it clamps: it
  floors the ENTIRE pre-tax subtotal (labor + fixed visit + extras, after the
  zip-area and short-notice adjustments), BEFORE tax and charm rounding — so
  the customer total is never below minimum + tax, and every dollar the
  customer spends on the visit counts toward the minimum. When it bites, the
  quote result carries a \`policy.minimum\` breakdown component with the
  top-up amount and sets \`minimumApplied: true\` (also surfaced in
  \`simulate_quote\`'s customerSummary).
- \`maxAutoQuoteCents\`: quotes above this require manual review.
- \`taxRateBps\`: 0–2000 bps.
- \`roundTotalUpToEndingDigit\`: charm rounding — round the total UP so its
  dollar part ends in this digit (0–9), or null = off.
- \`emergencySurchargeBps\`: the LEGACY single short-notice (<48h) surcharge,
  0–5000 bps. When \`extendedRules.shortNotice.tiers\` is configured it is
  superseded — the legacy field then represents only the <24h tier's
  historical magnitude and the tiers do the pricing.
- \`extraCleanerFeeCentsPer100Sqft\`: flat fee in INTEGER CENTS per 100 sqft,
  charged ONLY when the customer opts to add one extra cleaner for speed.
  Whole cents ≥ 0, max 5000 ($50) per 100 sqft. Default 100 ($1) per 100 sqft.
  It is a customer-elected line item, never a multiplier on the whole price by
  crew size, and it never touches labor minutes or cleaner payout.

## payout
**Internal planning estimate — NOT how cleaners are paid.** Cleaners are not
paid hourly; the cleaner/team pool receives 70% of captured booking proceeds
(the 30% Marketplace Services Fee is Sweepr's share), plus 100% of tips
outside the split (see "How cleaners are actually paid" above). This block
only models an estimated cost-of-labor figure used for margin validation
(the validator rejects configs whose modeled payout meets or exceeds the
pre-tax subtotal) and planning; no payout transfer reads it.
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

## extendedRules (formatVersion 2 — multi-service pricing)

Optional block that turns the config into the full multi-service ruleset.
Omit it entirely for a legacy standard-only config (which prices exactly as
before). The \`SweeprExtendedPricingRuleset\` wrapper (\`{ format,
formatVersion, config, extendedRules }\`) is accepted as-is by
\`set_simulator_config\` and flattened for storage; every section — including
ones the engine does not consume — is preserved verbatim and round-trips
through storage, Studio, and this sandbox untouched.

- \`moveInOut\`: \`basePriceMatrixCents\` keyed by BR/BA (e.g. \`"3BR_2BA":
  41900\`), \`conditionMultipliersPercent\` L1–L4 (percent added to the base),
  \`oversizedHomeGuardrail.priceCentsPerAdditional250Sqft\` (charged when the
  home is unusually large for its room count). NO standard size scaling.
  Missing BR/BA combos resolve to the nearest entry with a quote warning.
- \`airbnbSTR\`: \`basePriceMatrixCents\` (\`"Studio_or_1BR_1BA"\` covers
  studios), \`sizeGuardrail.includedSqftByBedroomCount\` + cents per 250 sqft
  above it, \`dirtinessAdjustmentPercent\` (L1/L2 0, L3 +20, L4 +35 — applied
  to base + guardrail), \`staffingMatrix\` (BR/BA → cleaners at L1–L4),
  \`turnoverWindow\` rules (<4h manual review + staff-up; 4h borderline adds
  one; 5h default; 6h+ may reduce one for borderline L1/L2, never L3/L4),
  \`repeatVolumeDiscounts\` (2nd+ turnover at the SAME property 5%; host with
  10+ completed turnovers in 30 days 10%; highest only, never stacking; base
  service + size guardrail only; applied BEFORE the 70/30 split — the
  service adapter resolves the actual history), and
  \`scopeAndSuppressionRules\` (bed making, dishwasher load, and the basic
  patio sweep are included in the turnover base — those add-ons suppress to
  $0; garage sweep, interior windows, window tracks, and the sliding door
  detail remain paid).
- \`deepClean\`: auto-classification for the STANDARD path — triggers: ≥1
  level-4 room, OR ≥2 level-3 rooms, OR ≥40% of counted rooms at level 3/4;
  add-ons never trigger it. Effect: \`baseWorkloadMultiplierPercent\` (+10%)
  on the BASE cleaning workload only (purchased add-ons excluded), NO
  separate customer-facing surcharge line, and \`deepCleanApplied: true\` on
  the result so the app labels the booking "Deep Clean".
- \`shortNotice.tiers\`: <24h +15%, 24–48h +5%, >48h 0% — exactly one tier
  ever applies (never stacking); supersedes \`emergencySurchargeBps\`.
- \`locationPricing\`: ZIP tiers 0/+5/+10 with \`initialCapPercent\` (10).
  The existing zip-multiplier table feeds v2 automatically; with tiers
  active, legacy NEGATIVE zip rows are superseded (clamped to 0).
- \`manualReview.triggerIfAny\`: sqft ≥ 4000, computed price ≥
  maxAutoQuoteCents, obstructed/hoarding clutter, the unsafe-conditions
  list, and the arrival-mismatch flag (set day-of-service, never at quote
  time). Flagged quotes block instant auto-booking and route to review.
- \`extrasAppSideOverrides\`: laundry $25/load (max 2) with 25 min ACTIVE
  labor per load — machine cycle time never blocks the cleaner nor bills as
  labor (the result's \`laborScheduling\` separates activeLaborMinutes,
  machineElapsedMinutes, and onSiteMinutes = max of cleaning elapsed and
  cycle completion); Light Tidying activated at $25 per 30-minute block
  (30 min scheduled, price decoupled from the labor rate); inside oven $40
  fixed with 35 min active labor; sliding glass door $20 including its track
  (a duplicate window-track charge is suppressed); basic patio sweep vs
  patio + cobweb detail are mutually exclusive; bed linens vs laundry cannot
  double-charge; pet hair prices via percentage tiers 5/15/25% of the base
  workload (\`petHair\` input: light | moderate | heavy) instead of the flat
  placeholder.
- \`payoutAndMarketplaceEconomics\`: documents the 70/30 split and supplies
  team productivity (e.g. three-cleaner 2500 permille) merged into the
  resolved scheduling map.

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

## The loop: explore → sandbox → simulate → human loads in Studio

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
4. **Human loads it in the Studio**: every stored sandbox config
   automatically appears in the admin console under Pricing Studio →
   Proposals. The admin clicks "Load into Studio" and gets a DRAFT with
   every field pre-filled and individually editable, which then goes through
   the normal validate → test-quote → publish pipeline. (Alternative:
   \`draft_pricing_payload\` emits the raw {name, note, config} JSON for the
   Pricing → Import Payload paste path.) Only that human review-and-publish
   can ever affect customers — you cannot import, draft, or publish pricing
   versions yourself.

## Hard rules

- Money is INTEGER CENTS; durations are INTEGER MINUTES; rates are bps or
  permille (see sweepr://config-field-guide).
- Do not invent config fields; start from sweepr://payload-template. The
  master SweeprExtendedPricingRuleset wrapper imports as-is; its
  extendedRules block (Move-In/Out, Airbnb/STR, deep clean, short-notice
  tiers, location tiers, extras overrides) is preserved verbatim.
- Never claim a change is live: your work products are proposals only.
- Prices you compute are simulations, not quotes to customers.
- **Cleaners are NOT paid hourly.** The standard split pays the cleaner/team
  pool 70% of captured booking proceeds; the 30% Marketplace Services Fee is
  Sweepr's share; tips are 100% to the cleaner outside the split. The
  config's labor rate prices CUSTOMERS from estimated minutes and its payout
  block is a planning estimate — never describe either as cleaner wages (see
  the field guide's "How cleaners are actually paid").
`;

export const COURSES_MCP_EXCEPTION = `# Why courses can publish — read this before calling publish_course

Every other write tool in this MCP worker is quarantined — every pricing
tool, and both of the OTHER promotions/courses write tools that stay
draft-only (\`save_promotion_draft\`, \`save_course_draft\`). Nothing you do
with them can ever reach a cleaner without a human clicking Publish
somewhere in the admin console.

**\`publish_course\` breaks that pattern on purpose**, the same way
\`publish_promotion\` does (see sweepr://promotions-mcp-exception) — the
product owner made the same explicit, human decision for training content.
It sets an existing course's current draft version to \`'published'\`
directly, no console step required, then clones it forward into a fresh
editable draft exactly like the console's own Publish button.

## Guardrails, every call
1. **Role re-verified from the database, right now** — not just your
   session token's claim from when you signed in. A demoted or deactivated
   admin loses publish access on their very next call.
2. **Audited** — writes an \`admin_audit_log\` row (action
   \`course.published_via_mcp\`) alongside the standard MCP action log, so a
   publish via this tool shows up next to console changes in one place.

## The cutover — the actual point of this tool
If the course has \`replaces_module_id\` set (only settable when you create
it with \`save_course_draft\`), publishing does ONE MORE THING in the same
write: it deactivates that legacy \`training_modules\` row. From that
instant:
- The legacy module stops appearing anywhere a cleaner sees it — the
  Academy module list, the required-training count, the background-check
  reminder — because every one of those queries already filters to
  \`active = true\`. Nothing else had to change to make it "die."
- This course counts toward required training IN THE MODULE'S PLACE (see
  apps/api/src/lib/trainingCompletion.ts) — a cleaner who already finished
  it counts as done; one who hasn't now sees this course as what's left.

**One module at a time is completely normal.** Publishing a course only
ever touches the ONE legacy module it names (or none, if
\`replaces_module_id\` was never set — a brand-new required module with no
legacy counterpart). A legacy module nothing has replaced yet stays exactly
as it is, indefinitely. There is no requirement to migrate everything
before any of it takes effect.

If you ever publish a course, un-publish it (an admin reverting
\`courses.status\` back to draft/archived in the console), or delete it, the
legacy module's active state is re-derived every time — it comes back the
moment nothing published still claims to replace it.
`;

export const COURSES_DESIGN_GUIDE = `# Course Builder (v2 training) field guide

A course is a versioned, slide-based lesson — PowerPoint-style — that a
cleaner works through top to bottom. \`save_course_draft\` and
\`get_course\`/\`preview_course\` round-trip this shape.

## Course-level fields
- \`title\`, \`description?\`, \`category?\` — plain metadata.
- \`required\` — whether this counts toward the cleaner's required-training
  total (see sweepr://courses-mcp-exception). Defaults true on create.
- \`replaces_module_id\` — CREATE-ONLY. The legacy \`training_modules.id\`
  (from \`list_courses\`'s \`legacyModules\`) this course will replace once
  published. Leave unset for a standalone new requirement with no legacy
  counterpart. Cannot be changed after creation — not even the admin
  console can do that; create a new course if you got it wrong.

## Slides
Each slide: \`{ title?, slide_type?, slide_order, background?,
completion_rule?, blocks: [...] }\`.
- \`slide_order\` controls sequence (0-indexed).
- \`slide_type\`: ${COURSE_SLIDE_TYPES.map((t) => `\`"${t}"\``).join(" | ")}.
- \`background\`: \`{ color?: "#ffffff" }\` — that one key, nothing else.
- \`completion_rule\`: \`{ type }\`, one of
  ${COURSE_COMPLETION_RULE_TYPES.map((t) => `\`"${t}"\``).join(" | ")}.
  Defaults to \`{ type: "viewed" }\`. NOTE: none of these are enforced by
  the player yet — advancing past a slide is always enough today.

## Blocks — positioned on a 16:9 canvas, coordinates as PERCENTAGES (0-100)
Every block: \`{ block_type, x, y, width, height, z_index?, props }\`.
\`x\`/\`y\` are the top-left corner, \`width\`/\`height\` the size, all as a
percent of the slide canvas — e.g. \`{x:8, y:8, width:84, height:20}\` is a
banner near the top spanning almost the full width.

**Props are validated on write, per block type, against the table below** —
which is generated from the same source the admin editor and the learner
player read (\`packages/utils/src/courseSchema.ts\`), so it cannot drift
from what actually renders. An unknown key or a wrong value type is
REJECTED by \`save_course_draft\` / \`publish_course\` rather than stored.
Two mistakes this specifically catches, both of which used to save happily
and then render blank or crash the learner's slide:

- \`{text: "…"}\` on a text/heading block. The key is **\`content\`**.
- \`items: [{text: "…"}]\` on a checklist. Items are **plain strings**.

Every prop is optional — a block with \`props: {}\` renders its defaults.

${describeCourseBlockProps()}

If you are ever unsure of the shape, build one slide by hand in the admin
editor and read it back with \`get_course\`: its \`slides\` come back in
exactly the shape \`save_course_draft\` accepts, so you can copy a
known-good structure rather than guess.

## Workflow
1. \`list_courses\` to see what exists (courses + the legacy modules array,
   so you can see which legacy modules still need a v2 replacement).
2. \`save_course_draft\` to create (with slides inline, or empty and filled
   in with a follow-up call) or keep iterating on an existing draft. If it
   rejects a block, the error names the block type and the offending key.
3. \`preview_course\` to sanity-check slide/block counts, quiz question
   counts, and \`propIssues\` (blocks stored before write validation
   existed) before publishing.
4. \`publish_course\` — see sweepr://courses-mcp-exception first.
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
    case "sweepr://promotions-design-guide":
      return { mimeType: "text/markdown", text: PROMOTIONS_DESIGN_GUIDE };
    case "sweepr://promotions-mcp-exception":
      return { mimeType: "text/markdown", text: PROMOTIONS_MCP_EXCEPTION };
    case "sweepr://courses-design-guide":
      return { mimeType: "text/markdown", text: COURSES_DESIGN_GUIDE };
    case "sweepr://courses-mcp-exception":
      return { mimeType: "text/markdown", text: COURSES_MCP_EXCEPTION };
    default:
      return null;
  }
}
