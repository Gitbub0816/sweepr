# Sweepr Production Readiness Report

**Generated:** 2026-06-24  
**Schema:** Migrations 001–025 (24 structural migrations; 008* content seeds excluded from schema.sql)  
**Total codebase:** ~150,000 lines (TypeScript + SQL + config)

---

## Status: Application-Layer Complete — Awaiting Deployment Verification

All P0 and P1 code-level fixes are implemented and TypeScript-verified.  
The following deployment steps remain the operator's responsibility before going live.

---

## P0 — Critical Security Fixes ✅

### P0-1: Payment Amount Tampering — FIXED

`POST /payments/create-intent` no longer accepts a client-supplied `amount`. The endpoint:

1. Accepts only `{ bookingId: string }`
2. Loads `total_price` from the bookings table
3. Verifies caller owns the booking (`customer_user_id` check)
4. Rejects already-paid, cancelled, or refunded bookings
5. Returns an existing intent if one was created within 24h (idempotency via `stripe_payment_intent_created_at`)
6. Audits every intent creation as `payment.intent_created`

**File:** `apps/api/src/routes/payments.ts`

---

### P0-2: Access Code Stored in Plaintext — FIXED

Access codes are now encrypted at rest using AES-256-GCM with SHA-256 key derivation.

- `POST /jobs/bookings/:id/access-code` — encrypts with `ACCESS_CODE_ENCRYPTION_KEY`, stores in `code_value_encrypted`, sets `code_value = NULL`
- `POST /jobs/bookings/:id/start-clean` — decrypts only after GPS arrival verified and job is `in_progress`
- **Production enforcement:** missing `ACCESS_CODE_ENCRYPTION_KEY` throws a hard error at request time — no silent plaintext fallback
- **Development only:** missing key emits a loud warning and stores plaintext (opt-in dev mode)
- Decryption failures return `null` for the code value — never expose raw encrypted bytes
- Every reveal audited as `access_code.revealed` with booking_id, arrival_verified_at, IP, user-agent — never includes raw code value

**Files:** `apps/api/src/routes/dayOfService.ts`, `apps/api/src/lib/crypto.ts`

**Required action:** Set `ACCESS_CODE_ENCRYPTION_KEY` as a Cloudflare Worker secret:
```
wrangler secret put ACCESS_CODE_ENCRYPTION_KEY
# Enter: $(openssl rand -hex 32)
```

---

### P0-3: Photo Upload Authorization — FIXED

`POST /jobs/bookings/:id/photos` now uses `bookingAuthorization.ts`:

- `canUploadPhotos()` — allows admin always; cleaner/customer only during `en_route`, `arrived`, `in_progress`, `awaiting_checkout`
- `canViewAccessCodes()` — admin always; cleaner only after GPS arrival + `in_progress`; customer always
- Storage key must start with `bookings/{bookingId}/` — guards cross-booking key injection

**File:** `apps/api/src/lib/bookingAuthorization.ts`

---

### P0-4: Photo Minimums Not Enforced — FIXED

- `job_completion_requirements` table (migration 025) stores configurable minimums (default: 3 before, 3 after, checkout required)
- `POST /jobs/bookings/:id/complete` validates photo counts **before** inserting checkout photo, preventing orphaned rows on retry
- Checkout photo uses idempotent upsert — safe to retry
- Storage key validated to scope `bookings/{bookingId}/`

**File:** `apps/api/src/routes/dayOfService.ts`

---

## P1 — High-Priority Operational Fixes ✅

### P1-5: Address Reveal Has No Timing Window — FIXED

`address_reveal_settings` table (migration 025) stores configurable reveal window (default: 4h before, same-day only).

`POST /jobs/bookings/:id/start-route` enforces:
- Same-day check (when `allow_same_day_only = true`)
- Hours-before window check

**File:** `apps/api/src/routes/dayOfService.ts`

---

### P1-6: Payout Schema Reconciliation — DONE

All payout tables verified across migrations 020–025 and present in `schema.sql`:
`stripe_connected_accounts`, `platform_fee_settings`, `cleaner_tier_multipliers`, `payout_settings_audit`, `payout_ledger`, `payouts`, `failed_webhook_events`

---

### P1-7: Webhook Dead-Letter Queue — FIXED

- Event processing wrapped in try/catch
- On failure: inserts to `failed_webhook_events` (payload, error, retry count)
- Returns HTTP 200 to suppress Stripe retries; DLQ admin handles replay
- Admin endpoints: `GET /admin/observability/failed-webhooks`, `POST .../replay`, `POST .../resolve`

**File:** `apps/api/src/routes/stripe-webhook.ts`, `apps/api/src/routes/adminObservability.ts`

---

### P1-8: No Request Tracing ID — FIXED

`X-Request-ID` set on every response (generated or propagated from caller). Stored in `api_request_logs`.

**File:** `apps/api/src/middleware/requestLogger.ts`

---

### P1-9: Security Test Suite — COMPLETE

`apps/api/tests/security/` (6 spec files):

