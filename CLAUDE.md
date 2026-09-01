> Copyright © 2026–Present ClearKey Solutions, LLC.
> Proprietary & Confidential. Internal Use Only.

# CLAUDE.md — Sweepr working guide (canonical)

Read `context/passdown.md` for what recent sessions shipped and what's open.
This file is the stable orientation doc.

## What Sweepr is
Home-cleaning marketplace: customers book cleanings, cleaners fulfill, admins run
the platform. Stripe (manual-capture PIs + Connect transfers), Clerk auth (TWO
applications — see Auth), MailerSend email/SMS, Cloudflare R2 photos, OpenAI
vision for scope review (backend-only), Yardstik background checks (staging),
Didit identity verification, Neon Postgres, Hono on Cloudflare Workers.

## Monorepo (pnpm workspaces + Turbo) — deploy.yml is domain truth

| Path | Deploys to |
| --- | --- |
| `apps/api` | Worker `sweepr-api` → api.getsweepr.com (cron `*/15 * * * *`) |
| `apps/analytics` | Worker `sweepr-analytics` → metrics.getsweepr.com + zone route `getsweepr.com/go/*` (first-party analytics ingest + tracking-link redirects) |
| `apps/marketing` | getsweepr.com |
| `apps/customer` | app.getsweepr.com (booking wizard `src/booking/`, Zustand store `src/store/booking.ts`) |
| `apps/cleaner` | clean.getsweepr.com + dashboard.getsweepr.com (day-of-service `src/pages/JobDetailPage.tsx`; 10 locales) |
| `apps/admin` | admin.getsweepr.com (nav/routes in `src/App.tsx`) |
| `apps/legal` | legal.getsweepr.com |
| `apps/status` | status.getsweepr.com |
| `apps/service` | service.getsweepr.com (demo) |
| `packages/db` | raw SQL migrations `src/migrations/0NN_*.sql`; `schema.sql` is GENERATED |
| `packages/ui` | design system (Card/Button/Modal/toast/PhoneInput/SweeprCalendar…) |
| `packages/utils` | pricing (`pricing.ts`) + scope data (`scope.ts`) |
| `packages/config` | `tailwind.ts` shared theme preset (see Theme) |

## Verify before committing

```bash
npx turbo run typecheck --force        # all tasks must pass
                                       # (NOT `pnpm -w typecheck -- --force` — forwards --force into tsc)
npx vitest run apps/api/tests          # API suite (currently 365 tests) — vitest via npx, not a dep
npx turbo run build --filter=@sweepr/<app>   # for touched frontends
# if migrations changed (CI hard-fails otherwise):
node packages/db/build-schema.mjs && node packages/db/verify-schema.mjs
```

## Deploy model
Push to `main` → GitHub Actions: typecheck → apply migrations (`migrate.mjs`) →
`wrangler deploy` the API → deploy every Pages app. **Everything auto-deploys.**
Frontend env (e.g. Clerk publishable keys) is baked at build time in the workflow.
Worker secrets: `printf 'value' | wrangler secret put NAME` in `apps/api`
(`echo` adds a trailing newline — this has broken integrations). Secret catalog =
comments in `apps/api/wrangler.toml`.

## Git / process
- Develop on `claude/wonderful-fermi-nmlpre`; standing instruction: finished,
  verified work merges to `main` (keep the branch fast-forwarded to main after).
- Commit as `Claude <noreply@anthropic.com>` (repo config set). Never put AI
  model identifiers in commits/code. No PRs unless explicitly requested.

## Hard conventions (violating these breaks things)
1. **Money is integer cents in the DB**; `packages/utils` client quote math is in
   dollars — be explicit at every boundary.
2. **Never trust frontend pricing/amounts** — totals computed server-side from DB.
3. **Claim-then-act for money movement**: conditional
   `UPDATE … WHERE status=<old> RETURNING` before any Stripe call
   (`payments.ts`, `bookingLedger.ts`). Same pattern for scheduled-event
   execution (`lib/scheduledActions.ts`).
4. Booking PIs are **manual capture** (one PI per booking; capture after service
   via cron, `min(total, authorized)`; Stripe cancels uncaptured PIs after 7
   days). Tips are separate immediate-capture PIs, 100% to cleaner, no platform
   fee, invisible until `booking_tips.visible_to_cleaner` flips at payout.
5. Every price change goes through `lib/bookingLedger.ts`
   (`applyBookingPriceAdjustment` / `recordLedgerEntry`) → `booking_price_ledger`.
6. Auth middleware: `requireAuth` (+ `requireAdmin`/roles from
   `middleware/adminRoles.ts` on admin routers). Validation: `zValidator` + zod.
   Audit meaningful changes via `lib/audit.ts`.
7. Env vars typed on `AppBindings` (`apps/api/src/types.ts`), accessed `c.env.X`
   (Workers — never `process.env`).
8. Email-actionable approvals use the signed single-use link pattern (sha256
   `token_hash` + `expires_at` + `used_at IS NULL`).
