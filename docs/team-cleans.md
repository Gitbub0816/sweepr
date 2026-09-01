<!--
  Copyright © 2026–Present ClearKey Solutions, LLC.
  Proprietary & Confidential. Internal Use Only.
-->

# Team Cleans (multi-cleaner crews)

Implementation reference for the Team Cleans feature: how a booking is staffed,
run, and paid by a **crew** (1 LEAD + N MEMBER helpers) instead of a single
cleaner. Design/audit rationale and every backward-compat touchpoint live in
`docs/team-cleans-audit.md`; this doc is the shipped picture.

**Team Cleans is LIVE by default** (owner decision, 2026-09): every
`isTeamFlagEnabled(...)` flag defaults ON (a missing `site_settings` row counts
as enabled; migration 107 also seeds every flag row to `"true"`). The flags are
kept as admin off-switches — a stored row not exactly `"true"` turns its stage
off, and with the master flag off bookings run the legacy single-cleaner path
byte-for-byte unchanged.

---

## 1. Architecture

A booking is no longer 1:1 with a cleaner. It has **zero-or-more crew seats**,
one row each in `booking_crew_assignments` (migration 101):

- exactly one **LEAD** seat (`seat_index = 0`) — the cleaner of record to Sweepr
  and the customer;
- plus `N` **MEMBER** seats (`seat_index = 1..N-1`) — helpers.

A **solo booking is the degenerate crew of one LEAD.**

### The `cleaner_id` compat pointer

`bookings.cleaner_id` is **retained as a pointer to the LEAD**. Every existing
single-cleaner consumer keeps working unchanged: day-of-service guards, customer
"your cleaner", the booking-level `payouts`/`payout_ledger` pool, admin reassign,
and the conflict/interaction queries. On a LEAD accept the same claim-then-act
UPDATE the solo path uses writes `bookings.cleaner_id` + `status='cleaner_accepted'`
(`crewAssignment.acceptSeat`).

Authoritative crew membership lives in `booking_crew_assignments`. The backfill
(migration 101) makes every pre-existing booking with a cleaner one LEAD seat at
`seat_index 0` (`COMPLETED` for completed bookings, else `ACCEPTED`), earnings
mirroring `cleaner_payout`, `check_in_at = started_at`, `check_out_at =
completed_at`, and `crew_status` left NULL so it stays solo/legacy.

### Tables (migrations 101–103)

| Table | Migration | Purpose |
| --- | --- | --- |
| `booking_crew_assignments` | 101 | one row per seat (role, status, person_minutes, earnings_cents, invitation pool, check-in/out, PIN vouch link, per-seat `stripe_transfer_id`, `crew_assignment_version`) |
| `bookings.crew_status` + `required/min/target_crew_size` + `crew_assignment_version` | 101 | booking-level crew axis + sizing targets |
| `cleaner_relationships` | 101 | mutual PREFERRED_TEAMMATE / BLOCKED between cleaners |
| `crew_peer_ratings` | 101 | per-pairing thumbs up/down, `UNIQUE(rater, ratee)` |
| (relaxed UNIQUEs) | 102 | drops the per-booking UNIQUE on `payouts`/`booking_tips`/`reviews` so per-member split money/ratings are possible |
| `cleaning_tasks` | 103 | decomposed work units allocated across seats |

### Engine files (`apps/api/src/lib/crew/`)

- `types.ts` — `CrewRole`, `CrewSeatStatus`, `CrewStatus`, `CrewSeat`, sizing types.
- `crewConfig.ts` — `crew_config` JSON bag loader + the boolean feature flags.
- `crewSizing.ts` — person-minutes → recommended crew size (pure).
- `crewMatching.ts` — LEAD + MEMBER ranking on top of the solo engine.
- `crewAssignment.ts` — seat CRUD + claim-then-act accept/decline/invite.
- `crewStaffing.ts` — the orchestration **state machine**.
- `crewDayOfService.ts` — per-member check-in, PIN vouch, no-show, completion.
- `crewPayout.ts` — pool → per-seat split → one transfer per member.
- `taskAllocation.ts` — decompose a v2 quote into tasks + balance across seats.
- `crewPeerRating.ts` — first-pairing peer thumbs.

Routes: `routes/crew.ts`, `routes/crewTasks.ts`; day-of-service, payments, tips
and reviews carry crew branches. The cron calls
`crewStaffing.expireStaleCrewInvitations`.

