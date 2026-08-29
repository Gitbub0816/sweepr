<!--
  Copyright © 2026–Present ClearKey Solutions, LLC.
  Proprietary & Confidential. Internal Use Only.
-->

# Team Cleans (multi-cleaner crews) — Architecture Audit

**Status:** read-only audit / design source of truth. No source was modified producing this.
**Goal:** extend the existing single-cleaner matching/assignment/day-of-service/payout system to support crews
(1 LEAD/primary + up to N MEMBER/helpers, app-capped by an admin setting, default 3; data model N-ready).
**Guiding constraint:** person-minutes + team efficiency already exist in Pricing v2. We EXTEND, not replace.

Every reference below is `path:line` against the repo at audit time (migrations consolidated into the
generated `packages/db/schema.sql`; raw migrations are truth for the header/naming conventions).

---

## 1. Booking & assignment model (solo, today)

### bookings table (`packages/db/schema.sql:90-120`)
The single-cleaner anchor is one nullable column:

```
cleaner_id UUID REFERENCES cleaners(id)          -- schema.sql:93  (THE solo assignment)
status     TEXT NOT NULL DEFAULT 'draft'         -- schema.sql:95
```
Other relevant columns: `customer_id`, `address_id`, `service_type`, `scheduled_at`, `duration_minutes`,
money (`base_price`, `addons_total`, `service_fee`, `tax`, `total_price`, `platform_fee`, `cleaner_payout` — all cents),
`stripe_payment_intent_id`, `stripe_charge_id`.
Later `ALTER`s add: day-of-service columns (`day_status`, `cleaner_lat/lng`, `arrival_verified_at`, `started_at`,
`completed_at`, `address_revealed_at`, `access_code_revealed_at` — `schema.sql:983-991`),
`estimated_cleaner_payout_cents` (`schema.sql:2726`), `cleaning_level` (`schema.sql:3743`),
`founding_customer_discount_cents`, `zip_pricing_adjustment_cents`, `pricing_version_id`, `pricing_quote_v2_id`
(mig 097, `schema.sql`/`097_pricing_v2.sql:99-100`), `arrival_window_start/end` (mig 064), `pricing_rule_id`, etc.

### assignment_queue table (`packages/db/schema.sql:344-354`) — the offer/cascade queue
```
booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE
cleaner_id  UUID REFERENCES cleaners(id)
offered_at  TIMESTAMPTZ DEFAULT NOW()
expires_at  TIMESTAMPTZ NOT NULL
position    INT NOT NULL                         -- 1 = first offered, cascade order
status      TEXT DEFAULT 'pending'
             CHECK (status IN ('pending','accepted','declined','expired','skipped'))
score       DECIMAL(6,2)
score_breakdown JSONB
```
Added later (mig 074, `074_cleaner_service_area_and_declines.sql`): `declined_free BOOLEAN`, `responded_at TIMESTAMPTZ`
(used in `assignment.ts:247-261`). `ON DELETE CASCADE` on cleaner added mig 072.
There is also a legacy, **unused** `job_offers` table (`schema.sql:130-138`) — not part of the live flow; the live flow is `assignment_queue`.

### Solo assignment lifecycle (code)
`apps/api/src/lib/assignment.ts` + `apps/api/src/lib/matching.ts`:

1. **Payment captured → kickoff.** Stripe webhook `payment_intent.succeeded` sets booking `booked`, creates the
   `payout_ledger` row, then calls `initiateAssignment(sql, bookingId)` (`stripe-webhook.ts:150`).
2. **Rank.** `initiateAssignment` (`assignment.ts:100`) loads cleaners `status IN ('approved','active')`
   (`assignment.ts:113`), filters via `eligibleCleanersForBooking` (`matching.ts:78`), scores via
   `rankCleanersForBooking` (`matching.ts:264`), then `weightedAssignmentOrder(ranked, cfg.randomnessFloor)`
   (`matching.ts:158`) → weighted-random cascade order; slices `cfg.maxCandidates` (`assignment.ts:124-125`).
   Empty → booking `matching`, alert admins (`assignment.ts:127-144`).
3. **Queue + offer.** Inserts one `assignment_queue` row per candidate at `position i+1`, status `pending`
   (`assignment.ts:151-162`); `offerPosition(sql, booking, 1)` (`assignment.ts:164`) sets that row's `offered_at`/`expires_at`,
   flips booking → `offered_to_cleaner`, and `notifyCleaner` (`assignment.ts:84-93`).
