# Sweepr — Session Passdown

Last updated: 2026-07-04. Branch: `claude/wonderful-fermi-nmlpre` (all work merged to `main` at `01ff05d`).

## What this session shipped

A full implementation of the **Booking, Pricing & Payment Engine spec** (plus its amendments: AI vision review, admin-only fee approval, scope/level/add-on separation). Built in 6 waves, all committed, typechecked (17/17 turbo tasks), API-tested (45/45 vitest), and merged to main.

### Wave 1 — Foundation (commit `8e7e2d3`)
- Migration `packages/db/src/migrations/058_scope_review_engine.sql`:
  - New tables: `scope_review_requests` (AAF + refusal requests; partial unique index blocks duplicate active requests per booking/type), `booking_price_ledger`, `cleaner_privileges`, `address_greylist` (unit-aware `normalized_key` = `lower(street)|lower(unit)|zip`), `booking_tips`.
  - `customers.account_status` ('normal'|'investigating'|'restricted'|'suspended'|'banned') + `account_status_until` + `account_status_reason`. Customer identity lives on the **`customers`** table (not `users`).
  - `bookings.cleaning_level` ('refresh'|'extra_attention'|'significant_attention') + `cleaning_level_surcharge_cents`.
  - `pricing_addons.included_in_packages text[]`.
  - Seeds 15 `scope_review.*` keys into `site_settings` (plain TEXT values): AAF fee tiers (2500/5000/10000 cents), refusal fee min/max/pct (5000/20000/20), abuse thresholds (70/70/10 jobs), durations (180 days ×3), level surcharge pcts (15/35), `auto_cancel_on_high_confidence_refusal` ('false').
- Types in `packages/types/src/index.ts`: `CleaningLevel`, `ScopeReviewRequestType/Status`, `CustomerAccountStatus`, `ScopeReviewFeeCode`, `RefusalReason` (9 values), `AiScopeReviewResult` (+safety flags). Row types in `packages/db/src/types.ts`.
- `packages/utils/src/scope.ts`: `CLEANING_LEVELS` (spec copy), `PACKAGE_SCOPES` (included/excluded/inheritsFrom/banner per ServiceType — all 7 covered), `UNIVERSAL_EXCLUSIONS`, `ADDON_PACKAGE_INCLUSIONS`, `isAddOnIncludedInPackage()`.
- Migration `059_scope_review_links.sql` (Wave 3): `scope_review_action_links` (sha256 token_hash, single-use, expiring).

