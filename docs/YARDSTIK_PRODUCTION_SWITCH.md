> Copyright © 2026–Present ClearKey Solutions, LLC.
> Proprietary & Confidential. Internal Use Only.

# Yardstik: staging → production switch runbook

Audited 2026-08-17: the integration is **fully secret-driven**. No code change
is needed for the cutover; the default API host in code is already production
(`lib/yardstik.ts` falls back to `https://api.yardstik.com` when
`YARDSTIK_API_URL` is unset). Everything below is `wrangler secret put` in
`apps/api` plus Yardstik-dashboard work.

## 1. Swap the secrets (apps/api)

Use `printf` (never `echo` — trailing-newline breakage, see CLAUDE.md), no
wrapping quotes/whitespace:

```bash
cd apps/api
printf '<prod api key>'            | npx wrangler secret put YARDSTIK_API_KEY
printf '<prod account_package_id>' | npx wrangler secret put YARDSTIK_ACCOUNT_PACKAGE_ID
printf '<prod WEBHOOK_SIGNATURE>'  | npx wrangler secret put YARDSTIK_WEBHOOK_SIGNATURE
# Point at the production host (or `npx wrangler secret delete YARDSTIK_API_URL`
# — unset falls back to production):
printf 'https://api.yardstik.com'  | npx wrangler secret put YARDSTIK_API_URL
```

Notes:
- `YARDSTIK_ACCOUNT_PACKAGE_ID` is the **production** package's UUID — the
  staging value `6abeeb85-5023-412b-95df-bcb57300a4d7` ("Federal Premium") is
  staging-only. Get the prod equivalent from the Yardstik dashboard or
  `GET /account_packages`.
- `YARDSTIK_WEBHOOK_SIGNATURE` is the value of a **dashboard API key literally
  named `WEBHOOK_SIGNATURE`** (separate from the REST key; shown only once at
  creation). Create it in the production dashboard first.
- REST auth header is `Authorization: Account <key>` — Bearer/Token fail.

## 2. Register production webhooks

Yardstik has no multi-event subscription UI: register **every event type**
(report.created, report.updated, invitation.*, …) against the same URL:

```
https://api.getsweepr.com/webhooks/yardstik
```

One signing key covers all of them (the handler dispatches on the body).
The handler 503s while `YARDSTIK_WEBHOOK_SIGNATURE` is missing — set the
secret before registering.

## 3. Verify

1. `/yardstik/invite` an internal test candidate; confirm the report orders
   against the prod package (owner accounts see raw Yardstik `detail` on 502).
2. Fire a test webhook from the dashboard; confirm signature verification in
   the worker logs (the verifier accepts raw-body or re-serialized JSON HMAC
   and trims paste artifacts, but set the secret clean anyway).
3. Watch `/yardstik/status` polling complete in cleaner onboarding.

## 4. Post-cutover cleanup (optional, non-blocking)

- `apps/cleaner/public/_headers`: drop `https://api.yardstik-staging.com` and
  `https://*.yardstik-staging.com` from connect-src/frame-src once staging is
  retired (browsers cache `_headers` — deploy is enough, no DNS work).
- `apps/api/src/routes/adminDebug.ts` (~line 136): the connectivity probe
  loops over a hardcoded `[api.yardstik.com, api.yardstik-staging.com]` array;
  staging entry goes stale but is harmless.
- Candidate apply flow is unchanged: `meta.apply` still renders blank in a
  cross-site iframe (third-party cookies), so the iframe + new-tab fallback
  stays. The embeddable SDK remains staff-only.

## What does NOT change

- Normalized status vocabulary and adjudication wiring (mig. 081/084).
- Webhook dedup (`yardstik-webhook-dedup` tests cover it).
- CSP already allows `*.yardstik.com` (production) in the cleaner app.
- Rate buckets: `/yardstik/status` polling stays on its generous poll bucket.
