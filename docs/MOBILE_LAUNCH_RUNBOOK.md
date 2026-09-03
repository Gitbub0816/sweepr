<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# Mobile launch runbook — Sweepr (customer) + Clean with Sweepr (cleaner)

Everything the code needs is merged; this is the ordered list of steps that can
only happen outside the repo (secrets, Fly, Apple). Until step 1–2 are done,
mobile sign-in fail-closes with a clear error (503 `auth_unconfigured`) — the
apps cannot be used, but nothing on web changes.

## 1. Deploy the auth broker (Fly.io) — mobile sign-in depends on it

The apps use the central broker for sessions (native ceremony:
`docs/…` — Clerk proves WHO via its REST API from native screens, the API
worker exchanges that proof at `POST /v1/auth/native/exchange`, and the broker
mints a `client_kind='mobile'` session: 60-day sliding idle expiry, 1-year
absolute cap; migration 110 added the columns and auto-applies on deploy).

From `services/auth-broker/` (Fly app name `sweepr`, see fly.toml):

```bash
fly secrets set \
  CENTRAL_AUTH_ENABLED=true \
  BROKER_DEPLOYMENT=standard \
  DATABASE_URL='<neon pooled url>' \
  CLERK_ISSUER='https://clerk.getsweepr.com' \
  IP_HASH_SALT='<long random>' \
  AUTH_PAGE_ORIGIN='https://auth.getsweepr.com' \
  ORIGIN_SHARED_SECRET='<long random — same value goes on the API worker>' \
  BROKER_KEY_CUSTOMER='<long random>' \
  BROKER_KEY_CLEANER='<long random>' \
  BROKER_KEY_BUSINESS='<existing if already set>'
fly deploy
curl -s https://sweepr.fly.dev/healthz   # → ok
```

## 2. API worker secrets (the mobile BFF)

**Preferred: GitHub repo secrets + a deploy.** The deploy workflow's "Sync
worker secrets" step (API worker job) pushes `BROKER_KEY_CUSTOMER`,
`BROKER_KEY_CLEANER`, `ORIGIN_SHARED_SECRET`, and `API_BROKER_TOKEN_SECRET`
from GitHub repo secrets to the `sweepr-api` worker on every main deploy —
the same GitHub secrets the central-auth Pages sync already uses, so the
broker keys are likely set already. Make sure **`API_BROKER_TOKEN_SECRET`**
exists too (any long random value; it's the HMAC key the worker uses to mint
and verify the short-lived mobile API tokens):
repo → Settings → Secrets and variables → Actions → New repository secret,
then re-run the "Deploy Sweepr" workflow (or push any commit to main).

Manual alternative, from `apps/api/` (use `printf`, never `echo` —
trailing-newline hazard):

```bash
printf '<same BROKER_KEY_CUSTOMER>' | wrangler secret put BROKER_KEY_CUSTOMER
printf '<same BROKER_KEY_CLEANER>'  | wrangler secret put BROKER_KEY_CLEANER
printf '<same ORIGIN_SHARED_SECRET>'| wrangler secret put ORIGIN_SHARED_SECRET
printf '<long random>'              | wrangler secret put API_BROKER_TOKEN_SECRET
# Optional (defaults to https://sweepr.fly.dev):
printf 'https://sweepr.fly.dev'     | wrangler secret put BROKER_URL
```

Smoke test after both steps (expects 401 authentication_failed, NOT 503):

```bash
curl -s -X POST https://api.getsweepr.com/mobile-auth/session \
  -H 'content-type: application/json' \
  -d '{"app":"customer","clerkToken":"xxxxxxxxxxxxxxxxxxxxxxxxx"}'
```

Still `503 {"error":"auth_unconfigured"}`? The worker is missing the app's
`BROKER_KEY_*` or `API_BROKER_TOKEN_SECRET` — check
`wrangler secret list` in `apps/api/`, or the "Sync worker secrets" step in
the latest deploy run (unset GitHub secrets are skipped silently).

## 3. Xcode / App Store (Mac steps)

1. `open apps/ios/Sweepr.xcworkspace`, set the signing team on both app
   targets. Schemes: `Sweepr`, `CleanWithSweepr`.
2. Capabilities to enable per target (entitlement files are in-repo):
   Push Notifications (fast-follow — server sender not built yet, harmless to
   enable now), Associated Domains (`applinks:app.getsweepr.com` /
   `applinks:clean.getsweepr.com`).
3. The customer app registers the `sweepr://` URL scheme (pay-page bounce-back)
   — already in Info.plist, nothing to do.
4. Run both apps on a device: sign up, book (pays through the hosted Stripe
   page at app.getsweepr.com/pay — Apple Pay appears automatically in Safari),
   and run a cleaner job end-to-end (route → GPS check-in → photos →
   complete).
5. Screenshots (6.9" + 6.5"), then archive → upload → TestFlight.
6. App Store Connect metadata: copy from `apps/ios/docs/appstore/*/metadata.md`;
   App Privacy answers from `privacy-nutrition-label.md`; paste
   `review-notes.md` into App Review notes after filling the demo credentials.

## 4. Demo accounts for App Review

Seed one customer with an upcoming booking and one approved cleaner with a
current-day job (the seed scripts + admin tools cover this), then fill the
`REPLACE_WITH_*` placeholders in both `review-notes.md` files.

## 5. Post-launch fast-follows (explicitly out of v1)

- Push notifications (APNs sender in the API worker + device registration).
- Android via SKIP re-enablement (`skip.yml` divergences for camera,
  CoreLocation, keychain; the Swift stays inside the SKIP subset on purpose).
- In-app Seam lock provisioning for customers (web `/smart-locks` covers it).
