# CONTEXT.md — Current state & decision log

Living document: what's true right now, why it's that way, and what's still open.
Update this when a decision changes; keep entries short. (How-to details live in
CLAUDE.md; this file is state + rationale.)

_Last updated: 2026-07-09_

## Platform state

- **Stack**: pnpm + Turbo monorepo; Hono API on Cloudflare Workers; Vite/React on
  Cloudflare Pages; Neon Postgres (82 migrations, `schema.sql` generated+verified
  in CI); everything auto-deploys from `main` via GitHub Actions.
- **Theme**: dark mode is warm graphite (no blue anywhere — slate overridden,
  navy `charcoal` replaced) with a subtle grain overlay. WCAG re-sweep is
  **pending** after this change.

## Auth (decided 2026-07-09)

- **Two Clerk applications.** Primary (`clerk.getsweepr.com`) serves customers +
  cleaners as one shared account/session; Admin (`clerk.admin.getsweepr.com`) is
  a separate application so staff sessions are independent. Clerk forbids two
  apps on one root domain — admin worked as primary/secondary domain split.
- Admin sign-in: **email + code only** (password/SSO off). Owner account exists
  in the admin instance (`1morecruise@gmail.com`, created via Backend API).
- API verifies tokens per-issuer and maps admin-instance identities onto the
  canonical `users` row **by verified email** (no row relinking — that hazard is
  documented in `middleware/auth.ts`).
- Sign-up on primary requires first/last name (+ optional username/phone —
  identifiers are user's choice); forms collect names, `/sign-up/continue`
  mops up the rest. Never leave a verified-but-incomplete sign-up hanging.
- DNS for the admin instance (5 Clerk CNAMEs under `admin.getsweepr.com`,
  DNS-only) was added 2026-07-09.
- **Open**: set Worker secrets `CLERK_ADMIN_SECRET_KEY` and
  `CLERK_ADMIN_WEBHOOK_SECRET`; register the admin webhook
  (`https://api.getsweepr.com/webhooks/clerk-admin`); verify domain in Clerk.

## Background checks — Yardstik (migrated from Checkr, 2026-07)

- Full provider swap; normalized status vocabulary unchanged; old `checkr_*`
  columns retained for history, new `yardstik_*` columns in use.
- **Currently on STAGING** (`YARDSTIK_API_URL=https://api.yardstik-staging.com`,
  staging key, package id `6abeeb85-…`). Production switch = swap three secrets
  + register prod webhooks (CSP already allows `*.yardstik.com`).
- Webhook signing works (dashboard key named `WEBHOOK_SIGNATURE`; verifier
  accepts raw-body or re-serialized HMAC).
- `/yardstik/invite` reconciles existing reports (30-day dedup) and self-heals
  stale statuses.
- **Open decision — embedding the candidate apply form.** It renders blank in a
  cross-site iframe (third-party cookies). Options: (a) ask Yardstik sales for a
  white-label/custom intake domain — no public evidence they offer one; (b) build
  our own intake using `account_candidate_consented: true` (feature must be
  enabled; we'd own FCRA disclosure/consent); (c) keep iframe + new-tab fallback
  (current). Embeddable SDK is staff-only — ruled out for candidates.

## Email & SMS

- All transactional email uses the branded in-code template
  (`wrapBodyInTemplate`); approval/rejection emails rebuilt; hosted MailerSend
  admin templates recreated as API-editable (`Sweepr Admin Invite`
  `3z0vklo5j2p47qrx`, `Sweepr Admin Approval Request` `7dnvo4dyep345r86`).
  Security/IT templates intentionally untouched. Old dashboard admin templates
  are orphaned (safe to delete). Logo = objects.getsweepr.com asset.
- Inbound mail renders **sanitized HTML** in the admin Mail tab (migration 082
  `body_html`); plain text is auto-linkified. Only post-deploy mail has HTML.
- SMS: MailerSend toll-free `+18335367404`; delivery can lag minutes behind the
  "sent" status (toll-free A2P). Admin alert SMS works end-to-end.

## Admin schedule calendar (built 2026-07-09)

- `scheduled_events` + cron-executed automations: broadcasts/newsletters,
  status-page announcements, service-area launches, prelaunch gate toggles,
  admin alerts. ICS import (SSRF-safe) + export. Admin → Comms → Schedule.
- Intended as THE mechanism for scheduling launch-day actions (e.g. flip
  `prelaunch_customer` off + send launch broadcast at a chosen time).

## Known open items

1. Clerk admin-instance secrets + webhook registration (see Auth above).
2. Yardstik: embed decision; production credential switch when approved.
3. WCAG sweep post dark-theme change.
4. Sentry MCP setup with real DSNs (task #112, parked).
5. Clerk primary-instance webhook had a misconfigured signing secret history —
   verify `/webhooks/clerk` deliveries stay green after any secret rotation.
6. README's domain table drifts from deploy.yml (deploy.yml is truth).

## Hard-won gotchas (do not relearn)

- Strict rate buckets on polled GET endpoints break onboarding (Didit/Yardstik
  status polls 429'd) — poll endpoints get their own generous bucket.
- `wrangler secret put` via `echo` adds a trailing newline; use `printf`.
  Secrets pasted with wrapping quotes/newlines broke Yardstik twice — the code
  now trims, but set them clean anyway.
- MailerSend dashboard-created templates 404 on API update — create via API.
- Rotating a Clerk publishable key requires rebuilding/redeploying every Pages
  app (key is baked at build); stale browser Clerk cookies after rotation cause
  401/400 storms — clear site data or use incognito.
- Cloudflare-proxied CNAMEs break Clerk domain verification — Clerk records
  must be DNS-only.
- One browser = one session on the primary Clerk instance; test personas need
  separate browser profiles.