4. **Accept.** `handleOfferResponse(sql, bookingId, cleanerId, "accepted")` (`assignment.ts:173`):
   insurance gate (`assignment.ts:188`), verifies an open queue row exists, then the **claim-then-act** race guard —
   conditional `UPDATE bookings SET cleaner_id=…, status='cleaner_accepted' WHERE id=… AND cleaner_id IS NULL AND status NOT IN(...) RETURNING id`
   (`assignment.ts:214-222`); loser gets 0 rows → 409. Winner flips its own queue row to `accepted`, notifies customer.
5. **Decline / expire / cascade.** Decline (`assignment.ts:242-265`) tracks free-vs-penalized declines (`declined_free`),
   then `cascadeFrom` (`assignment.ts:269`) offers the next pending position or, if exhausted, sets booking `matching`
   and alerts admins. Expiry cron: `processExpiredOffers` (`assignment.ts:308`), invoked from `index.ts:624-632`.

**Config bag** `matching_config` (`lib/matchingConfig.ts`): `randomnessFloor`, `freeDeclinesPerDay`, `offerExpiryMinutes`,
`maxCandidates` — single JSON row in `site_settings`.

**Crew implication:** the whole flow assumes exactly one winner claims `bookings.cleaner_id`. Crew staffing needs
N concurrent offer tracks (one per open seat), each running its own cascade, and a booking-level crew_status that
reflects "how many seats are still open" rather than a single `offered_to_cleaner` → `cleaner_accepted` flip.

---

## 2. Every `cleaner_id` / single-cleaner assumption (compatibility surface)

Categorized touchpoints. `bookings.cleaner_id` is the load-bearing one; keeping it as a **compat pointer to the LEAD**
(see §13) makes most of these keep working unchanged.

**Matching / assignment**
- `lib/assignment.ts:88-91` claim UPDATE writes `bookings.cleaner_id`; `:197-231` single accept/claim.
- `lib/matching.ts:98-102` conflict query keys on `bookings.cleaner_id`; `:333-341` past-interaction join on `b.cleaner_id`.
- `assignment_queue.cleaner_id` (`schema.sql:347`) — one row per candidate, no role/seat concept.

**Booking status** — `lib/statusMachine.ts:12-33` single linear cleaner lifecycle (see §3).

**Check-in/out & day-of-service** — every guard is `cleaner[0].id !== booking.cleaner_id`:
`dayOfService.ts:114, 205, 253, 342, 379`; `/live` cleaner identity `dayOfService.ts:559`; completion package writes
`booking.cleaner_id` (`dayOfService.ts:446`). `cleaner_location_pings.cleaner_id` (`schema.sql:1012`).

**Messaging / notifications** — `assignment.ts:24-41` notifies one cleaner by `cleaner_id`; customer notified "your cleaner"
(`assignment.ts:232-236`).

**Ratings** — `reviews` has `booking_id UNIQUE` + one `cleaner_id` (`schema.sql:140-148`); `routes/reviews.ts:68-77`
enforces `booking.cleaner_id === input.cleanerId` and upserts ON CONFLICT(booking_id). One rating per booking, one cleaner.

**Tips** — `booking_tips.booking_id UNIQUE`, one `cleaner_id` (`schema.sql:3713-3729`); `routes/tips.ts:69-76`
tips the single `booking.cleaner_id`.

**Payouts** — `payouts.booking_id` is **UNIQUE** (mig 052, `052_payouts_booking_id_unique.sql`); `payout_ledger` has a
**unique index on booking_id** (`021_payout_ledger.sql:idx_payout_ledger_booking_unique`). One payout row per booking →
hard blocker for per-cleaner splits (see §5). Creation: `stripe-webhook.ts:125-133`; release `routes/payments.ts:276-346`.

**Notifications table** — `notifications.user_id` (`schema.sql:186-195`), per-user; fine for crews.

**Admin booking view** — `apps/admin/src/pages/JobDetailPage.tsx:47,71-108` single `cleaner_id` reassign Select
(`Reassign cleaner`, `:191-197`); PATCH body `{ status, cleaner_id }` (`:108`).

**Cleaner dashboard** — `apps/cleaner/src/pages/JobDetailPage.tsx` reads `/jobs/bookings/:id/live`; `EarningsPage.tsx`,
`JobsPage.tsx` are per-`cleaner_id` job boards.

**Customer booking view** — `apps/customer/src/pages/BookingDetailPage.tsx:76-114, 333` shows one `cleanerName`/`cleanerId`
("Your cleaner", review target).

**Availability/eligibility** — conflict + interaction queries on `bookings.cleaner_id` (`matching.ts:98-102, 333-341`).

---

## 3. State machine (`lib/statusMachine.ts`)

