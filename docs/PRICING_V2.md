> Copyright © 2026–Present ClearKey Solutions, LLC.
> Proprietary & Confidential. Internal Use Only.

# Pricing v2 — architecture, formula, admin guide, rollout

## Why

The audit (2026-08-20) found FIVE parallel pricing formulas. Only one — the
room-condition engine in `packages/utils/src/roomPricing.ts` — prices real
bookings; the client preview (`calculateQuote`) uses a *different* formula, the
admin simulator simulates an engine that never runs, the approval machine
governs an engine that doesn't price bookings, and the live config is an
ungoverned `PUT` to `site_settings`. Pricing v2 replaces all of that with ONE
authoritative, versioned, explainable quote service.

## The authoritative path

```
customer wizard ──► POST /bookings/quote ─┐
checkout        ──► POST /bookings        ├─► computeBookingPricing()
support/admin   ──► /admin/pricing-v2/preview ─┐        │
                                               ▼        ▼
                              apps/api/src/lib/quoteEngine/
                                engine.ts  computeQuoteV2(config, input)
                                inference.ts (ordinal room model)
                                service.ts (active version + snapshots)
```

- `pricing_versions` — immutable published configs (draft → scheduled/active →
  superseded/archived; partial unique index = one Active per area+currency).
- `pricing_quotes_v2` — an immutable snapshot of every quote (input, full
  result, fingerprint, expiry); bookings reference `pricing_version_id` +
  `pricing_quote_v2_id`.
- `pricing_audit_events` — append-only workspace trail.

**Rollout gate:** v2 prices customers ONLY while a version is Active. No
active version (or any internal v2 failure) → the pre-existing engine chain
runs unchanged. Publishing turns v2 on; archiving the active version turns it
off. Deploying the code changes nothing by itself.

**Measurement rules:** money is integer cents (rates in cents/bps/permille);
durations are integer minutes; probabilities exist only inside the inference
step and convert to minutes at one rounding boundary before any currency math.

## The formula (worked example)

Scenario: 3 bed / 2 bath / 1 kitchen / 1 living, all reported Level 2,
1,600 sq ft, no extras, cold-start config ($60/labor-hour).

1. **Inference.** All four selections equal → consensus rule: every counted
   room is exactly Level 2.
2. **Condition minutes** (labor matrix): kitchen 40 + 2×bathroom 32 +
   3×bedroom 20 + living 25 = 189.
3. **Clutter** 0 · **Size**: 1600−900 = 700 sq ft over → ⌈700/100⌉×4 = 28 min.
   **Operational**: 10+10 setup/pack-down + 6×2 transitions = 32 min.
4. **Expected labor** = 189+28+32 = **249 min** (the single float→int boundary).
5. **Money**: labor 249×6000/60 = 24 900¢ + fixed visit 4 900¢ = 29 800¢ →
   tax 8.25% = 2 459¢ → 32 259¢ → charm-round up to end in 9 → **$329.00**.
6. **Payout** (independent): 249×3900/60 = 16 185¢ = $161.85.
7. **Scheduling**: 75th-percentile posterior labor, rounded up to 15 min →
   255 min reserved; team of 2 above 240 min; elapsed ≈ 255/1.8 = 142 min.

Every component lands in `components[]` with code/label/minutes/cents; the
`calculationFingerprint` (FNV-1a over version id + canonical input) makes
identical inputs provably identical.

### Mixed-signal inference (spec §5.2)

One reported MAXIMUM per room type; other same-type rooms are latent.
Cumulative-logit ordinal model with latent whole-home tendency H (discrete
Gaussian grid): `P(L≤k|H) = σ(θ[t,k] − β[t]·H)`. The reported maxima enter
through the exact order-statistic likelihood `F(s)^N − F(s−1)^N`; expected
counts per level use the exact conditional formulas, truncated above the max,
renormalized to N, ≥1 at the max, integrated over the posterior on H.