---

## 2. Crew state machine

`bookings.crew_status` is a **third, orthogonal axis** like `day_status` — it
never touches `bookings.status` or `isValidTransition`. NULL = solo/legacy.

```
NEEDS_STAFFING     seats created, nothing invited yet
     │ invite LEAD wave
     ▼
STAFFING           LEAD invitation(s) outstanding
     │ LEAD accepts (claims bookings.cleaner_id)
     ▼
PARTIALLY_STAFFED  LEAD in; MEMBER seats being staffed in parallel
     │ every required seat ACCEPTED
     ▼
CONFIRMED
     │ a confirmed member/lead drops
     ▼
AT_RISK            replacement flow for the vacated seat ONLY
     └─ replacement accepts ─► CONFIRMED

STAFFING_FAILED    a required seat's candidate pool is exhausted → admin
                   escalation. We NEVER silently shrink the crew.
```

`recomputeAndPersistCrewStatus` derives the status from the live seat rows:
CONFIRMED once `accepted ≥ required` and the LEAD is in; PARTIALLY_STAFFED with a
LEAD but open seats; STAFFING while invites are out; NEEDS_STAFFING otherwise.
STAFFING_FAILED is **sticky** until an admin acts. `IN_PROGRESS`/`COMPLETED`
mirror day-of-service.

### Seat statuses (`booking_crew_assignments.status`)

`CANDIDATE` (open, `cleaner_id` NULL) → `INVITED` → `ACCEPTED` →
`COMPLETED`; plus `DECLINED`, `EXPIRED`, `CANCELLED`, `REMOVED`, `NO_SHOW`.

### Claim-then-act (the last-seat race)

Acceptance is one conditional UPDATE that flips `INVITED → ACCEPTED` and stamps
`cleaner_id` only while the seat is still open and on the same invitation wave:

```sql
UPDATE booking_crew_assignments
   SET status='ACCEPTED', cleaner_id=$me, responded_at=NOW()
 WHERE id=$seat AND status='INVITED' AND cleaner_id IS NULL
   AND crew_assignment_version=$wave
RETURNING id
```

Two cleaners racing one seat contend on a single row; exactly one sees it open,
the loser gets 0 rows and `position_filled`. `crew_assignment_version` also
rejects a late accept from a superseded wave (after a TTL re-invite or a
replacement release). Eligibility + conflict are **re-validated at acceptance**,
never trusted from invite time.

---

## 3. Crew sizing (`crewSizing.ts`)

Sizing is driven by **predicted labor (person-minutes)**, NOT square footage,
and is deterministic + explainable (returns `reasonCodes`, no ML). Person labor
(how much cleaning work) is distinct from **elapsed** on-site time (how long the
crew is there); the two are bridged by the **team-efficiency curve**.

- **Person-minutes source:** `pricing_quotes_v2.expected_labor_minutes` from the
  stamped v2 snapshot — trustworthy only when `bookings.pricing_version_id IS NOT
  NULL` (v2 was active at booking time). Legacy/v2-dark bookings have no estimate
  → sizing stays solo (reason `NO_LABOR_ESTIMATE`).
- **Engine staffing contract** (`@sweepr/quote-engine`, contract doc at the top
  of `packages/quote-engine/src/index.ts`), consumed via
  `crewStaffing.loadBookingLaborContext`:
  `resolveTeamProductivityPermille(config)` supplies the RESOLVED
  team-efficiency map (scheduling entries merged with the
  marketplace-economics team sizes, e.g. a team of 3 at 2500 permille), and the
  quote's `QuoteResultV2.requiredTeamSize` (airbnb staffing matrix +
  turnover-window sizing via `computeAirbnbTeamSize`; the two-person threshold
  for standard/move-in-out) is a hard FLOOR on the recommendation (reason
  `QUOTE_REQUIRED_TEAM_SIZE`) — honored even with `autoSizing` off, since the
  customer was quoted that team.