Current booking status graph (`statusMachine.ts:12-33`):
```
draft            → quoted, cancelled_by_customer
quoted           → payment_pending, cancelled_by_customer
payment_pending  → booked, cancelled_by_customer
booked           → matching, cancelled_by_customer, refunded
matching         → offered_to_cleaner, cancelled_by_customer
offered_to_cleaner → cleaner_accepted, matching, cancelled_by_customer
cleaner_accepted → confirmed, cancelled_by_cleaner, refunded
confirmed        → cleaner_on_the_way, cancelled_by_cleaner, refunded
cleaner_on_the_way → arrived
arrived          → in_progress
in_progress      → completed_pending_review, completed
completed_pending_review → completed, disputed, refunded
completed        → disputed, refunded
cancelled_by_customer → refunded
cancelled_by_cleaner  → matching, refunded
disputed         → completed, refunded
refunded         → (terminal)
```
`isValidTransition(from,to)` / `assertValidTransition` (`statusMachine.ts:35-43`). Note in practice `booking.status`
is set to `'booked'` directly at INSERT (`bookings.ts:651`) and the day-of-service flow walks a **separate**
`bookings.day_status` axis (`scheduled → en_route → arrived → in_progress → awaiting_checkout → completed`,
`schema.sql:979-991`) — `start-clean` bridges `status → in_progress` (`dayOfService.ts:255-269`) and `complete`
bridges `status → completed` guarded by `isValidTransition` (`dayOfService.ts:428-439`).

### How `crew_status` should relate
Introduce a **third, orthogonal axis** `bookings.crew_status` (like `day_status`), NOT new `status` values — this keeps
`isValidTransition` and every existing `status`/`day_status` consumer untouched. Proposed mapping:
- `NEEDS_STAFFING` — booking paid, crew rows being created (parallels `matching`).
- `STAFFING` — offers outstanding on ≥1 seat (parallels `offered_to_cleaner`).
- `PARTIALLY_STAFFED` — LEAD + some MEMBER seats accepted, others still open.
- `CONFIRMED` — all required seats accepted (this is when legacy `status` reaches `cleaner_accepted`, LEAD written to `bookings.cleaner_id`).
- `AT_RISK` — a member no-showed / dropped after confirm; re-cascade a replacement seat.
- `IN_PROGRESS` / `COMPLETED` — mirror day-of-service.
- `STAFFING_FAILED` — cascade exhausted for a required seat → admin escalation (parallels the existing `matching` + `match_exhausted` admin alert, `assignment.ts:286-301`).
Solo bookings can leave `crew_status` NULL and behave exactly as today.

---

## 4. Pricing / labor engine (person-minutes source — v2-active only)

### Quote outputs (`packages/quote-engine/src/types.ts` `QuoteResultV2`, `:192-210`)
```
expectedLaborMinutes     number   -- person-minutes of work (billed basis)
scheduledLaborMinutes    number   -- capacity reserve (NOT billed)
estimatedElapsedMinutes  number   -- wall-clock given team size
recommendedTeamSize      number   -- 1 or 2 today
cleanerPayoutCents       number
subtotalCents/taxCents/totalCents, roomInference[], components[], calculationFingerprint …
```

### Config knobs (`types.ts` `PricingConfigV2.scheduling`, `:129-140`)
```
teamProductivityPermille: Record<string, number>  -- e.g. {"1":1000,"2":1800}; two people ≠ 2×
twoPersonThresholdMinutes: number                 -- scheduled labor above this → recommend 2
reservePercentile, bufferRatePermille, roundUpToIncrementMinutes
```
Payout knobs: `PricingConfigV2.payout` (`types.ts:124-128`: `mode`, `centsPerLaborHour`, `percentBps`).

### Team-size computation today (`packages/quote-engine/src/engine.ts:356-361`)
```
recommendedTeamSize = scheduledLaborMinutes > config.scheduling.twoPersonThresholdMinutes ? 2 : 1;
productivity        = config.scheduling.teamProductivityPermille[String(recommendedTeamSize)] ?? 1000;
estimatedElapsedMinutes = Math.ceil((scheduledLaborMinutes * 1000) / productivity);
```
Currently binary (1 or 2). Crew sizing wants to generalize this to N using a `crewEfficiencyBySize`/`teamProductivityPermille`
map keyed by size, and to expose `expectedLaborMinutes` as the person-minutes to divide across the crew.

### How a booking gets its v2 quote
- Adapter `apps/api/src/lib/quoteEngine/bookingAdapter.ts`: `buildQuoteInputFromBooking` (`:67`) maps wire→engine input;
  `assembleV2Pricing` (`:114`) calls `quoteAndPersist` and returns a `V2Assembly` (`:44-63`) or `null` (gate closed / legacy client / failure).
- Service `apps/api/src/lib/quoteEngine/service.ts`: `loadActivePricingVersion` (`:42`, cached) reads the single Active
  `pricing_versions` row; `quoteAndPersist` (`:69`) computes + inserts an immutable `pricing_quotes_v2` snapshot (`:74-92`).