9. Booking status changes must pass `lib/statusMachine.ts` `isValidTransition`.
10. OpenAI is called ONLY from the backend (`lib/aiScopeReview.ts`); raw AI output
    never reaches customers; only admin decisions move money.
11. Outbound email ONLY via `lib/mailer.ts`; body emails use
    `wrapBodyInTemplate(subject, body, lang?, opts?)` — branded, email-client-safe
    (preheader, CTA w/ optional icon, unsubscribe for marketing). Logo:
    `https://objects.getsweepr.com/site_assets/public/Sweepr-logo.png`.
    Brand is "Sweepr" — never "Sweepr Pro".
12. Outbound SMS ONLY via `lib/sms.ts` (consent re-verified per send;
    transactional allowlist). Toll-free sender; "sent" ≠ delivered (A2P lag).
13. Phones stored as E.164 (`+1XXXXXXXXXX`). UI: `PhoneInput` from `@sweepr/ui`
    (masks `(XXX) XXX-XXXX`, emits E.164); helpers `toE164US`/`isCompleteUsPhone`.
14. Rate limiting (`index.ts`): strict low buckets are for *mutations*. Polled
    read endpoints (`/didit/status`, `/yardstik/status`, `/auth/me`) get their
    own generous bucket — strict buckets on polls have broken onboarding twice.
15. Each Pages app has its own CSP in `apps/<app>/public/_headers`; new external
    script/XHR/iframe origins must be added there (browsers cache it).
16. Every source file starts with the ClearKey copyright header.

## First-party site analytics (separate from Observability)
`site_events`/`site_sessions`/`tracking_links` (mig. 096) are OUR web
analytics, distinct from the older `analytics_events` observability table.
Pipeline: `packages/ui/src/lib/siteTracker.ts` (all public apps' main.tsx) →
`sweepr-analytics` worker `/collect` → Neon; admin reads
`/admin/site-analytics/*` (routes/adminSiteAnalytics.ts) → admin `/analytics`
page (R3F globe + bars; lazy chunk). Tracking links: admin creates
`getsweepr.com/go/{code}` (source + optional campaign ID); the worker logs the
hit and 302s to a `normalizeDestination`-validated *.getsweepr.com URL with
`swl/sws/swc` params the tracker picks up. Privacy invariants: raw IPs never
stored (salted hash), cookieless until analytics consent (`swa_*` cookies are
registry-classified "analytics" in cookieEngine.ts), GPC honored, 13-month
retention via the API cron. Adding a tracked app: init tracker + add
`https://metrics.getsweepr.com` to its CSP connect-src + `SITE_APPS` in
`packages/utils/src/siteAnalytics.ts`. Keep the Privacy/Cookie Policies in
sync with any collection change.

## Auth — TWO Clerk applications
1. **Primary** (`clerk.getsweepr.com`): customers + cleaners; one account can be
   both. Session is shared across all getsweepr.com subdomains by Clerk design —
   cannot be split in code; use separate browser profiles to test personas.
2. **Admin** (`clerk.admin.getsweepr.com`): separate Clerk application → staff
   sessions independent of user sessions. Email + code sign-in only.

`middleware/auth.ts` verifies tokens against whichever instance issued them
(unverified `iss` routes key choice; verification stays cryptographic).
**Admin-instance identities map onto the canonical `users` row by verified
email** — never relink/duplicate rows. Webhooks: `/webhooks/clerk`
(`CLERK_WEBHOOK_SECRET`) and `/webhooks/clerk-admin`
(`CLERK_ADMIN_WEBHOOK_SECRET`); Svix, secrets are `whsec_…`.
Primary sign-up requires first/last name; forms collect them and
`/sign-up/continue` collects any remaining required fields — a verified but
non-`complete` sign-up must route there, never hang.
Owners (`1morecruise@gmail.com`, `caleb.owen2019@outlook.com`) self-heal to
`super_admin`; never seed owners as test cleaners (seed script guards it).

**Four-application migration (in progress).** Target: four separate Clerk
applications — customer (app.getsweepr.com), business (business.getsweepr.com),
cleaner (clean.getsweepr.com), admin (admin.getsweepr.com) — over a
Sweepr-owned platform identity layer (mig. 090
`platform_identity_workspaces`): a canonical identity maps N Clerk identities
(one per app) onto one `users` row, and workspaces group members/properties for
Sweepr Business. Key libs: `apps/api/src/lib/authApps.ts` (per-app Clerk
instance registry) and `apps/api/src/lib/identity.ts` (identity resolution).
Cross-app hand-offs (e.g. customer → business conversion,
`POST /account/business-transition`) use the signed single-use link pattern
(convention 8): 15-minute `transitionUrl` into `business.getsweepr.com/claim`.
Customer entry UI: `apps/customer/src/pages/BusinessPage.tsx` (`/business`).

**Central auth broker (pilot: business app).** `services/auth-broker` (Rust
Worker, broker.getsweepr.com) sits above Clerk: Clerk proves WHO, the broker
decides WHICH app and mints that app's own isolated session (per-app `__Host-`
cookie, registry = `src/registry.rs`; admin is a physically separate
deployment). Flow: app BFF creates a PKCE transaction (service key
`BROKER_KEY_<APP>` IS the app identity) → hosted login page → one-time code →
BFF exchanges code+verifier → session cookie; signed-in state is validated
ONLY via `/v1/auth/introspect` before any data render. Pilot integration:
`apps/business/functions/` (Pages Functions BFF, dependency-free) +
`src/components/CentralSession.tsx`, gated by `VITE_CENTRAL_AUTH_ENABLED`
("true" = broker path, otherwise Clerk gating — exactly one active). Tokens
never appear in URLs, storage, logs, or frontend code. Fail closed: missing
key/flag → 503.

