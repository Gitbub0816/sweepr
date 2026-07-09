> Copyright © 2026–Present ClearKey Solutions, LLC.
> Proprietary & Confidential.
> Internal Use Only.

# Sweepr — Session Passdown

Last updated: **2026-07-09**. Branch: `claude/wonderful-fermi-nmlpre`
(everything merged to `main`; branch kept fast-forwarded to main).
Standing instruction: finished, verified work merges to `main`.
Stable conventions live in root `/CLAUDE.md` — this file is state + recent work.

---

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
- **OPEN**: set Worker secrets `CLERK_ADMIN_SECRET_KEY` +
  `CLERK_ADMIN_WEBHOOK_SECRET`; register the admin webhook; confirm Clerk
  domain verification green; user rotates the temp keys shared during setup.

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
1. Clerk admin instance: two Worker secrets + webhook registration + domain
   verify (see Auth above). Until then admin sign-in works but API calls from
   the admin app will 401.
2. Yardstik: embed decision (white-label ask vs self-hosted intake vs keep
   fallback); production credential switch when account is credentialed.
3. WCAG sweep after the dark-theme change.
4. Sentry MCP setup with real DSNs (task #112, parked).
5. Rotate anything shared in chat transcripts (temp Clerk keys, CF token —
   user said they'd revoke; verify).
6. Pre-launch: rotate hardcoded prelaunch bypass code "0123"
   (PrelaunchGate.tsx); revoke stale test Clerk keys.
7. Scheduled `broadcast_email` is English-only (no translation pass) — port
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