- **Activation gate:** v2 prices customers ONLY while a version is `status='active'` (`097_pricing_v2.sql:29-30`, one-active
  unique index `:48-50`); otherwise the legacy chain runs (adapter returns null).
- **Stamped on the booking:** `bookings.pricing_version_id` + `bookings.pricing_quote_v2_id` at INSERT
  (`bookings.ts:649,662`) and on the double-submit reprice UPDATE (`bookings.ts:710-711`). Snapshot columns
  `pricing_quotes_v2.expected_labor_minutes` / `scheduled_labor_minutes` (`097_pricing_v2.sql:68-69`) persist the
  person-minutes basis for crew sizing.

**Crew sizing rule:** read `pricing_quotes_v2.result.recommendedTeamSize` / `expectedLaborMinutes` from the stamped
snapshot — only meaningful when `bookings.pricing_version_id IS NOT NULL` (v2 was active at booking time). For legacy
(v2-dark) bookings, crew sizing must fall back to a heuristic or stay solo.

---

## 5. Payouts (per-cleaner split hook)

### Tables
- `payouts` (`schema.sql:162-171`): `booking_id` (**UNIQUE**, mig 052), `cleaner_id`, `amount`, `status`,
  `stripe_transfer_id`, `paid_at`. Later `ALTER`s add `platform_fee`, `gross_amount`, `net_amount`, `fee_rate`, `tier_multiplier`.
- `payout_ledger` (`021_payout_ledger.sql`): `booking_id` (**unique index** `idx_payout_ledger_booking_unique`),
  `cleaner_id`, `gross_amount_cents`, `platform_fee_cents`, `reserve_amount_cents`, `cleaner_payout_cents`, `fee_rate`,
  `tier_multiplier`, `status` (`pending|held|eligible|transfer_created|transferred|paid|failed|canceled|refunded|disputed`),
  `stripe_*`, `eligible_at`, `transferred_at`, `paid_at`.

### Solo payout computation
- **Ledger created** on payment capture: `stripe-webhook.ts:125-133` inserts `payout_ledger` (`cleaner_payout_cents=0`
  placeholder, status `pending`, one row per booking).
- **Fee/split math** `lib/payoutEngine.ts`: `loadFeeSettings` (`:52`, from `platform_fee_settings`, default 20% —
  `payoutEngine.ts:41-50`), `calculatePayout(gross, settings, tierMultiplier, foundingDiscount)` (`:99-146`) →
  `{platformFee, reserveHold, cleanerPayout, feeRate}`; `getTierMultiplier` (`:153`).
- **Transfer (claim-then-act)** `routes/payments.ts:255-346`: require captured payment (`:258-268`), compute breakdown
  (`:276-281`), atomically claim the `payouts` row `UPDATE … SET status='processing' WHERE … status NOT IN
  ('paid','processing','transferred') RETURNING id` (`:292-296`) BEFORE `stripe.transfers.create` (`:313`,
  idempotencyKey `payout_${bookingId}`, `transfer_group: booking_${bookingId}`), then mark `paid` + write
  `bookings.platform_fee`/`cleaner_payout` (`:333-346`). Admin manual path mirrors this: `adminPayouts.ts:160-219`.
- **Cron eligibility** promotes `payout_ledger` pending→eligible after `payout_delay_days` (`index.ts:728-740`).

### Where per-cleaner split hooks in
The 60/40 (2) / 40/30/30 (3) split is a **fan-out below the existing single-booking payout**. Because `payouts.booking_id`
and `payout_ledger.booking_id` are both UNIQUE, per-cleaner earnings CANNOT reuse those rows. Recommended:
- Store per-seat earnings on `booking_crew_assignments.earnings_cents` (§13), computed from the total cleaner payout pool
  (`calculatePayout(...).cleanerPayout`) × the seat's role percentage (LEAD/MEMBER split from crew config).
- Create **one Stripe transfer per crew member** (distinct `idempotencyKey`, e.g. `payout_${bookingId}_${crewAssignmentId}`,
  shared `transfer_group: booking_${bookingId}`) to each member's `stripe_connect_id`.
- Either relax the UNIQUE constraints to `(booking_id, cleaner_id)`, or (cleaner) keep `payouts`/`payout_ledger` as the
  booking-level pool and add per-member transfer tracking on the crew-assignment rows. Preserve the claim-then-act CAS per member.

---

## 6. Tips & ratings