### Wave 2 — Payment engine (commit `c33e721`)
- **Manual capture fix**: `POST /payments/create-intent` now sets `capture_method: "manual"`. Previously PIs auto-captured, making the whole capture-after-service pipeline (cron in `apps/api/src/index.ts`, adminAutomation capture endpoints) dead code. Cached-intent reuse path cancels non-manual PIs. Capture cron captures `amount_to_capture: min(booking.total_price, authorized)` and inserts a `payments` row. Note: Stripe cancels uncaptured manual PIs after 7 days.
- `apps/api/src/lib/bookingLedger.ts`:
  - `recordLedgerEntry(sql, {...}) → ledgerId`
  - `applyBookingPriceAdjustment(sql, stripe, { bookingId, adjustmentCents, eventType, reason?, source, approvedBy?, scopeReviewRequestId? }) → { previousTotal, newTotal, ledgerId, paymentIntentSynced }` — optimistic-lock retry on `bookings.total_price`; syncs Stripe PI amount only pre-confirmation; for `requires_capture` records ledger only (increases past auth aren't collectible on same PI; decreases honored at capture).
  - Event types: `initial_quote|addon_purchase|level_surcharge|additional_attention_fee|refusal_fee|admin_adjustment|tax_adjustment`. Sources: `customer|cleaner_request|admin|system`.
- Cleaning level: booking-create payload accepts `cleaningLevel` (zod enum, `.default("refresh")` for backward compat — UI now always sends it). Surcharge = round(pre-surcharge total × pct/100) from settings. Live engine = `resolveBookingPricing` → SweeprPricingEngine (legacy `calculateBookingPrice` fallback). Server rejects add-ons where `isAddOnIncludedInPackage` → 400 `addon_included_in_package`. `calculateQuote` in `packages/utils/src/pricing.ts` extended with optional `cleaningLevel`/`levelSurchargePcts`.
- Tips (`apps/api/src/routes/tips.ts`, mounted `/tips`, rate-limited): `POST /tips` `{ bookingId, amountCents 100..50000 }` → separate immediate-capture PI (metadata `type:'tip'`), one per booking, only ≤3 days after `bookings.completed_at`. Webhook discriminates on `metadata.type==='tip'`. Payout (`release-payout`) transfers tip 100% (no fee/tier, idempotency `tip_<id>`), sets `paid_out_at` + `visible_to_cleaner=TRUE`. Cleaner earnings (`cleanerDashboard.ts`) expose `tipsThisMonth/tipsAllTime/recentTips` filtered on `visible_to_cleaner`.
- Reviews: `POST /reviews` 400s `review_window_closed` >3 days after `completed_at`.

### Wave 3 — AI scope review engine (commit `7c9252d`)
- `apps/api/src/lib/aiScopeReview.ts`: `runScopeReview(env, input)` → OpenAI `chat/completions`, model `env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini'`, temp 0, strict `json_schema` matching `AiScopeReviewResult`. Zod-validated/clamped; on any failure returns `human_review`/confidence-0 fallback (never throws). Photos passed as **public R2 URLs** (`r2PublicUrl` / `R2_PUBLIC_URL`). Backend-only; frontend never calls OpenAI.
- `apps/api/src/lib/scopeReviewEngine.ts`: settings loader; pure helpers `routeByConfidence`, `aafFeeCents`, `computeRefusalFeeCents` (clamp(total×20%, min, max)), `normalizedGreylistKey`, `isAafFeeCode`; claim-then-act `decideScopeReview`.
- Confidence routing (ADMIN-ONLY approval per spec amendment — customers never approve fees): ≥95 → `pending_admin` + strong-approve email; 75–94 → `pending_admin` + review email; 50–74 → auto `denied` + admin notice w/ override link; <50 → `hard_denied`, cleaner gets fixed message, admin notified.
- Routes `apps/api/src/routes/scopeReview.ts` at `/scope-review`:
  - Cleaner: `POST /requests` (checked-in via `bookings.arrival_verified_at`, not completed, privileges enabled, 2–20 photoKeys, notes ≥10, refusalReason iff refusal; 409 on duplicate), `GET /requests/mine?bookingId=`, `GET /privileges`.
  - Admin (`requireAdmin`, any admin — intentionally looser than fee proposals' super_admin): `GET /admin/requests?status=&type=`, `GET /admin/requests/:id` (incl. `aiResponse`, `photoUrls`, `ledgerPreview`), `POST /admin/requests/:id/decision` `{ decision, feeCode?, note? }` (approve on denied/hard_denied = override).
  - Public: `GET /action/:token` — signed single-use email approve/deny links (shared, not per-admin; audits as actor `email_link` + ip/UA).
- Decisions: AAF approve → `applyBookingPriceAdjustment` (fee from settings by fee_code; admin override wins over AI `recommended_fee_code`). Refusal approve → capture refusal fee off manual-capture PI (idempotency `refusal_<requestId>`), booking → `cancelled_by_cleaner`, customer → investigating (or → suspended + **greylist address** if second approved refusal within window), payout_ledger gross set to refusal fee.
- Abuse: ≥10 completed jobs AND AAF request rate ≥70% AND denial rate ≥70% → disable `additional_attention_enabled` 180 days.
- Enforcement in `bookings.ts`: block suspended/banned customers (lazy status expiry) and greylisted addresses (403 generic). Completion (dayOfService finish) resets investigating→normal. Crons in `index.ts` scheduled handler: expire `pending_admin` past `expires_at`, re-enable privileges, reset expired account statuses.
- Admin email: `scopeReviewNotify.ts`, recipients = `listSuperAdmins(sql)`, subject `Sweepr Review Needed: {type} - Booking {id}`. Slack card intentionally skipped.

### Wave 4a — Customer UI (commit `0a37994`)
- New step order: `Address → Home → Package → Condition → AddOns → Schedule → Review → Payment → Confirmed` (`apps/customer/src/booking/steps.ts`). `ServiceStep.tsx` deleted; `/book/service` redirects to `/book/package`.
- New: `PackageStep.tsx` (comparison pillars, banners, included/excluded, selected scales ~110%, "View complete inclusions & exclusions" modal → links `${VITE_LEGAL_URL}/service-scope`), `ConditionStep.tsx` (mandatory exactly-one, live surcharge), `AddOnsStep.tsx` (package-aware, included items disabled, "Forgot something?" notice).
- Store: `cleaningLevel` + `setCleaningLevel` (persisted); `setService` auto-prunes add-ons that become package-included; wired into `getQuote()` and POST /bookings payload.
- `ReviewStep.tsx`: 3-section itemization (Package / Level / Add-ons) + **required acknowledgement checkbox** (UI-gated only — no consent persistence hook existed; flagged as follow-up) incl. the "Your cleaner cannot change your price…" disclosure.
- Post-booking add-ons: new `POST /bookings/:id/addons` (owner-only; guards `arrival_verified_at IS NULL` + pre-service status → 409 `booking_already_started`; 400 `unknown_addon`/`addon_included_in_package`; 409 `addon_already_purchased`; prices from `@sweepr/utils` ADD_ONS — intentional, matches customer-facing catalogue keys; calls `applyBookingPriceAdjustment` eventType `addon_purchase`). UI: `AddServicesCard.tsx` with authorization-increase consent copy; `TipCard.tsx` (presets + custom, Stripe Elements confirm, "100% of your tip…" copy). GET /bookings/:id now returns `addon_keys`; client Booking type gained `completedAt`.

### Wave 4b — Cleaner UI (commit `2c06206`)
- `apps/cleaner/src/components/ScopeReviewSection.tsx`, rendered in `JobDetailPage.tsx` gated on `job.arrival_verified_at && !isCompleted`: AAF button + de-emphasized refusal under "Having an issue?"; 3-step wizard (photos min 2 / details / submit); status chips; exact disabled-privilege copy w/ 180-day message; duplicates the sign-upload→PUT R2 pattern locally (JobDetailPage's helper is coupled to its action flow).
- `EarningsPage.tsx`: post-payout Tips card. i18n: `cleaner.scopeReview.*` keys added to all 10 locales (9 are English copies — translation follow-up).

### Wave 4c — Admin UI (commit `7263827`)
- `ScopeReviewPage.tsx` (queue, confidence-colored badges, filters, nav "Scope Review"/ScanEye), `ScopeReviewDetailPage.tsx` (AI panel, safety-flag chips, photo lightbox, financial impact, approve/deny/override + fee-tier select), `TrustSafetyPage.tsx` (nav "Trust & Safety"/ShieldBan: customer statuses, greylist, cleaner privileges). Routes `/scope-review`, `/scope-review/:id`, `/trust-safety`.
- `SettingsPage.tsx`: `ScopeReviewSettingsPanel` (cents↔dollars at UI boundary) via new `GET/PATCH /admin/settings/scope-review` (flat bag; original 4-key endpoint untouched).
- New `apps/api/src/routes/adminTrust.ts` at `/admin-trust`: `GET /customers?status=`, `POST /customers/:id/status` `{status, reason?, days?}`, `GET|DELETE /greylist(/:id)`, `GET /cleaner-privileges`, `POST /cleaner-privileges/:cleanerId/restore`. All mutations audited.

## Deploy checklist (NOT yet done — production blockers)
1. **Apply migrations 058 + 059**: `node packages/db/migrate.mjs` against Neon `DATABASE_URL`. (`neon-ensure.sql` is stale/abandoned since ~migration 036 — deliberately not updated.)
2. **Set Cloudflare secrets**: `OPENAI_API_KEY` (required), `OPENAI_VISION_MODEL` (optional, default `gpt-4.1-mini`).
3. Refusal payouts need **manual admin release** — booking ends `cancelled_by_cleaner`, so the completed-bookings auto-release cron skips it (noted in code).

## Known gaps / follow-ups
- Booking acknowledgement is UI-gated only; no server-side consent record (no metadata field on createSchema). Consider persisting via the legal consent tables.
- `cleaningLevel` server default `'refresh'` (backward compat); could be made hard-required now that UI always sends it.
- 9 non-English locales carry English copies of new cleaner-app strings.
- Three parallel server pricing engines still coexist (`sweeprPricingEngine` [live], `pricingEngine`, `pricingRuleEngine` + legacy `calculatePrice` in utils) — consolidation debt.
- Admin queue booking column is plain text (no admin booking-detail page exists).
- No `Switch` primitive in @sweepr/ui (settings toggle is a styled checkbox).
- Carried over from earlier sessions: revoke test Clerk live key when testing done; rotate hardcoded prelaunch bypass code "0123" in PrelaunchGate.tsx before launch.

## Git / process state
- Everything merged to `main` (`01ff05d`); `git cherry origin/main origin/claude/wonderful-fermi-nmlpre` → 0 missing.
- Two merge commits to main were done in a temp worktree (since removed): `a5e74b1` (waves 1–3 + skeleton loaders + Checkr fixes; resolved 4 conflicts — 3 skeleton-loader pages kept branch side, `schema.sql` regenerated) and `01ff05d` (waves 4a–4c, clean).
- Repo git identity set to `Claude <noreply@anthropic.com>`; some pre-existing merged commits show Unverified on GitHub (left alone — rewriting merged history not worth it).
- Verification commands: `npx turbo run typecheck --force` (17 tasks; beware `pnpm -w typecheck -- --force` forwards `--force` into tsc and fails), `npx vitest run apps/api/tests` (45 tests; vitest via npx, not a dep). Schema regen: `node packages/db/build-schema.mjs && node packages/db/verify-schema.mjs`.
