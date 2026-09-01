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
 * @sweepr/quote-engine — the pure Pricing v2 quote engine (formatVersion 2:
 * multi-service-type — standard residential, Move-In/Out, Airbnb/STR).
 *
 * Extracted from apps/api/src/lib/quoteEngine so the engine can be shared by
 * the API worker and the MCP pricing-sandbox worker (apps/mcp) without
 * duplicating money logic. Everything here is a pure function of
 * (config, input): no DB, no env, no side effects. The DB-bound pieces
 * (quoteAndPersist, the booking adapter, the airbnb discount history
 * queries) remain in the API.
 *
 * ── STAFFING / PRODUCTIVITY INTERFACE CONTRACT (for the crew engine) ──────
 *
 * The crew/staffing agent consumes exactly these exports — treat them as a
 * stable API:
 *
 *  - `resolveTeamProductivityPermille(config)` → Record<teamSize, permille>.
 *    The config's scheduling.teamProductivityPermille merged with the team
 *    sizes the marketplace-economics section adds, e.g. `"3": 2500` from
 *    extendedRules.payoutAndMarketplaceEconomics.threeCleanerProductivityPermille.
 *    Explicit scheduling entries always win. 1000 permille = one cleaner's
 *    throughput; elapsed(team) = ceil(scheduledLaborMinutes × 1000 / permille).
 *
 *  - `QuoteResultV2.requiredTeamSize` → the team size the job requires:
 *      · standard / moveInOut: 2 when scheduledLaborMinutes exceeds
 *        scheduling.twoPersonThresholdMinutes, else 1;
 *      · airbnb: the staffing matrix (BR/BA × condition level) adjusted by
 *        the turnover-window rules — under 4h: +1 cleaner AND the quote is
 *        flagged for manual review (MANUAL_REVIEW_REASONS.TURNOVER_WINDOW);
 *        4h to <5h: borderline jobs (base-team elapsed > 85% of the window)
 *        add one; 5h to <6h: matrix staffing as-is; 6h+: borderline L1/L2
 *        jobs may drop one cleaner when the smaller team still fits in 85%
 *        of the window, NEVER L3/L4 — clamped to the team sizes present in
 *        the resolved productivity map.
 *
 *  - Typed staffing-matrix accessors:
 *      · `getAirbnbStaffingMatrix(config)` → the raw BR/BA → {L1..L4} matrix;
 *      · `getAirbnbStaffing(config, bedrooms, bathrooms, level)` → cleaners
 *        for one combo (nearest-entry resolution);
 *      · `computeAirbnbTeamSize(config, args)` → the full window-adjusted
 *        sizing with review flag and customer-facing notes.
 *
 *  - `QuoteResultV2.laborScheduling` → the labor/scheduling decoupling:
 *    { activeLaborMinutes, machineElapsedMinutes, onSiteMinutes } where
 *    onSiteMinutes = max(cleaning elapsed, laundry machine-cycle completion).
 *    Machine time never blocks a cleaner and is never billed as labor.
 */

export * from "./types";
export * from "./engine";
export * from "./extended";
export * from "./inference";
export * from "./validate";
export * from "./defaults";
