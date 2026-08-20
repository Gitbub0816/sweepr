> Copyright © 2026–Present ClearKey Solutions, LLC.
> Proprietary & Confidential.
> Internal Use Only.

# Sweepr — Session Passdown

Last updated: **2026-07-13**. Branch: `claude/wonderful-fermi-nmlpre`
(everything merged to `main`; branch kept fast-forwarded to main).
Standing instruction: finished, verified work merges to `main`.
Stable conventions live in root `/CLAUDE.md` — this file is state + recent work.

---

## Session 2026-08-20 (Pricing v2 engine + Pricing Studio, marketing sign-in fix)

- **Pricing v2** (full spec implementation — see docs/PRICING_V2.md):
  mig. 097 (pricing_versions/pricing_quotes_v2/pricing_audit_events + booking
  refs), `apps/api/src/lib/quoteEngine/` (ordinal inference w/ exact
  order-statistic likelihood, consensus + floor product rules, integer-cents
  money, deterministic fingerprints), booking/quote/checkout integration
  behind an ACTIVATION GATE (v2 dark until an admin publishes a version;
  archive active = instant legacy fallback), customer wizard clutter +
  counts-by-level + confirmation copy, admin **Pricing Studio**
  (/pricing-studio; matrix/prediction/extras/rates/scheduling/test-quote/
  publish/history; finance role + content.pricing.publish/advanced_model),
  cron activation of scheduled versions, 49 new tests + shadow-comparison
  report. **Cold-start config is a TRANSLATION at $60/labor-hour and needs
  Caleb's approval before publishing** (assumptions table in the doc; heavy
  homes price up to +38% because every room now bills, not just the worst
  per type). Legacy engines intentionally retained until post-activation
  cleanup (doc has the list).
- **Marketing sign-in** now routes to auth.getsweepr.com (standalone
  shared-Clerk-session mode added to the auth app; broker ceremony untouched;
  return_to allowlisted to *.getsweepr.com).

- **End-to-end review shipped** (artifact "Sweepr Site Review"): 51 ranked
  findings w/ file refs. Top unfixed: DemoCheckout ships on missing Stripe
  key (PaymentStep.tsx:31), double-submit refresh bypasses price ledger
  (bookings.ts:683), refusal fee clobbers totals w/o CAS
  (scopeReviewEngine.ts:410), capture cron starvation (index.ts:653),
  business/auth origins missing from cors.ts allow-list, THREE divergent
  admin-permission systems, onboarding draft self-destructs on refresh
  (OnboardingPage.tsx:213), status page green during outages. Fixed during
  review: booking-draft partialize gap, legal PostHog consent bypass,
  audit CVEs, wrangler TOML routes scoping.

## Session 2026-08-17 (Site Analytics + tracking links, Coverdash, Yardstik prod prep)

Branch `claude/analytics-dashboard-tracking-667zz8`, merged to main on
user instruction (deploys only run from main). User confirmed tracker
coverage is "all pages except admin" — which is what shipped.