**Tips** — `booking_tips` (`schema.sql:3713-3729`): `booking_id` **UNIQUE**, one `cleaner_id`, `amount_cents`,
separate immediate-capture PI, `visible_to_cleaner BOOLEAN DEFAULT FALSE` (flips at payout), 100% to cleaner, no platform fee.
Create/attach `routes/tips.ts:69-105`; tip transfer `payments.ts:396`. For crews: either tip the LEAD (simplest, matches the
UNIQUE), or split — which requires dropping the `booking_id` UNIQUE and adding a `crew_assignment_id`/`cleaner_id` dimension.

**Ratings** — `reviews` (`schema.sql:140-148`): `booking_id` **UNIQUE**, one `cleaner_id`, `rating 1..5`, `comment`,
`tags TEXT[]` (mig 069). Submit `routes/reviews.ts:68-77` (upsert ON CONFLICT(booking_id), enforces `booking.cleaner_id`).
There is **no** per-cleaner-per-booking rating today. Crew per-member ratings need dropping the `booking_id` UNIQUE (→
`(booking_id, cleaner_id)`), and the peer thumbs-up/down (only first pairing) is a NEW table (§13).

---

## 7. Check-in/out & day of service (per-cleaner + PIN-vouch home)

**API** `apps/api/src/routes/dayOfService.ts` (all guarded by `cleaner[0].id === booking.cleaner_id`):
- `POST /bookings/:id/start-route` (`:73`) → `day_status='en_route'`, reveals address, timing-window gated (`:118-142`).
- `POST /bookings/:id/location` (`:177`) → `cleaner_location_pings`; auto-verifies arrival within `GPS_ARRIVAL_THRESHOLD_M=150`
  (`:40, 214-226`) → `day_status='arrived'`, `arrival_verified_at`.
- `POST /bookings/:id/start-clean` (`:234`) → requires `arrival_verified_at` + `day_status='arrived'`; sets
  `day_status='in_progress'`, `status='in_progress'`, `started_at`, reveals access codes (`:255-269`).
- `POST /bookings/:id/finish-clean` (`:325`) → `awaiting_checkout`.
- `POST /bookings/:id/complete` (`:357`) → validates before/after photo minimums (`job_completion_requirements`,
  `:382-403`), inserts checkout photo, guards `isValidTransition(status,'completed')` (`:428`), writes
  `job_completion_packages` (one per booking, `:441-450`).
- `POST /bookings/:id/photos` (`:477`), `GET /bookings/:id/live` (`:514`, customer+cleaner reader), `POST /bookings/:id/access-code` (`:634`).

**Booking columns** driving it: `day_status`, `arrival_verified_at`, `started_at`, `completed_at`,
`address_revealed_at`, `access_code_revealed_at` (`schema.sql:983-991`); photos `booking_photos` (`schema.sql:994-1002`);
pings `cleaner_location_pings` (`schema.sql:1009-1019`).

**UI** `apps/cleaner/src/pages/JobDetailPage.tsx` (polls `/live`, buttons call `start-route`/`start-clean`/`finish-clean`
at `:369,398,423`; state on `job.day_status`).