- **Team-efficiency curve** (permille of one cleaner; local fallback mirrors
  the engine's `{"1":1000,"2":1800,"3":2500}`): two people ≠ 2×.
  `effectiveCapacity(size)` reads it (extrapolating past the largest known point
  by the last marginal step); `elapsedMinutes = ceil(personMinutes / capacity)`.
- **Bands** (`crewSizeThresholdsPersonMinutes`, e.g. `{"1":540,"2":900,"3":1320}`):
  the labor-volume floor — the crew size implied purely by person-minutes.
- **Solo-shift ceiling** (`maxSoloElapsedMinutes`, default 360): a solo job that
  would run longer forces ≥2 (no tolerance).
- **Target window + tolerance** (`targetMaxElapsedMinutes`, default 300): soft;
  a 30% tolerance band means a 2-person clean slightly over target is preferred
  to adding a third cleaner.
- **Min-useful cap** (`minUsefulMinutesPerCleaner`, default 90): never add a
  cleaner who would have less than the configured meaningful workload
  (`maxUsefulCrewSize = floor(pm / minUseful)`, capped at `maxCrewSize`).
- **Extra-cleaner fee:** a customer can elect **one extra cleaner for speed**
  (`extraCleanerRequested`). Sizing bumps the recommendation by one (still capped
  by `maxCrewSize`, never below what capacity requires); pricing adds a flat
  `extraCleanerFeeCentsPer100Sqft` line item — the base price stays
  crew-count-independent, never a whole-price multiplier.

`computeCrewPlan` returns `recommendedCrewSize`, `minCrewSize`,
`maxUsefulCrewSize`, `estimatedElapsedMinutes`, `elapsedBySize`, `reasonCodes`,
and a `confidence` (reduced near a band edge).

---

## 4. Matching (`crewMatching.ts`)

Crew matching **reuses, never replaces** the solo engine (`lib/matching.ts`).
The base score from `rankCleanersForBooking` (fair, weighted, hard-filtered) is
the foundation; the base engine already applies the HARD filters (service
offering + service area) and the eligibility/conflict gate (schedule +
double-booking, **widened for crews** to consult `booking_crew_assignments`), so
crew terms only reorder survivors — never smuggle in an ineligible cleaner.

Additive, explainable terms (each candidate carries a full `breakdown`):

- **LEAD candidates** (`rankLeadCandidates`): HISTORICAL PERFORMANCE FIRST
  (owner decision) — the exact formula is documented on the function:
  `60·min(total_jobs/25,1) + 50·(rating/5) + 40·reliability + 10·continuity +
  base`, where reliability combines completed vs `cancelled_by_cleaner`
  bookings with MEMBER crew-seat outcomes. The performance ceiling (150)
  exceeds the base ceiling (90), so track record dominates the ordering.
- **MEMBER candidates** (`rankCrewCandidates`, scored relative to the accepted
  LEAD): availability overlap, distance, reliability, qualification,
  **prior-pairing** (peer thumbs with the LEAD — a thumbs-down sinks them),
  **preferred-teammate** (mutual `cleaner_relationships`), team compatibility.

**Peer thumbs** (`crewPeerRating.ts`): a private "would I work with them again"
up/down about a cleaner you shared a booking with, collected ONLY on the pair's
**first** shared booking (`crew_peer_ratings UNIQUE(rater, ratee)` → one per
ordered pair, ever). Distinct from customer reviews; never exposed to the ratee.

---

## 5. Task allocation (`taskAllocation.ts`)

Two pure, DB-free stages:

1. **`decomposeBookingIntoTasks(booking, v2Quote)`** — turn a Pricing v2 quote
   into discrete `cleaning_tasks` (rooms, extras, whole-home
   operational/size/clutter). **Minutes are never invented** — they come from the
   quote's per-room/extra/operational components. Solo/legacy bookings (no v2
   quote) yield no tasks and behave as before.
2. **`allocateTasks(tasks, crewSeats, cfg)`** — a greedy longest-processing-time
   load balancer over **labor minutes** (not room count): sort tasks descending,
   assign each to the eligible seat (respecting `required_qualification`) with
   the lowest current workload; the LEAD's workload is **seeded with
   `leadOverheadMinutes`** (walkthrough/coordination/completion) so the lead
   cleans less. A bounded rebalance pass shrinks the workload spread.

`reallocateForFinishedCleaner(...)` handles the dynamic pickup: a cleaner who
finishes absorbs remaining pending team tasks. All minutes are integers.

---

## 6. Compensation (`crewPayout.ts`)