- **First-party site analytics** (user asked for "truly individualized
  metrics", separate from current Observability):
  - Mig. **096**: `tracking_links`, `site_events`, `site_sessions`. Distinct
    from the old `analytics_events` observability table on purpose.
  - New Worker **apps/analytics** (`sweepr-analytics`): `POST /collect`
    ingest (Origin-checked *.getsweepr.com, plain-text body = no preflight,
    per-IP in-isolate budget, UA parsed server-side, geo from `request.cf`,
    salted IP hash only) and `GET /go/{code}` tracking-link redirector
    (validated destinations, forwards ad params, stamps `swl/sws/swc`,
    denormalized hit counters). Routes: custom domain metrics.getsweepr.com
    (wrangler auto-DNS) + zone route `getsweepr.com/go/*`. Optional IPinfo
    enrichment (`IPINFO_TOKEN`; first event per session + link hits, 6h
    cache). deploy.yml job `deploy-analytics` syncs `DATABASE_URL` (+optional
    `ANALYTICS_IP_SALT`, `IPINFO_TOKEN`) from GitHub secrets.
    **Watch on first deploy**: confirm `/go/*` zone route takes precedence
    over the marketing Pages custom domain (docs say Workers routes run
    first; if not, links also work as metrics.getsweepr.com/go/{code} — flip
    the URL the admin UI displays in AnalyticsPage/adminSiteAnalytics).
  - Tracker `packages/ui/src/lib/siteTracker.ts` in marketing, customer,
    cleaner, legal, status main.tsx (admin deliberately excluded; business
    not yet). Cookieless/tab-scoped until analytics consent; `swa_*` cookies
    (13mo/30min/90d) registered in cookieEngine + Cookie Policy. SPA route
    hooks, click capture, sendBeacon flush. CSPs: all 5 apps' connect-src +
    metrics host. Custom events via `trackSiteEvent(name, meta)`.
  - Legal app's inline PostHog init (consent-less AND CSP-blocked = dead
    code) replaced with the shared consent-gated `initAnalytics` + tracker;
    legal CSP now carries posthog hosts.
  - API: `routes/adminSiteAnalytics.ts` → `/admin/site-analytics/*`
    (overview/breakdowns/pages/geo/live/sessions + links CRUD w/ zod +
    audit; codes immutable after create). Screen slug `analytics` in both
    permissions files. Cron: 395-day retention deletes.
  - Admin `/analytics` (Platform group, lazy chunk ~238KB gz): R3F visitor
    globe (city dots from cf lat/lon) + 3D daily bars + recharts timeseries
    (colors validated light+dark), breakdowns (device/OS/browser/geo/
    language/source/campaign/link), top pages/clicks, tracking-link manager
    (create→URL copied to clipboard), session explorer w/ journey modal
    (shows IPinfo VPN flags when present).
  - Legal: Privacy Policy §3.2.1 (first-party analytics, hashed IP, GPC,
    consent model), retention line (13mo), IPinfo subprocessor added,
    PostHog "self-hosted" mis-claim fixed; Cookie Policy `swa_*` rows;
    Subprocessors + IPinfo row.
- **Coverdash affiliate** (cleaner insurance): partner card in
  InsurancePage "My Own Policy" tab + onboarding BusinessVerificationStep
  (`apps/cleaner/src/lib/partners.ts` holds the quote URL). Copy explicitly
  says purchase does NOT auto-link; COI upload still required.
- **Yardstik prod readiness**: audited — fully secret-driven, default host
  already production. Runbook: **docs/YARDSTIK_PRODUCTION_SWITCH.md**
  (3 secret swaps + YARDSTIK_API_URL, webhook registration, verify steps,
  post-cutover CSP cleanup). No code changes needed for cutover.
- Tests 330→353 (site-analytics.test.ts: destination/open-redirect gate, UA
  parser, ingest normalization, links CRUD). Full typecheck + all app builds
  green; schema.sql rebuilt.
- **User-answer ambiguity flagged**: coverage question answered "All pages
  except for marketing" while ALSO selecting Marketing; marketing was
  included (tracking links land there). Trivial to remove if wrong: delete
  initSiteTracker from apps/marketing/src/main.tsx.

---

## Session 2026-07-13 (Central auth broker — pilot wiring, business app)

Sweepr-owned central auth broker (Rust Worker, `services/auth-broker`) now has
its pilot integration: **apps/business**. Architecture recap:

- **Broker** (`broker.getsweepr.com`): Clerk proves WHO; the broker decides
  WHICH app and issues that app's own isolated session. Per-app `__Host-`
  cookies (`__Host-sweepr_business_session` etc., registry in
  `services/auth-broker/src/registry.rs`), PKCE S256 code exchange, one-time
  ≤45s codes, opaque session tokens (digest at rest), app binding enforced in
  SQL WHERE clauses — cross-app session reuse is structurally impossible.
  Service auth: `Authorization: Bearer BROKER_KEY_<APP>` — the key IS the app
  identity. Admin is a physically separate deployment.
- **Pilot BFF** (`apps/business/functions/` — Cloudflare Pages Functions,
  dependency-free, Web Crypto + fetch only):
  `/auth/login` (PKCE verifier + challenge, broker transaction, 300s HttpOnly
  `__Host-sweepr_business_login` stash cookie, 302 to broker login page;
  `?fail=1` renders a static error page — no redirect loops),
  `/auth/callback` (constant-time state check against the cookie, code+PKCE
  exchange, sets the session cookie exactly per the broker's cookie contract,
  redirects to sanitized relative return path), `/auth/session` (introspection
  → token-free `{active, principal_user_id, expires_at}`, no-store),
  `/auth/logout` (POST-only, Origin-checked). Shared `functions/_lib.ts`
  mirrors the broker's `sanitize_return_path`. All endpoints fail closed
  (missing `BROKER_KEY_BUSINESS` or flag → 503). Tokens never reach the
  browser, URLs, storage, or logs.
