# CLAUDE.md — Agent guide for the Sweepr monorepo

Sweepr is a residential-cleaning marketplace by ClearKey Solutions, LLC.
pnpm workspaces + Turbo. Backend is a single Hono app on Cloudflare Workers;
frontends are Vite/React on Cloudflare Pages; DB is Neon Postgres.

## Layout & live domains (deploy.yml is the source of truth)

| Path | Deploys to |
| --- | --- |
| `apps/api` | Worker `sweepr-api` → api.getsweepr.com (+ cron `*/15 * * * *`) |
| `apps/marketing` | getsweepr.com |
| `apps/customer` | app.getsweepr.com |
| `apps/cleaner` | clean.getsweepr.com (same build also → dashboard.getsweepr.com) |
| `apps/admin` | admin.getsweepr.com |
| `apps/legal` | legal.getsweepr.com |
| `apps/status` | status.getsweepr.com |
| `apps/service` | service.getsweepr.com (demo) |
| `packages/db` | migrations + generated `schema.sql` |
| `packages/ui` / `utils` / `types` / `config` | shared libs (`config/tailwind.ts` = shared theme preset) |

## Commands

```bash
pnpm install
npx turbo run typecheck                          # all workspaces (run before every commit)
npx turbo run typecheck --filter=@sweepr/api     # one workspace
npx vitest run apps/api/tests                    # API test suite (the only test suite)
npx turbo run build --filter=@sweepr/<app>       # vite build (also validates tailwind plugins)
node packages/db/build-schema.mjs && node packages/db/verify-schema.mjs   # REQUIRED after adding a migration — CI fails otherwise
```

## Deploy model

- Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs typecheck,
  applies DB migrations (`packages/db/migrate.mjs`), deploys the API worker via
  `wrangler deploy`, then deploys every Pages app. **Everything auto-deploys on main.**
- Frontend env (e.g. `VITE_CLERK_PUBLISHABLE_KEY`) is baked at build time in the
  workflow — changing a GitHub secret requires a re-run/redeploy to take effect.
- Worker secrets: `wrangler secret put NAME` in `apps/api` (redeploys immediately).
  Use `printf 'value' | wrangler secret put NAME` — trailing newlines from `echo`
  have broken integrations before. The full secret catalog lives as comments in
  `apps/api/wrangler.toml`.

## Conventions

- Every source file starts with the ClearKey copyright header (copy from a sibling).
- Migrations: `packages/db/src/migrations/NNN_name.sql`, then regenerate schema (above).
- Outbound email goes through `apps/api/src/lib/mailer.ts` only. Body emails use
  `wrapBodyInTemplate(subject, body, lang?, opts?)` — the branded, email-client-safe
  template (preheader, CTA button w/ optional icon, unsubscribe for marketing).
  Logo asset: `https://objects.getsweepr.com/site_assets/public/Sweepr-logo.png`.
  Say "Sweepr", never "Sweepr Pro".
- Outbound SMS goes through `apps/api/src/lib/sms.ts` only (consent re-verified per
  send; transactional allowlist). Sender = MailerSend toll-free `MAILERSEND_SMS_FROM`.
- Phones: store E.164 (`+1XXXXXXXXXX`). UI uses `PhoneInput` from `@sweepr/ui`
  (displays `(XXX) XXX-XXXX`, emits E.164); helpers `toE164US`/`isCompleteUsPhone`.
- Rate limiting (`apps/api/src/index.ts`): strict low buckets are for *mutations*.
  Read-only endpoints the UI polls (e.g. `/didit/status`, `/yardstik/status`,
  `/auth/me`) must get their own generous bucket — polls against a strict bucket
  have caused "stuck" onboarding twice.
- Errors: `logger.error/warn` anywhere in a request is auto-flushed to the admin
  error feed (`error_logs`) with full context. Return friendly messages to users;
  owner accounts may receive a `detail` field (see `/yardstik/invite`).
- Each Pages app has its own CSP in `apps/<app>/public/_headers` — adding a new
  external script/XHR/iframe origin requires editing that file (browser caches it;
  hard refresh after deploy).
- Theme: shared Tailwind preset `packages/config/tailwind.ts`. Dark mode is
  **warm graphite** (slate scale is overridden — warm neutrals, deliberately no
  blue; `charcoal` = `#1c1a17`) plus a subtle dark-only film-grain overlay
  (opacity 0.04 in the preset plugin). Don't reintroduce blue-gray slate.
- Admin routers: `adminRouter.use("*", requireAuth, requireAdmin)` pattern
  (`middleware/adminRoles`). Roles live on `users.role` in Neon.

## Auth — TWO Clerk applications