The crew's cleaner-payout **pool is the SAME amount a solo booking pays a single
cleaner** — `calculatePayout(total_price, …).cleanerPayout`, computed once with
the LEAD's tier/founding multipliers (since `bookings.cleaner_id` is the LEAD).
`payouts` / `payout_ledger` stay **booking-level** (the pool); per-seat earnings
and transfer ids live on `booking_crew_assignments`.

- **Split** by the configured `payoutSplitByCrewSize` (primary/LEAD first),
  owner-decided 2026-09: `{"1":[100],"2":[54,46],"3":[36,32,32]}`.
  `splitPoolCents` conserves cents exactly — every non-primary seat is rounded
  from its fraction and the LEAD absorbs the remainder.
- **No-show forfeit:** a `NO_SHOW` (or any non-present) seat earns 0 and is
  **excluded** from the split; the remaining crew divides the **same** pool by
  the reduced present size (the customer paid the same regardless of who showed).
- **One Stripe transfer per present member**, `idempotencyKey
  payout_${bookingId}_${assignmentId}`, shared `transfer_group
  booking_${bookingId}`, to each member's `stripe_connect_id`.
- **Claim-then-act per seat:** the seat's `stripe_transfer_id` is claimed with a
  sentinel BEFORE `stripe.transfers.create`, so a retried/concurrent release
  never double-pays; a seat already carrying a real transfer id is skipped
  (idempotent). On failure the claim is released for a later retry.

**Tips** (crew branch of `routes/tips.ts`): split EQUAL across the completed crew
(never 100% to the lead); structure also supports PROPORTIONAL_TO_EARNINGS. Tips
remain separate immediate-capture PIs, 100% to cleaners, no platform fee.

---

## 7. Day of service + PIN-vouch (`crewDayOfService.ts`)

Every function is gated at the route layer behind `isTeamFlagEnabled('enabled')`
and a non-NULL `crew_status`; solo/legacy bookings never reach it.

- **Independent per-member check-in** (`recordCrewCheckIn`, claim-then-act): only
  an `ACCEPTED` seat that has not checked in is affected. A LEAD's check-in never
  marks members present.
- **A member is present via EITHER** their own GPS arrival OR a valid **PIN
  vouch** by an already-arrived crew member.
- **Completion is LEAD-only** (`completeCrewBooking`): every member seat's
  attendance must be resolved (checked in, or already `NO_SHOW`) first — an
  unresolved seat blocks completion. One seat's premature action never completes
  the others.

### PIN-vouch mechanism (no schema change)

The vouch PIN is **ephemeral and derived**, never stored: a TOTP-style
`HMAC-SHA256(assignmentId, timeWindow)` keyed by an existing worker secret. The
helper app displays its own current PIN (`generateVouchPin` over the helper's own
seat id); the on-site lead types it in and the server re-derives + compares
(`verifyVouchPin`). Because the PIN is a pure function of (assignmentId, time
window, secret), nothing is persisted — no migration-101 column is needed. It
rotates every `PIN_WINDOW_MS` (3 min) with a one-window grace (~2× window
validity) to survive clock skew / latency. Only an ACCEPTED + arrived crew member
may vouch (`resolveVoucherSeat`).

---

## 8. Failure handling

- **STAFFING_FAILED** — a required seat's candidate pool is exhausted. The
  booking is marked STAFFING_FAILED (sticky), admins are notified
  (`team_staffing_failed`), and the crew is **never silently shrunk**. Reached
  from `planAndStartStaffing`, `dispatchStaffing`, `cascadeSeat`,
  `staffMemberSeats`.
- **AT_RISK + replacement** (`handleMemberDrop`) — a confirmed member/lead drops
  after CONFIRMED. Booking → AT_RISK; a replacement search opens for **just that
  seat** (the rest of the crew is preserved). A LEAD drop releases the
  `bookings.cleaner_id` compat pointer and re-invites a lead wave; a member drop
  releases the seat and cascades. `releaseSeatForReplacement` bumps the version
  so a stale accept from the departing occupant's wave fails.
- **No-show** (`handleNoShow`) — at/past expected arrival, a member who never
  checked in → `NO_SHOW`, zero pay, booking AT_RISK, and the on-site elapsed
  estimate recomputed for the smaller crew (total labor is unchanged).