- **Frontend gate**: `src/components/CentralSession.tsx`. Explicit migration
  gate `VITE_CENTRAL_AUTH_ENABLED === "true"` selects exactly one path:
  on → `SessionProvider` introspects `/auth/session` BEFORE any protected
  render/data fetch (else immediate redirect to `/auth/login?return_to=…`,
  splash only); off → existing Clerk `ProtectedRoute` untouched.
- **Remaining ops steps**: create broker KV namespaces (RATE_KV); set broker
  worker secrets (`DATABASE_URL`, `CLERK_ISSUER`, `IP_HASH_SALT`,
  `AUTH_PAGE_ORIGIN`, `BROKER_DEPLOYMENT`, `CENTRAL_AUTH_ENABLED`, per-app
  `BROKER_KEY_*`); set `BROKER_KEY_BUSINESS` + `CENTRAL_AUTH_ENABLED` on the
  sweepr-business Pages project too (same key both sides); set
  `DEPLOY_AUTH_BROKER=true` for the workflow; DNS for `broker.getsweepr.com`
  and `auth.getsweepr.com` (hosted login page); admin broker is a separate
  deployment with its own secrets — do NOT share keys. Flip
  `VITE_CENTRAL_AUTH_ENABLED=true` for business only once the broker is live.

---

## Session 2026-07-13 (Multi-app auth epic — four Clerk applications)

Moving from two Clerk applications to FOUR (customer app.getsweepr.com,
business business.getsweepr.com, cleaner clean.getsweepr.com, admin
admin.getsweepr.com) over a Sweepr-owned platform identity layer.

- **Identity layer**: migration 090 `platform_identity_workspaces.sql` —
  canonical identity mapping N per-app Clerk identities onto one `users` row;
  workspaces (members, roles, properties) for Sweepr Business.
- **API libs**: `apps/api/src/lib/authApps.ts` (per-app Clerk instance
  registry / issuer routing) + `apps/api/src/lib/identity.ts` (identity
  resolution). Workspace engine + `apps/business` scaffold in progress on a
  parallel track (another session) — verify merged state before depending on
  exact shapes.
- **Customer conversion UI (this session)**: `/business` page in
  `apps/customer` (`src/pages/BusinessPage.tsx`) — explainer, three paths
  (full convert / partition with address checkboxes from
  `/customer-profile/addresses` / fresh workspace), confirmation modal, then
  `POST /account/business-transition` → shows returned single-use 15-minute
  `transitionUrl` ("Continue in Sweepr Business", new tab; token never
  logged). Degrades gracefully (friendly toast) while the endpoint doesn't
  exist yet. Entry card `BusinessUpsellCard` on `/profile`.
- **Remains**: create the two new Clerk applications (customer split +
  business) in the Clerk dashboard, provision publishable/secret keys +
  webhook secrets (deploy.yml bake + wrangler secrets), DNS (DNS-only
  records), and land `/account/business-transition` +
  `business.getsweepr.com/claim`.

## Session 2026-07-07 → 07-09 (Yardstik, Clerk split, comms, scheduler)

### Background checks: Checkr → Yardstik (merged; STAGING creds)
- Full provider migration. Normalized status vocabulary unchanged
  (`not_started|invited|pending|consider|clear|suspended|dispute|pre_adverse_action|adverse_action`);
  new `yardstik_*` columns (mig. 081), old `checkr_*` kept for history.
  `lib/yardstik.ts` (mock when no key), `routes/yardstik.ts`, adjudication
  rewired, legal/marketing pages name "Yardstik, Inc.".