## Pricing v2 (versioned labor-minutes engine) — docs/PRICING_V2.md
`apps/api/src/lib/quoteEngine/` is THE authoritative quote service (ordinal
room-condition inference + integer-cents money). Tables (mig. 097):
`pricing_versions` (immutable once published; ONE active per area/currency),
`pricing_quotes_v2` (immutable snapshot per quote; bookings stamp
`pricing_version_id`+`pricing_quote_v2_id`), `pricing_audit_events`. Rollout
gate: v2 prices customers ONLY while a version is Active (publish in admin
Pricing Studio → /admin/pricing-v2); otherwise the legacy chain
(roomPricing → rule → legacy) runs unchanged. Legacy engines stay until
post-activation cleanup (list in the doc). Shadow report:
`npx vitest run apps/api/tests/pricing-v2-shadow.test.ts`.

## Domain model (three independent axes)
- **Package** (`serviceType`) = WHAT gets cleaned (`PACKAGE_SCOPES`)
- **Cleaning Level** (refresh / extra_attention / significant_attention) = HOW
  much labor (surcharge %, never scope)
- **Add-ons** = extra scope; blocked if package-included
  (`isAddOnIncludedInPackage`, server-enforced); purchasable until check-in.

## Scope review lifecycle (cleaner AAF/refusal requests)
Checked-in cleaner submits w/ ≥2 photos → OpenAI vision confidence → routing
(≥95 pending_admin strong-approve email / 75–94 pending_admin / 50–74
auto-denied / <50 hard_denied) → admin decides (`/scope-review` UI or signed
email links). AAF approve → ledger fee (tiers in `site_settings scope_review.*`);
refusal approve → capture clamp(20%, min, max), booking `cancelled_by_cleaner`,
customer investigating (2nd in 180d → suspended + address greylisted).
Abuse throttle: ≥70% request + ≥70% denial rate after 10 jobs → privilege off 180d.

## Admin schedule calendar (automation engine)
`scheduled_events` (mig. 082) + `lib/scheduledActions.ts` +
`routes/adminSchedule.ts` + admin Comms → Schedule. Cron executes due
automations (claim-by-status-transition, 6h misfire guard): `broadcast_email`,
`status_announcement`, `service_area_launch`, `admin_alert`. Retired action
types (e.g. the old launch-gate toggle) are skipped fail-safe via
`RETIRED_ACTION_TYPES`. Add an
action = one `SCHEDULED_ACTION_CATALOG` entry + one executor case. ICS import
is SSRF-safe (`lib/calendarSecurity.ts`); export `/admin/schedule/export.ics`.

## Integration facts that have bitten us
- **Yardstik** (staging `api.yardstik-staging.com`): auth header
  `Authorization: Account <key>`. Reports need `account_package_id` (staging
  "Federal Premium" = `6abeeb85-5023-412b-95df-bcb57300a4d7`). Webhooks signed
  by a dashboard API key literally named `WEBHOOK_SIGNATURE` (HMAC-SHA256 hex →
  `x-yardstik-webhook-signature`); register every event type against
  `https://api.getsweepr.com/webhooks/yardstik`. `/yardstik/invite` reconciles
  existing reports (30-day dedup). Candidate `meta.apply` page renders BLANK in
  a cross-site iframe (third-party cookies) — iframe + new-tab fallback is
  current; `@yardstik/embeddable-sdk` is staff-only, NOT for candidates.
- **MailerSend**: dashboard-created templates are NOT API-editable; hosted
  template IDs live in `TEMPLATES` (`lib/mailer.ts`). Security/IT templates are
  hands-off. Inbound mail → `mailbox_messages` with sanitized `body_html`
  (`lib/emailHtml.ts`); admin Mail renders HTML + linkifies plain text.
- **Errors**: any `logger.error/warn` during a request auto-flushes to the admin
  error feed with full context; owner accounts may get a `detail` field in
  error responses.

## Theme
Shared preset `packages/config/tailwind.ts`. Dark mode = **warm graphite**
(slate scale overridden to warm neutrals — deliberately no blue; `charcoal` =
`#1c1a17`) + subtle dark-only film grain (opacity 0.04, preset plugin). Don't
reintroduce blue-gray.

## Secrets hygiene
Publishable keys (`pk_…`) may live in code; secret keys (`sk_…`, `whsec_…`,
tokens) only via `wrangler secret put` / GitHub secrets. Anything pasted into a
chat transcript gets rotated.