| File | What It Tests |
|------|--------------|
| `payment-tampering.test.ts` | Amount isolation, ownership, double-intent, rejected statuses |
| `access-code-encryption.test.ts` | AES-GCM round-trip, random IV, wrong-key rejection, null-plaintext |
| `photo-authorization.test.ts` | `canUploadPhotos()` for all roles + states |
| `photo-enforcement.test.ts` | Minimum counts, configurable requirements, validation order |
| `address-reveal-timing.test.ts` | Same-day, hours-before window, edge cases |
| `webhook-idempotency.test.ts` | Duplicate detection, DLQ insert, replay, 200-on-failure |

---

## Schema Consolidation ✅

| Item | Status |
|------|--------|
| `packages/db/schema.sql` regenerated from migrations 001–025 | ✅ |
| `schema_complete.sql` removed (was stale/redundant) | ✅ |
| `build-schema.mjs` dynamically includes all migrations, skips 008* seeds | ✅ |
| `verify-schema.mjs` verifies 58 tables, 22 columns, 11 migration sections | ✅ |
| CI (`deploy.yml`) runs `build:schema` + `verify:schema` + `git diff --exit-code` | ✅ |

---

## Encryption Hardening ✅

| Item | Status |
|------|--------|
| Env var unified to `ACCESS_CODE_ENCRYPTION_KEY` everywhere | ✅ |
| Key derivation upgraded to SHA-256 (no more pad/truncate) | ✅ |
| Production: missing key = hard throw | ✅ |
| Development: missing key = loud warning, plaintext fallback | ✅ |
| Audit never includes raw/encrypted code value | ✅ |

---

## Deployment Checklist (Operator Actions Required)

### Cloudflare Worker Secrets
```bash
wrangler secret put ACCESS_CODE_ENCRYPTION_KEY   # openssl rand -hex 32
wrangler secret put DATABASE_URL
wrangler secret put CLERK_SECRET_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put MAILERSEND_API_KEY
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

### wrangler.toml `[vars]` (non-secret runtime config)
```toml
ENVIRONMENT = "production"
ADMIN_URL = "https://admin.getsweepr.com"
CLEANER_APP_URL = "https://clean.getsweepr.com"
CUSTOMER_URL = "https://app.getsweepr.com"
```

### Database
```bash
# Run schema.sql against your Neon database (idempotent — safe to re-run):
psql $DATABASE_URL < packages/db/schema.sql
```

### Stripe
- Verify webhook endpoint: `https://api.getsweepr.com/webhooks/stripe`
- Enable events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.dispute.*`, `transfer.*`, `payout.*`, `invoice.payment_succeeded`

### GitHub Secrets (for CI/CD deploy)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_MAPBOX_PUBLIC_TOKEN`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

---

## Security Constraints (Permanent)

- Sweepr **never** receives, processes, or stores ID images, selfies, or biometric data
- API uses `Authorization: Bearer` tokens — CSRF immune by design (no cookies)
- `VITE_*` vars are baked at build time from GitHub Secrets; runtime secrets live in Cloudflare Worker secrets only
- Didit credentials never exposed to frontend — client receives hosted URL only
- **Never log:** passwords, CVV, full card/account numbers, raw access codes, raw key instructions, SSNs, background check data, identity verification documents
- Do not store raw IP — prefer hashed IP or Cloudflare aggregate analytics
- **Session replay must mask:** all text inputs, addresses, access instructions, lockbox/key codes, payment fields, private messages, phone numbers, emails

---

## Files Changed This Session

| File | Change |
|------|--------|
| `packages/db/schema.sql` | Regenerated — migrations 001–025 (1,615 lines) |
| `packages/db/schema_complete.sql` | **Removed** (stale, superseded) |
| `packages/db/build-schema.mjs` | Already dynamic; re-run to regenerate |
| `packages/db/verify-schema.mjs` | **Created** — CI schema verification |
| `packages/db/package.json` | Added `build:schema` + `verify:schema` scripts |
| `apps/api/src/lib/crypto.ts` | SHA-256 key derivation; `requireEncryptionKey()` |
| `apps/api/src/types.ts` | `ACCESS_CODE_SECRET` → `ACCESS_CODE_ENCRYPTION_KEY` |
| `apps/api/src/routes/dayOfService.ts` | Encryption key rename; production enforcement; photo validation order fix; storage key scope check; improved audit |
| `apps/api/src/routes/payments.ts` | Amount from DB only; ownership check; idempotency |
| `apps/api/src/routes/stripe-webhook.ts` | DLQ try/catch |
| `apps/api/src/routes/adminObservability.ts` | Failed webhooks list/replay/resolve endpoints |
| `apps/api/src/lib/bookingAuthorization.ts` | Created — central auth helpers |
| `apps/api/src/middleware/requestLogger.ts` | X-Request-ID on all responses |
| `.env.example` | All Worker secrets documented |
| `.github/workflows/deploy.yml` | Schema build + verify + diff check in CI |
| `apps/api/tests/security/*.test.ts` | 6 security test files |
| `PRODUCTION_READINESS_REPORT.md` | This file |