- **Currently staging**: `YARDSTIK_API_URL=https://api.yardstik-staging.com`,
  staging key, package `6abeeb85-5023-412b-95df-bcb57300a4d7` ("Federal
  Premium", system name `federal_premium`). Prod switch = swap 3 secrets +
  register prod webhooks (CSP already allows `*.yardstik.com`).
- Webhook signing verified working: dashboard API key named exactly
  `WEBHOOK_SIGNATURE`; verifier accepts raw-body OR re-serialized JSON HMAC;
  secret trimmed of paste artifacts.
- `/yardstik/invite` reconciles an existing report instead of re-ordering
  (Yardstik rejects duplicates within 30 days) and self-heals stale DB status;
  owner accounts get the raw Yardstik error `detail` on 502s.
- **Open decision — embedding the candidate apply form.** `meta.apply`
  (profile.yardstik-staging.com) is a SPA needing first-party cookies → blank
  in a cross-site iframe (no X-Frame-Options; it's Chrome third-party-cookie
  blocking). Researched thoroughly: embeddable SDK (`CandidateReportIframe`,
  JWT via `POST /web_tokens`) is **account-user/staff only** — tested, returns
  404 for candidate emails; no API surface for custom domains; Yardstik's own
  help docs say to send candidates to profile.yardstik.com. Options:
  (a) ask Yardstik sales for white-label intake domain (no public evidence);
  (b) self-hosted intake via `account_candidate_consented: true`
  (feature-gated; FCRA disclosure/consent liability shifts to us);
  (c) current state: iframe + "open in new tab" fallback. User wants iframe —
  awaiting decision/Yardstik answer.

### Auth
- **Sign-up hang fixed**: primary Clerk instance requires first/last name (+
  username/phone as optional identifiers). Forms now collect names; verify
  handler completes missing fields or routes to `/sign-up/continue`
  (customer + cleaner apps). Email/phone/username are all optional identifiers.
- **Separate Clerk application for admin** (`clerk.admin.getsweepr.com`) so
  staff sessions are independent (Clerk shares one session per root domain —
  unsplittable in code; two apps can't share a root domain, hence
  primary/secondary domain arrangement). Email+code sign-in only (password/SSO
  off). Owner user created in the admin instance
  (`user_3GHQZpri25n0aD03dHfHsv23wZq`, verified email, super_admin metadata).
- API: per-issuer token verification; admin-instance identities map to the
  canonical `users` row **by verified email** (no relinking — the
  relink-by-email hazard is documented in `middleware/auth.ts`).
  New webhook `/webhooks/clerk-admin` (mapping-aware, never clobbers primary
  rows). Admin CSP + deploy workflow carry the admin publishable key
  (`pk_live_Y2xlcmsuYWRtaW4uZ2V0c3dlZXByLmNvbSQ`).
- 5 Clerk CNAMEs for `admin.getsweepr.com` added in Cloudflare (DNS-only).
- **DONE (2026-07-09)**: Worker secrets `CLERK_ADMIN_SECRET_KEY` +
  `CLERK_ADMIN_WEBHOOK_SECRET` set and verified working; admin webhook
  registered; admin sign-in (email+code) functional end to end.

### Email & SMS
- `wrapBodyInTemplate` rewritten: branded, responsive, email-client-safe
  (tables + inline CSS, preheader, accent bar, CTA button w/ optional icon,
  proper footer) — upgraded every code-rendered email at once. Cleaner
  approval/rejection emails rebuilt ("Open Sweepr" CTA; no logo inside the
  teal button — the teal logo was invisible on it). Logo asset:
  `objects.getsweepr.com/site_assets/public/Sweepr-logo.png`.
- Hosted MailerSend admin templates recreated as API-editable via the
  MailerSend MCP: `Sweepr Admin Invite` `3z0vklo5j2p47qrx`,
  `Sweepr Admin Approval Request` `7dnvo4dyep345r86` (code repointed).
  Old dashboard versions orphaned (safe to delete). Security/IT templates
  intentionally untouched. Reset Password is Clerk's.
- **Inbound rich HTML** (mig. 082 `mailbox_messages.body_html`): sanitized
  server-side at ingest (`lib/emailHtml.ts` — strips scripts/handlers/non-http
  URLs, forces safe new-tab links); admin Mail reading pane renders HTML on a
  white surface and auto-linkifies plain text. Only post-deploy mail has HTML.
- SMS: MailerSend toll-free `+18335367404` (`MAILERSEND_SMS_FROM`). Verified
  end-to-end; **delivery lags minutes** behind MailerSend's "sent" (toll-free
  A2P) — not a bug.

### Admin Schedule calendar + automation engine (new, 2026-07-09)
- Mig. 082 `scheduled_events`; `lib/scheduledActions.ts` catalog + executor;
  `/admin/schedule` CRUD + run-now + SSRF-safe ICS import + ICS export;
  month-grid Schedule page (Comms group). Cron (`*/15`) executes due
  automations: claim-by-status-transition (race-safe), 6h misfire guard.