Two product rules complete the math:
- **Consensus** (spec): all types report q → every room is q.
- **Floor** (companion rule): no room is estimated below the lightest level
  reported anywhere in the home. This is what makes labor monotone in every
  reported level (raising one type from an all-2 consensus can no longer
  *lower* other types' estimates) while leaving the spec's flagship case —
  bathrooms L4, everything else L1 — fully probabilistic.

The customer is charged EXPECTED labor; the scheduling reserve (percentile +
optional buffer) is capacity planning and is never billed.

## Admin guide (Pricing Studio, admin → Money → Pricing Studio)

1. **New draft** starts from the current live pricing translated into minutes
   (see below) — customers unaffected.
2. Edit **Room labor** (minutes per room per condition; click a cell for the
   price effect), **Clutter & size**, **Extras** (overlap groups prevent
   double-billing), **Rates & payout** (every field carries its unit),
   **Scheduling**.
3. **Prediction** simulates how one answer per type spreads across room
   counts (the 4bd/3ba all-L4 and bathrooms-only-L4 checks live here).
   Advanced model settings hide behind `content.pricing.advanced_model`.
4. **Test quote** runs the PRODUCTION engine server-side (never a UI copy).
5. **Review & publish**: validation gate, big-change warnings, before/after
   reference scenarios, required change summary, publish now or schedule
   (UTC). Publish permission = `content.pricing.publish`.
6. **History**: every version + append-only audit log. Rollback = clone an
   older version → validate → publish. Published versions are immutable.
7. Emergency exit: archive the Active version → v2 off, legacy pricing back.

Existing bookings always keep their original quote snapshot.

## Cold-start translation (requires Caleb's approval before publishing)

Chosen rate $60/labor-hour makes $1 of current pricing = 1 minute, so the
live condition adders translate exactly into minute deltas; see
`apps/api/src/lib/quoteEngine/defaults.ts` for the full table. Run the shadow
report any time:

```
npx vitest run apps/api/tests/pricing-v2-shadow.test.ts
```

Current cold-start vs live engine across the 20-scenario grid: −8% to +38%
(heavy-condition homes price higher because per-room labor is now charged for
EVERY room, not just the worst one per type — the old engine's biggest
underpricing).

### Assumptions needing business approval

| Assumption | Value | Notes |
| --- | --- | --- |
| Customer labor rate | $60 / labor-hour | anchor of the whole translation |
| Level-1 base room minutes | K25 / B20 / Bed12 / L15 | old model had no per-room base |
| Fixed service visit | $49 | replaces the $89 base fee + 10% service fee |
| Operational minutes | 10+10+2/room | new concept |
| Cleaner payout | $39 / labor-hour (~65%) | independent knob |
| Minimum booking | $99 | old engine had none explicit |
| Auto-quote limit | $1,000 | above → manual review |
| Scheduling percentile / buffer | 75th / 0% | capacity, not billed |
| Clutter minutes + 50% unobserved factor | see defaults | new concept |
| Emergency surcharge | 15% | matches live |
| Tax 8.25%, ending-9 rounding | unchanged | |
| Five formerly $0 add-ons now priced | garage/patio/walls/extra-bath/organization | live engine bug |
| Effective date & areas | default/USD single market | |

## Migration state & follow-ups

Done: schema (097), engine + inference, booking/quote/checkout integration
behind the activation gate, Studio UI + API, permissions, tests (36 engine +
13 service/routes + shadow), this doc.

Deliberately NOT yet removed (spec §10.10 — only after all callers use v2):
- Legacy engines B–E and their routes (they still serve `/pricing/quote`,
  subscriptions, admin simulator until cutover).
- The legacy admin Pricing page (kept for the legacy engines; Studio is the
  v2 workspace).
- Client-side `calculateQuote` previews (the wizard's authoritative number is
  already server-side; PaymentStep's client fallback is flagged in the
  end-to-end review).

Post-activation cleanup list: repoint `/pricing/quote` + marketing calculator
at v2 preview, delete Engines B/C/D/E, fold the legacy pricing tabs, port the
scope-review "cleaning level" surcharge semantics into scope-change flows.

## Calibration (spec §9)

`pricing_quotes_v2.result` retains the full posterior breakdown per booking;
actual labor lands via day-of-service check-in/out. Fitting improved matrices
is an OFFLINE analysis producing a proposed DRAFT — training never touches
live pricing. Accuracy metrics to track once volume exists: MAE/median error,
±15%/±30% hit rates, underestimation rate by segment, interval coverage.