1. **Primary** (`clerk.getsweepr.com`): customers + cleaners. One account can be
   both customer and cleaner. Session is shared across all getsweepr.com
   subdomains (Clerk design — cannot be split in code; use browser profiles to
   test multiple personas).
2. **Admin** (`clerk.admin.getsweepr.com`): separate Clerk application for the
   admin console, so staff sessions are independent of user sessions.
   Email + code sign-in only (no password/SSO).

`apps/api/src/middleware/auth.ts` verifies bearer tokens against whichever
instance issued them (unverified `iss` picks the key; verification is still
cryptographic). **Admin-instance identities are mapped onto the canonical
`users` row by Clerk-verified email** — never relink/duplicate rows. Webhooks:
`/webhooks/clerk` (primary, `CLERK_WEBHOOK_SECRET`) and `/webhooks/clerk-admin`
(admin, `CLERK_ADMIN_WEBHOOK_SECRET`); both Svix-verified, secret must be `whsec_…`.
Clerk requires first/last name at sign-up — the sign-up forms collect them, and
`/sign-up/continue` (ContinueSignUp) collects anything still missing; a
verification that succeeds but isn't `status === "complete"` must route there,
never hang.

## Integrations (key facts that have bitten us)

- **Yardstik** (background checks, currently STAGING `api.yardstik-staging.com`):
  auth header is `Authorization: Account <key>` (not Bearer). Reports need
  `account_package_id` (staging "Federal Premium" = `6abeeb85-5023-412b-95df-bcb57300a4d7`).
  Webhooks are signed with a dashboard API key literally named `WEBHOOK_SIGNATURE`
  (HMAC-SHA256 hex of body → `x-yardstik-webhook-signature`); register every event
  type against `https://api.getsweepr.com/webhooks/yardstik`. `/yardstik/invite`
  reconciles an existing report instead of re-ordering (Yardstik blocks duplicates
  within 30 days). The candidate `meta.apply` page (profile.yardstik-staging.com)
  renders BLANK in a cross-site iframe (third-party cookies) — current UI shows the
  iframe + "open in new tab" fallback; true embedding needs a Yardstik white-label
  domain (unconfirmed they offer one) or self-hosted intake
  (`account_candidate_consented: true`, feature-gated, FCRA liability shifts to us).
  The `@yardstik/embeddable-sdk` is staff-only (report viewer) — NOT for candidates.
- **Didit** (identity): webhook-driven; UI polls `GET /didit/status` every 5s.
- **MailerSend**: templates created in the dashboard are NOT API-editable; only
  API-created templates are. Hosted template IDs live in `TEMPLATES` in
  `lib/mailer.ts` (Admin Invite `3z0vklo5j2p47qrx`, Approval Request
  `7dnvo4dyep345r86`; Security/IT templates are hands-off). Most emails are
  code-rendered, not hosted templates. Inbound mail → `/mail/inbound` →
  `mailbox_messages` with sanitized `body_html` (`lib/emailHtml.ts`).
  SMS "sent" ≠ delivered — toll-free A2P can lag minutes.
- **Stripe**: manual-capture booking payments; webhook `/webhooks/stripe`.
- **Slack**: admin console integration; interactive approval cards.

## Admin schedule calendar (automation engine)

`scheduled_events` (migration 082) + `lib/scheduledActions.ts` +
`routes/adminSchedule.ts` + admin **Schedule** page (Comms group). Automations
execute via the `*/15` cron: claim-by-status-transition (race-safe), 6h misfire
guard. Action catalog: `broadcast_email`, `status_announcement`,
`service_area_launch`, `prelaunch_toggle` (site_settings keys
`prelaunch_customer|cleaner|pricing`), `admin_alert`. To add an action: one
entry in `SCHEDULED_ACTION_CATALOG` + one executor case. ICS import is
SSRF-safe via `lib/calendarSecurity.ts` (`fetchCalendar`/`parseIcs`); export at
`/admin/schedule/export.ics`.

## Owner / test accounts

- Owner: `1morecruise@gmail.com` (self-heals to `super_admin` via
  `SUPER_ADMIN_EMAILS`/owner logic in `middleware/auth.ts`; also
  `caleb.owen2019@outlook.com`). Never seed owner accounts as test cleaners
  (`packages/db/seed-test-cleaner.mjs` guards this).
- To test multiple roles simultaneously, use separate browser profiles
  (cookie jars) — the primary Clerk instance shares one session per browser.

## Secrets hygiene

Never commit or echo secret values. Publishable keys (`pk_…`) are safe in code;
secret keys (`sk_…`, `whsec_…`, API tokens) go only through `wrangler secret put`
or GitHub secrets. If a secret is ever pasted into a chat/transcript, rotate it.