- Actions: `broadcast_email` (audience: newsletter/waitlists/city/all; records
  to `broadcast_sends`; English-only in v1 — no per-language translation like
  the interactive Broadcasts page), `status_announcement` (status_incidents),
  `service_area_launch` (activate by slug), `prelaunch_toggle`
  (site_settings), `admin_alert` (alert fan-out, category `it`).
- This is THE mechanism for launch-day: schedule `prelaunch_toggle` off +
  launch broadcast at the chosen moment.

### Fixes & polish this session
- **Didit status polling 429** → onboarding never advanced: polled GETs
  (`/didit/status`, `/yardstik/status`) moved off the strict 10/15m mutation
  bucket to 240/15m per-user poll buckets.
- Marketing mobile hamburger 404 (ClerkProvider double-mount) fixed.
- CSP: cleaner app allows `*.yardstik-staging.com` (frame+connect); admin
  allows `clerk.admin.getsweepr.com`.
- `PhoneInput` primitive + phone helpers in `@sweepr/ui`; wired into admin SMS
  alert phone + customer/cleaner contact settings. E.164 in DB everywhere.
- **Dark theme**: warm graphite replaces blue-gray slate + navy charcoal
  (shared preset override) + subtle dark-only film grain (opacity 0.04).
  WCAG re-sweep pending.
- Clerk primary webhook flood damping + specific invalid-signature reasons
  (secret must be `whsec_…`, not an API key).
- Test suite grew to **365 tests** (incl. `apps/api/tests/yardstik.test.ts`).

---

## Open items (in priority order)
1. Yardstik: embed decision (white-label ask vs self-hosted intake vs keep
   fallback); production credential switch when account is credentialed.
2. WCAG sweep after the dark-theme change.
3. Sentry MCP setup with real DSNs (task #112, parked).
4. Rotate anything shared in chat transcripts (temp Clerk keys, CF token —
   user said they'd revoke; verify).
5. Pre-launch: rotate hardcoded prelaunch bypass code "0123"
   (PrelaunchGate.tsx); revoke stale test Clerk keys.
6. Scheduled `broadcast_email` is English-only (no translation pass) — port
   the Broadcasts translation grouping if multilingual scheduled sends matter.

## Earlier sessions (condensed; details in git history)
- **2026-07-04 — Booking/Pricing/Payment engine** (scope review lifecycle, AI
  vision routing, booking ledger, manual-capture pipeline, tips, trust/safety
  consoles, migrations 058–059). Conventions from it are canonized in
  /CLAUDE.md. Known gaps still true: booking acknowledgement is UI-gated only;
  9 locales carry English copies of cleaner scope-review strings; three
  parallel server pricing engines coexist (consolidation debt); no Switch
  primitive in @sweepr/ui.
- **Security/perf session**: IDOR fixes (admin status/insurance requireAdmin,
  storage sign-upload ownership), Neon client memoization + index migrations
  060–061, Checkr client bug removal (superseded by Yardstik).
- **Admin platform sessions**: IT/Security consoles, Mail center, alerting
  (prefs/fan-out/badges), approvals + pricing engines with Slack cards,
  permissions/access control, service-area + assignment engine, adjudication
  engine, admin reorg with grouped nav.

## Gotchas (do not relearn)
- wrangler.toml `routes` MUST sit above the FIRST `[section]` header. TOML
  scopes keys to the preceding table, so `routes` under `[vars]` (or
  `[observability.logs]`) becomes that table's key and wrangler attaches NO
  routes/custom domains — deploy still "succeeds". Cost sweepr-analytics its
  first deploy; api.getsweepr.com only ever worked because its domain was
  bound in the dashboard.
- Strict rate buckets on polled GETs break onboarding — give polls their own bucket.
- `wrangler secret put` via `echo` adds a newline; use `printf`. Wrapping
  quotes/whitespace in secrets broke Yardstik twice (code now trims — set clean anyway).
- MailerSend dashboard-created templates 404 on API update — create via API.
- Rotating a Clerk publishable key requires rebuilding every Pages app (baked
  at build); stale Clerk cookies after rotation cause 401/400 storms — clear
  site data / incognito.
- Clerk DNS records must be DNS-only (Cloudflare proxy breaks verification).
- One browser = one session per Clerk instance — test personas via separate
  browser profiles.
- Yardstik REST auth is `Authorization: Account <key>` — Bearer/Token fail.
- `npx turbo run typecheck --force`, never `pnpm -w typecheck -- --force`.
