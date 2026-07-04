# Sweepr — Working Context for Claude

Read `context/passdown.md` for what the last session shipped. This file is the stable orientation doc.

## What Sweepr is
Home-cleaning marketplace: customers book cleanings, cleaners fulfill them, admins run the platform. Payments via Stripe (Connect transfers to cleaners), auth via Clerk, email via MailerSend, photos on Cloudflare R2, AI photo review via OpenAI vision (backend-only).

## Monorepo layout (pnpm workspaces + turbo)
- `apps/customer` — customer React app (booking wizard at `src/booking/`, Zustand store `src/store/booking.ts` persisted as `sweepr-booking`)
- `apps/cleaner` — cleaner React app (day-of-service flow in `src/pages/JobDetailPage.tsx`; i18n, 10 locales)
- `apps/admin` — admin console (pages + `components/DataTable.tsx`; nav/routes in `src/App.tsx`)
- `apps/api` — Hono on Cloudflare Workers, Neon Postgres. Routes in `src/routes/*`, mounted in `src/index.ts` (rate limiters declared near CORS there; cron work in the `scheduled` handler)
- `apps/legal` — legal/contract pages (e.g. `/service-scope`)
- `packages/ui` — shared design system (Card, Button, Badge, Modal, toast, Skeleton, TableSkeleton/StatGridSkeleton/CardListSkeleton, booking widgets)
- `packages/utils` — pricing (`pricing.ts`: `calculateQuote`, `ADD_ONS`) and scope data (`scope.ts`: `PACKAGE_SCOPES`, `CLEANING_LEVELS`, `isAddOnIncludedInPackage`)
- `packages/types`, `packages/db` (raw SQL migrations `src/migrations/0NN_*.sql`; consolidated `schema.sql` is GENERATED — regen with `node packages/db/build-schema.mjs && node packages/db/verify-schema.mjs`; apply with `node packages/db/migrate.mjs`; `neon-ensure.sql` is abandoned/stale)

## Hard conventions (violating these breaks things)
1. **Money is integer cents in the DB**; `packages/utils` client quote math is in dollars — be explicit at every boundary.
2. **Never trust frontend pricing/amounts.** Totals are computed server-side; load authoritative state from DB in the handler.
3. **Claim-then-act for money movement**: conditional `UPDATE ... WHERE status=<old> RETURNING` before any Stripe call (see `payments.ts` payouts/refunds, `bookingLedger.ts`).
4. Booking PIs are **manual capture** (single PI per booking; one capture after service via cron, `min(total, authorized)`; Stripe auto-cancels uncaptured PIs after 7 days). Tips are separate immediate-capture PIs.
5. Every price change goes through `apps/api/src/lib/bookingLedger.ts` (`applyBookingPriceAdjustment` / `recordLedgerEntry`) → `booking_price_ledger`.
6. Auth: `requireAuth` middleware (Clerk JWT); admin routes stack `requireAdmin`/role middlewares from `middleware/adminRoles.ts`. Validation: `zValidator` + inline zod. Audit meaningful changes via `lib/audit.ts`.
7. Env vars are typed on `AppBindings` (`apps/api/src/types.ts`), accessed `c.env.X` (Workers — never `process.env`). Secrets documented in `wrangler.toml`.
8. Email-actionable approvals use the signed single-use link pattern (sha256 `token_hash`, `expires_at`, `used_at IS NULL`) — see `fee_change_action_links` / `scope_review_action_links`.
9. Booking status changes must pass `lib/statusMachine.ts` `isValidTransition`.
10. OpenAI is called ONLY from the backend (`lib/aiScopeReview.ts`); raw AI output never reaches customers; AI/cleaners never charge customers — only admin decisions move money.
11. Tips: 100% to cleaner, no platform fee, invisible to cleaners until `booking_tips.visible_to_cleaner` flips at payout.
12. Platform fee applies to booking, add-ons, AAF, refusal fees — never tips.

## Domain model (three independent axes)
- **Package** (`serviceType`) = WHAT gets cleaned (contractual scope; `PACKAGE_SCOPES` included/excluded lists)
- **Cleaning Level** (`cleaningLevel`: refresh / extra_attention / significant_attention) = HOW much labor (surcharge %, never scope)
- **Add-ons** = extra scope; blocked if already included in the package (`isAddOnIncludedInPackage`, server-enforced 400 `addon_included_in_package`); purchasable until cleaner check-in (`arrival_verified_at`)

## Scope review lifecycle (cleaner requests)
Cleaner (checked-in) submits AAF or refusal w/ ≥2 photos → OpenAI vision scores confidence → routing: ≥95 pending_admin (strong approve email) / 75–94 pending_admin / 50–74 auto-denied / <50 hard_denied. Admin decides (UI at `/scope-review` or signed email links). AAF approve → ledger fee (small/medium/large tiers from `site_settings scope_review.*`). Refusal approve → capture clamp(20%, min, max) fee, booking → `cancelled_by_cleaner`, customer → investigating (2nd within 180d → suspended + address greylisted, unit-aware). Abuse: ≥70% request rate + ≥70% denial rate after 10 jobs → privilege disabled 180d. Crons handle expiry/re-enable/status resets.

## Verify before committing
- `npx turbo run typecheck --force` — 17 tasks must pass. (Do NOT use `pnpm -w typecheck -- --force`; the flag is forwarded into tsc and fails.)
- `npx vitest run apps/api/tests` — 45 tests must pass (vitest runs via npx, it's not a package dep).
- App builds: `pnpm --filter @sweepr/customer|@sweepr/cleaner|@sweepr/admin build` for touched apps.
- If migrations changed: regen + verify schema (commands above) and commit the regenerated `schema.sql`.

## Git
- Develop on `claude/wonderful-fermi-nmlpre`; user has standing instruction that finished work gets merged to `main` (verify typecheck+tests on the merge before pushing main).
- Commit as `Claude <noreply@anthropic.com>` (repo config already set). Never put AI model identifiers in commits/code. No PRs unless explicitly requested.