**Crew implication:** arrival/checkin/checkout are recorded once on the booking. Per-cleaner check-in needs per-seat
timestamps on `booking_crew_assignments` (`check_in_at`/`check_out_at`, §13). The **helper PIN-vouch** mechanism (a MEMBER
who can't GPS-verify is vouched-in by the already-arrived LEAD via a short-lived PIN) lives here: gate a member's
`start-clean`/check-in on either their own GPS arrival OR a valid vouch by an ACCEPTED+arrived crew member. Access-code
reveal (`:271-293`) should extend to all checked-in crew, not just `booking.cleaner_id`.

---

## 8. Availability / conflicts (each crew member independently)

`lib/matching.ts` + `lib/availability.ts`:
- **Eligibility** `eligibleCleanersForBooking` (`matching.ts:78-132`): merges availability via
  `getMergedSlots`/`getBlockedCleaners` (`availability.ts:45,95`), excludes double-booking —
  `bookings WHERE cleaner_id = ANY(...) AND status IN ('cleaner_accepted','confirmed','cleaner_on_the_way','arrived','in_progress')
  AND ABS(scheduled_at − target) < 10800s` (3h window, `matching.ts:95-103`). No configured schedule = available (soft gate, `:129`).
- **Hard filters** in `rankCleanersForBooking` (`matching.ts:393-418`): service-offering (`preferred_service_types`) and
  own service-area radius (haversine vs `cleaner_service_areas`).
- Merged read model unifies `cleaner_availability` (weekly) + `cleaner_schedule` (flexible/available_now) − `cleaner_blocked_dates`
  (`availability.ts:11-31`).

**Crew implication:** each candidate for each seat must independently pass eligibility + conflict + hard filters. The
conflict query keys on `bookings.cleaner_id`, so a crew member's other bookings are only seen if that other booking's
crew membership is discoverable — the conflict check must be widened to consult `booking_crew_assignments` (any ACCEPTED
seat within the 3h window), not just `bookings.cleaner_id`. Also prevent offering the same person two seats on the same booking.

---

## 9. Notifications

`lib/notifications.ts` `sendNotification(db, userId, {type,title,body,data?})` (`:27-46`) — writes a `notifications` row
(`schema.sql:186-195`), polled by the in-app `NotificationBell` (`@sweepr/ui`). Delivery hook (push/FCM) is a stubbed
fan-out point. Types are free-form strings (no enum): existing include `job_offered`, `cleaner_assigned`, `match_needed`,
`match_exhausted`, `payout_released` (`assignment.ts:34-60,136,295`; `payments.ts:351`).

**Adding TEAM_\* notifications** the existing way: just call `sendNotification` with new `type` strings
(`team_seat_offered`, `team_crew_confirmed`, `team_member_dropped`, `team_replacement_needed`, `team_vouch_requested`, …),
`data.href` deep-linking to `/jobs/:id`. No schema change; optionally add matching subjects/templates in `lib/mailer.ts`
(`TEMPLATES`) and SMS via `lib/sms.ts` if a channel beyond in-app is wanted (both are the ONLY outbound paths — conventions 11-12).

---

## 10. Feature flags / config

Pattern = key/value `site_settings` (`schema.sql`: `key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at`). Two shapes:
1. **Boolean toggles**, one key each: `prelaunch_customer|cleaner|pricing` read at `routes/status.ts:59-74` (value `!== "false"`),
   written by the schedule engine `prelaunch_toggle` action (`lib/scheduledActions.ts`).
2. **JSON config bag**, one key holding a JSON blob, with a typed loader that merges over defaults + clamps —
   `lib/matchingConfig.ts` (key `matching_config`, `loadMatchingConfig`/`saveMatchingConfig`, `:37-70`) is the canonical
   template; also `pricingConfig.ts`, `scopeReviewEngine.ts` (`scope_review.*`), `smartEntryConfig.ts`.

**Where crew config lives:**
- `TEAM_CLEANS_ENABLED` (and any per-app sub-toggles) → boolean `site_settings` keys, read like `prelaunch_*`.
- Crew numeric/config values (`maxCrewSize` default 3, `crewInvitationTTL`, `crewEfficiencyBySize` /
  `teamProductivityPermille` by size, LEAD/MEMBER split percentages, extra-cleaner fee) → a new JSON bag
  `crew_config` in `site_settings` with a `lib/crewConfig.ts` loader modeled exactly on `matchingConfig.ts`
  (defaults + clamp + upsert). Pricing-facing efficiency/threshold knobs that must snapshot with a quote belong instead in
  `PricingConfigV2.scheduling` (already there: `teamProductivityPermille`, `twoPersonThresholdMinutes`) so they version with
  `pricing_versions.config` — keep operational/matching knobs in `crew_config`, pricing knobs in the pricing version.

---

## 11. UI surfaces

Design system: `@sweepr/ui` (`packages/ui/src/index.ts`) exports `Button, Input, PhoneInput, Textarea, Select, Badge,
Modal, Toast, Card, CountUp, Accordion, AppShell, DashboardShell, StatCard, States, SweeprCalendar/AddSlotModal/SlotChip,
NotificationBell, FoundingMemberBadge, PriceSummary, AddOnGrid, SafeText`, etc. Shared theme preset
`packages/config/tailwind.ts` (warm-graphite dark mode; no blue-gray — CLAUDE.md Theme). Cleaner app has 10 locales
(`apps/cleaner/src/i18n/locales/<lang>/common.json`) — any cleaner-facing crew copy needs all 10.

**Cleaner (offer + day-of-service)**
- `apps/cleaner/src/pages/JobsPage.tsx` — job board / incoming offers.
- `apps/cleaner/src/pages/JobDetailPage.tsx` — day-of-service (`start-route`/`start-clean`/`finish-clean`, `/live` poll).
  Crew: seat role display, per-member arrival state, PIN-vouch UI.
- `apps/cleaner/src/pages/EarningsPage.tsx` — per-seat earnings.

**Customer (confirmation + detail)**
- `apps/customer/src/booking/steps/ConfirmedStep.tsx` — post-booking confirmation.
- `apps/customer/src/pages/BookingDetailPage.tsx` — shows "Your cleaner" (`:333`), review target (`:76-114`). Crew: show
  the whole crew (LEAD + members), and per-member review.
- Booking wizard `apps/customer/src/booking/` + store `apps/customer/src/store/booking.ts` — where a crew-recommended size
  would surface pre-booking.

**Admin (booking detail)**
- Routes in `apps/admin/src/App.tsx:270` (`/jobs/:id → JobDetailPage`), `:306` (`/payouts → PayoutsPage`).
- `apps/admin/src/pages/JobDetailPage.tsx` — single `Reassign cleaner` Select (`:191-197`), PATCH `{status,cleaner_id}`
  (`:108`). Crew: multi-seat roster with per-seat status/role/reassign, staffing progress, force-fill.
- `apps/admin/src/pages/PayoutsPage.tsx` — per-member payout visibility.

---

## 12. Migration & test conventions

- **Latest migration = `100_mcp_simulator.sql`** → **next is `101_*.sql`** in `packages/db/src/migrations/`.
  Raw SQL only; `packages/db/schema.sql` is GENERATED (`build-schema.mjs`). Every migration starts with the ClearKey
  copyright header block then `-- NNN_name.sql` (see `100_mcp_simulator.sql:1-12`).
- **Schema build/verify** (CI hard-fails otherwise): `node packages/db/build-schema.mjs && node packages/db/verify-schema.mjs`.
- **Verify-before-commit** (CLAUDE.md): `npx turbo run typecheck --force`; `npx vitest run apps/api/tests` (365 tests);
  `npx turbo run build --filter=@sweepr/<app>` for touched frontends.
- **Test harness** (`apps/api/tests/*.test.ts`, vitest): pure functions tested directly (e.g.
  `assignment-weighting.test.ts` imports `weightedAssignmentOrder`). DB is mocked by a **template-tag `makeSql()`** that
  records calls and dispatches on the joined SQL text — canonical example `pricing-v2-service.test.ts:26-51`:
  ```ts
  function makeSql(): Sql {
    return ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return Promise.resolve(handler(text, values) ?? []);
    }) as unknown as Sql;
  }
  ```
  A per-test `handler(text, values)` returns rows for `text.includes("FROM …")` / `INSERT INTO …`. Collaborators are
  `vi.mock`ed. New crew libs should be structured as pure/injectable functions taking `Sql` so they test this way.

---

## 13. Recommended schema (proposal only — do NOT create migrations here)

All in a single new migration `101_team_cleans.sql` (ClearKey header + `-- 101_team_cleans.sql`). Conventions observed:
integer cents; `UUID … DEFAULT gen_random_uuid()`; `TEXT … CHECK (… IN (...))` enums; `TIMESTAMPTZ … DEFAULT NOW()`;
`created_at/updated_at`; `REFERENCES … ON DELETE CASCADE`. RLS: enable on booking-scoped tables to match §Security
(`bookings`/`payouts` have RLS at `schema.sql:240-242`); grant `sweepr_app` SELECT/INSERT/UPDATE (`schema.sql:252`).

### `booking_crew_assignments` — one row per seat (LEAD + N MEMBER)
```
id                      UUID PK DEFAULT gen_random_uuid()
booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
cleaner_id              UUID REFERENCES cleaners(id)          -- NULL while a seat is CANDIDATE/open
role                    TEXT NOT NULL CHECK (role IN ('LEAD','MEMBER'))
seat_index              INT  NOT NULL                          -- 0 = lead, 1..N-1 members
status                  TEXT NOT NULL DEFAULT 'CANDIDATE'
  CHECK (status IN ('CANDIDATE','INVITED','ACCEPTED','DECLINED','EXPIRED',
                    'CANCELLED','REMOVED','NO_SHOW','COMPLETED'))
person_minutes          INT                                    -- this seat's share of expectedLaborMinutes
assignment_score        DECIMAL(6,2)                           -- mirrors assignment_queue.score
score_breakdown         JSONB
earnings_cents          INT  DEFAULT 0                         -- computed at payout from the pool × role %
offered_at              TIMESTAMPTZ
expires_at              TIMESTAMPTZ                            -- crewInvitationTTL
responded_at            TIMESTAMPTZ
declined_free           BOOLEAN DEFAULT FALSE                  -- mirror assignment_queue mechanic
check_in_at             TIMESTAMPTZ
check_out_at            TIMESTAMPTZ
vouched_by_assignment_id UUID REFERENCES booking_crew_assignments(id)  -- PIN-vouch (§7)
stripe_transfer_id      TEXT                                   -- per-member payout transfer
crew_assignment_version INT NOT NULL DEFAULT 1                 -- optimistic-concurrency / re-staffing generation
created_at/updated_at   TIMESTAMPTZ DEFAULT NOW()

UNIQUE (booking_id, seat_index)
UNIQUE (booking_id, cleaner_id)          -- a person holds at most one seat per booking (partial: WHERE cleaner_id IS NOT NULL)
INDEX  (booking_id, status), (cleaner_id, status)
```

### Booking-level crew fields (`ALTER TABLE bookings`)
```
ADD COLUMN required_crew_size       INT                       -- target seats to fill (from recommendedTeamSize / admin override)
ADD COLUMN min_crew_size            INT DEFAULT 1             -- below which the job cannot run
ADD COLUMN target_crew_size         INT                       -- desired (may exceed min)
ADD COLUMN crew_status              TEXT
  CHECK (crew_status IS NULL OR crew_status IN
    ('NEEDS_STAFFING','STAFFING','PARTIALLY_STAFFED','CONFIRMED','AT_RISK',
     'IN_PROGRESS','COMPLETED','STAFFING_FAILED'))            -- NULL = solo/legacy
ADD COLUMN crew_assignment_version  INT NOT NULL DEFAULT 1
```
`bookings.cleaner_id` is **retained as a compat pointer to the LEAD** (§Backward-compat).

### `cleaner_relationships` — mutual preferred teammate
```
id            UUID PK DEFAULT gen_random_uuid()
cleaner_id    UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE
other_cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE
relationship  TEXT NOT NULL DEFAULT 'PREFERRED_TEAMMATE'
  CHECK (relationship IN ('PREFERRED_TEAMMATE','BLOCKED'))
created_at    TIMESTAMPTZ DEFAULT NOW()
CHECK (cleaner_id <> other_cleaner_id)
UNIQUE (cleaner_id, other_cleaner_id)
```
"Mutual" = a row in each direction (or enforce a canonical ordering + treat as symmetric). Feeds a matching bonus akin to
the existing `pastInteraction` term (`matching.ts:437-442`) when staffing MEMBER seats alongside an accepted LEAD.

### `crew_peer_ratings` — per-pairing thumbs up/down (only first pairing)
```
id             UUID PK DEFAULT gen_random_uuid()
booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
rater_cleaner_id  UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE
ratee_cleaner_id  UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE
thumbs         TEXT NOT NULL CHECK (thumbs IN ('up','down'))
comment        TEXT
created_at     TIMESTAMPTZ DEFAULT NOW()
UNIQUE (rater_cleaner_id, ratee_cleaner_id)   -- prompt/collect ONLY on the pair's FIRST shared booking
```
Enforcing "first pairing only" = the `UNIQUE(rater,ratee)` (one rating per ordered pair, ever). Distinct from customer
`reviews`.

### Backward-compat approach (exact)
1. **Keep `bookings.cleaner_id` = the LEAD.** Every existing consumer (§2) keeps working: day-of-service guards,
   customer "your cleaner", tips, the booking-level `payouts`/`payout_ledger` pool, admin reassign, conflict/interaction
   queries. The LEAD's accept still runs the `assignment.ts:214-222` claim, writing `bookings.cleaner_id`.
2. **Backfill each existing booking as one LEAD ACCEPTED crew row.** In `101_team_cleans.sql`, for every booking with a
   non-NULL `cleaner_id`, insert one `booking_crew_assignments` row: `role='LEAD'`, `seat_index=0`, `status='ACCEPTED'`
   (or `'COMPLETED'` for completed bookings), `cleaner_id = bookings.cleaner_id`, `check_in_at = started_at`,
   `check_out_at = completed_at`, `earnings_cents = COALESCE(cleaner_payout, estimated_cleaner_payout_cents, 0)`,
   `crew_assignment_version = 1`. Set `crew_status = NULL` on solo/legacy bookings so they behave exactly as today.
3. **Solo = degenerate crew of 1.** New bookings with `required_crew_size = 1` run the legacy single-seat path (LEAD only);
   crews create additional MEMBER seats and their own cascades. The existing `assignment_queue` can remain the LEAD-seat
   mechanism, or be superseded by per-seat rows on `booking_crew_assignments` (recommended: unify seats on the new table,
   keeping `assignment_queue` only until cutover).

---

### Key blockers to flag for implementers
- `payouts.booking_id` UNIQUE (mig 052) + `payout_ledger` unique-on-booking (`idx_payout_ledger_booking_unique`) →
  per-member payouts need per-seat transfer tracking (on `booking_crew_assignments`) or a constraint change (§5).
- `booking_tips.booking_id` UNIQUE and `reviews.booking_id` UNIQUE → per-member tips/ratings need a `(booking_id,cleaner_id)`
  key or a new dimension (§6).
- Conflict/double-booking check keys on `bookings.cleaner_id` only (`matching.ts:98-102`) → must also consult
  `booking_crew_assignments` (§8).
- Person-minutes are only trustworthy when `bookings.pricing_version_id IS NOT NULL` (v2 was active) — crew sizing is
  v2-active-only; legacy bookings need a fallback (§4).
- `crew_status` should be a NEW orthogonal axis (like `day_status`), NOT new `status` enum values, to avoid touching
  `isValidTransition` and its consumers (§3).