- **Cascade/expiry** (`expireStaleCrewInvitations`, cron) — expire timed-out
  invitations and cascade each freed seat to its next candidate batch, excluding
  everyone already contacted/declined on the seat and everyone already seated.

---

## 9. Analytics

Team-clean events flow through the existing `serverTrack`/PostHog infra
(`lib/posthog`). The engine files emit best-effort (wrapped in try/catch — an
analytics failure never breaks a crew flow); the booking id is the distinct id,
and no PII or per-member amounts are sent. `env` (carrying `POSTHOG_KEY`) is
threaded optionally from the route/cron caller — without it the emit no-ops.

Events: `team_clean_required`, `crew_size_calculated`, `crew_staffing_started`,
`crew_member_invited`, `crew_member_accepted`, `crew_member_declined`,
`crew_confirmed`, `crew_staffing_failed`, `crew_member_replaced`, `crew_at_risk`,
`team_clean_completed`, and `crew_payout_released`. Properties are whatever is in
scope at each point (booking_id, crew_size, person_minutes, elapsed_estimate,
invitation_count, decline_count, replacement_count, …).

---

## 10. Configuration

### `crew_config` JSON bag (`site_settings`, key `crew_config`)

Operational/staffing knobs, loaded + clamped by `loadCrewConfig` (modeled on
`matchingConfig.ts`; defaults reproduce intended behavior so an absent row is
safe):

| Key | Default | Meaning |
| --- | --- | --- |
| `maxCrewSize` | 3 | app-enforced max crew size |
| `crewInvitationTtlMinutes` | 10 | seat invitation TTL before expiry/cascade |
| `parallelInvitationCount` | 3 | candidates invited in parallel per open seat |
| `minUsefulMinutesPerCleaner` | 90 | min useful work per added cleaner |
| `maxSoloElapsedMinutes` | 360 | solo-shift ceiling → forces a crew |
| `targetMaxElapsedMinutes` | 300 | preferred elapsed ceiling (soft, 30% tolerance) |
| `leadOverheadMinutes` | 20 | extra LEAD workload (walkthrough/coordination) |
| `crewSizeThresholdsPersonMinutes` | `{1:540,2:900,3:1320}` | labor-volume bands |
| `payoutSplitByCrewSize` | `{1:[100],2:[54,46],3:[36,32,32]}` | pool split % (primary first, sum 100) |

### Pricing-versioned team knobs (`pricing_versions.config`)

Knobs that must **snapshot with a quote** live in `PricingConfigV2`, not
`crew_config`, so they version with the pricing version:

- `scheduling.teamProductivityPermille` — the team-efficiency curve.
- `scheduling.twoPersonThresholdMinutes` — scheduled labor above which two are recommended.
- `rates.extraCleanerFeeCentsPer100Sqft` — the customer-elected extra-cleaner fee.

### Feature flags (boolean `site_settings` keys)

All default ON (owner decision, 2026-09): a missing row counts as enabled, and
migration 107 seeds every flag row to `"true"`. A stored row turns its stage
off unless its value is exactly `"true"`; any read error fails safe to OFF
(the legacy solo path).

| Flag key | `TeamFlag` | Gates |
| --- | --- | --- |
| `team_cleans_enabled` | `enabled` | master switch (crew path vs solo) |
| `team_auto_crew_sizing_enabled` | `autoSizing` | auto-size vs only-when-extra-cleaner-bought |
| `team_auto_crew_matching_enabled` | `autoMatching` | auto-dispatch invitations vs manual admin fill |
| `team_task_allocation_enabled` | `taskAllocation` | task decomposition/allocation |
| `team_preferred_teammates_enabled` | `preferredTeammates` | preferred-teammate matching term |

---

## 11. Rollout

Team Cleans is LIVE: as of migration 107 every flag defaults ON and the
production rows are seeded `"true"`, so crews form on deploy with no manual
toggle. The original staged sequence (ship dark → v2 active →
`team_cleans_enabled` → `autoMatching` → `autoSizing` → task allocation /
preferred teammates) remains the mental model for TURNING STAGES OFF: each
stage is independently reversible from admin Crew Config by flipping its flag
to a non-`"true"` value. Note crew sizing remains v2-active-only — legacy /
v2-dark bookings still run solo (`NO_LABOR_ESTIMATE`), except that a v2
quote's `requiredTeamSize` is honored even with `autoSizing` off.
