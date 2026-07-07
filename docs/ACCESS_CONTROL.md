> Copyright © 2026–Present ClearKey Solutions, LLC.
> Proprietary & Confidential.
> Internal Use Only.

# Access Control Matrix

Authoritative reference for who can reach what in `apps/api`. Derived from
`apps/api/src/middleware/adminRoles.ts`, `apps/api/src/middleware/auth.ts`,
every `app.route(...)` mount in `apps/api/src/index.ts`, and the per-route
middleware stacked in `apps/api/src/routes/*`. Reflects the FIXED state as of
this hardening pass (see "Audit findings" at the bottom for what was fixed).

## Principals

| Principal | How authenticated | Notes |
|---|---|---|
| Anonymous | none | Public marketing/status/webhook-adjacent endpoints only. |
| Authenticated customer | Clerk JWT (`requireAuth`) | Scoped to their own `customers` row via `users.clerk_id`. |
| Authenticated cleaner | Clerk JWT (`requireAuth`) | Scoped to their own `cleaners` row via `users.clerk_id`. |
| Admin role: `admin` | Clerk JWT + `role = 'admin'` in `users` | Baseline admin; passes any gate with no specific role list. |
| Admin role: `ops` / `ops_senior` | as above + `admin_role` column | Operations: scheduling, matching, service areas. |
| Admin role: `finance` / `finance_senior` | as above | Payouts, fee proposals, pricing. |
| Admin role: `trainer` / `trainer_senior` | as above | Training/courses admin. |
| Admin role: `support` / `support_senior` | as above | Customer/cleaner support tooling. |
| Admin role: `it` / `it_senior` | as above | IT tickets, user management, sign-in links. |
| Admin role: `security` / `security_senior` | as above | Security tickets, security inbox. |
| `super_admin` | `role = 'super_admin'` or `admin_role = 'super_admin'` | Passes every `requireAdminRole(...)` gate regardless of the allowed list. |
| Owner | `isOwnerClerkId(clerkId, env)` | Hardcoded founder Clerk ID(s) in env; always passes every admin gate, independent of DB state. Used as a break-glass path. |
| Signature-authenticated webhook | HMAC/JWT-of-provider, not Clerk | Stripe, Clerk, Checkr, Didit, MailerSend inbound/outbound-status. No `requireAuth`; authenticated by signature verification instead. |

`_senior` variants pass any gate their base role passes (`ops_senior` passes
wherever `ops` is required), via `baseRoleOf()`.

## Route groups

| Mount | Required auth | Owner-scoping | Rate limit bucket |
|---|---|---|---|
| `/auth/*` | `requireAuth` (sync/me), none (initial) | n/a | `auth` 5/15m (IP) |
| `/client-errors/*` | none (client telemetry) | n/a | `clienterr` 20/min (IP) |
| `/customer-profile/*` | `requireAuth` | own `customers` row via `clerk_id` | general 100/min |
| `/bookings/*` | `requireAuth` | `assertBookingAccess(sql, id, clerkId)` on every `:id` route | general 100/min; `POST /` has its own 10/hour (IP) create limiter |
| `/pricing/*` | none (quote calculator, public) | n/a | `pricing` 60/min |
| `/payments/*` | `requireAuth` | booking/customer ownership checked in handler; claim-then-act for capture/refund | `payments` 5/15m |
| `/tips/*` | `requireAuth` | booking ownership checked in handler | `tips` 5/15m |
| `/webhooks/stripe` | HMAC (Stripe signature) | n/a — server-authoritative | general 100/min (signature-verified, not tightened) |
| `/webhooks/clerk` | HMAC (svix) + secret required or 500 | n/a | general 100/min |
| `/cleaners/*` | `requireAuth` | own `cleaners` row via `clerk_id` | general 100/min |
| `/reviews` (POST) | `requireAuth` | booking + `customer_id` ownership verified before insert | `reviews` 10/15m (per-user) |
| `/reviews/cleaner/:id` (GET) | none (public cleaner reviews) | read-only, public-safe fields only | general 100/min |
| `/admin/debug/*` | owner only | n/a | general 100/min |
| `/it-tickets/*` | `requireAuth`; `/admin/*` sub-routes additionally `requireAdmin` | own tickets via `reporter_clerk_id`; admin routes see all | general 100/min |
| `/it/*` | `requireAuth`; sensitive routes `requireITAdmin` | n/a | general 100/min |
| `/account/*` | `requireAuth` | own `users` row | general 100/min |
| `/admin/notification-settings/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/admin/mail/*` | `requireAuth` + per-mailbox permission gate | mailbox-scoped via `accessibleBoxes()` | general 100/min |
| `/admin/*` (core: stats/cleaners/customers/jobs/events/applications/disputes/users) | `requireAuth` + `requireAdmin` | n/a (full admin visibility by design) | general 100/min |
| `/admin` (`adminAuthRouter`: `check-email`) | none (pre-login OTP check) | returns only "does this email exist" | general 100/min |
| `/storage/*` | `requireAuth`; upload signing verifies ownership of the target booking/job | booking/job ownership checked before signing | `storage` 20/hour |
| `/notifications/*` | `requireAuth` | `WHERE id = ... AND user_id = user.id` | general 100/min |
| `/schedule/*` | `requireAuth` | cleaner scoped to own slots | general 100/min |
| `/subscriptions/*` | `requireAuth` | `ownedSubscription(c, id)` helper | general 100/min |
| `/checkr/*` | `requireAuth` | own `cleaners` row | `checkr` 10/15m (per-user) |
| `/webhooks/checkr` | HMAC (`CHECKR_CLIENT_SECRET`/`CHECKR_WEBHOOK_SECRET`), 503 if unconfigured | n/a | general 100/min (signature-verified) |
| `/didit/*` | `requireAuth` | own user id as `vendorData` | `didit` 10/15m (per-user) |
| `/webhooks/didit` | HMAC-SHA256 (`X-Signature-V2`) + timestamp freshness, 503 if unconfigured | n/a | general 100/min (signature-verified) |
| `/webhooks/mailersend-sms` | HMAC, 503 if unconfigured | n/a | general 100/min (signature-verified) |
| `/sms/*` | none (public consent form) | n/a | general 100/min |
| `/locale` | none (public, IP-based) | n/a | general 100/min |
| `/status`, `/admin/status/*` | none / `requireAuth`+`requireAdmin` | n/a | general 100/min |
| `/admin/invites/*` (except `/verify`) | `requireAuth` + `requireAdmin`/`super_admin` | n/a | general 100/min |
| `/admin/newsletter/*`, `/admin/service-areas/*`, `/admin/broadcasts/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/training/*` | `requireAuth` (per-route) | cleaner's own progress rows | general 100/min |
| `/admin/training/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/courses/*` | `requireAuth` | cleaner's own progress | general 100/min |
| `/admin/courses/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/jobs/*` (day-of-service) | `requireAuth` | `getBookingAuthCtx` verifies caller is the booking's cleaner/customer | general 100/min |
| `/insurance/*` | `requireAuth` | own cleaner/booking scoping | general 100/min |
| `/admin/insurance/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/service/*` (demo/seed) | dev/test only | n/a | general 100/min |
| `/admin/observability/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/admin/automation/*` | `requireAuth` + `requireAdmin` | n/a — internal ops triggers, money-adjacent (capture/payouts) | general 100/min |
| `/admin/payouts/*` | `requireAuth` + `requireAdminRole("finance"...)` | claim-then-act on `payout_ledger` | general 100/min |
| `/admin/me` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/cleaner-dashboard/*` | `requireAuth` | filtered `AND cleaner_id = ctx.cleaner_id` | general 100/min |
| `/slack/*` | mixed: `/events`,`/interactivity`,`/commands` HMAC (Slack signing secret); admin sub-routes `requireAuth`+admin gate | n/a | `slack` 300/min |
| `/admin/fee-proposals/*`, `/fee-action/*` | admin gate / single-use signed token | token-scoped for `/fee-action` | general 100/min |
| `/scope-review/*` | `requireAuth` (requests) / `requireAdmin` (admin) / public signed links | booking/cleaner ownership on requests | `scopereview` 5/15m; `scopereview-admin` 30/min |
| `/admin/pricing/*` | `requireAuth` + `requireAdminRole("super_admin")` (edit) / any admin (read) | n/a | general 100/min |
| `/security/*` | inbound: HMAC; admin sub-routes: admin gate | n/a | general 100/min |
| `/it-mail/*` (IT inbound) | HMAC, 503 if unconfigured | n/a | general 100/min |
| `/mail/*` (generic inbound mailboxes) | per-box HMAC, fails closed | n/a | general 100/min |
| `/report/*` | none (public intake; optional Bearer for attribution) | n/a | `report` 20/15m (IP) |
| `/admin/response-templates/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/admin/email/*` | `requireAuth` + `requireAdmin`; `mailersendWebhookRouter`/`unsubscribeRouter` public+signed/token | n/a | general 100/min; `unsubscribe` 5/15m |
| `/admin/settings/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/admin-trust/*` | `requireAuth` + `requireAdmin` | n/a | general 100/min |
| `/privacy/*` | none (public policy content) | n/a | `privacy` 10/15m |

## Invariants

1. **Money movement is admin-only + claim-then-act.** Every path that moves
   money (captures, refunds, payouts, fee-change activation) either runs
   inside `/admin*` behind `requireAdmin`/`requireAdminRole`, or is a
   conditional `UPDATE ... WHERE status = <old> RETURNING` before any Stripe
   call (`payments.ts`, `bookingLedger.ts`, `adminPayouts.ts`). No customer-
   or cleaner-facing route can trigger a capture, refund, or payout directly.
2. **Customers and cleaners can only read/write their own rows.** Every
   `:id`-scoped customer/cleaner route re-derives the owner from the Clerk
   JWT and checks it against the row before allowing access — never trusts a
   client-supplied owner id. See `lib/bookingAccess.ts`,
   `lib/bookingAuthorization.ts`, and the per-router ownership joins listed
   in the table above.
3. **AI and cleaners never move money.** `lib/aiScopeReview.ts` (OpenAI
   vision) only produces a confidence score and routing recommendation;
   all fee/refusal decisions that actually move money require an explicit
   admin action in `/scope-review/admin` or `/admin/fee-proposals`.
4. **Webhooks are HMAC-verified, not JWT-authenticated**, and fail closed:
   every inbound webhook handler checks its signing secret is configured and
   rejects (400/401/500/503) before trusting the payload, rather than
   silently accepting when unconfigured. Verified for: Stripe, Clerk, Checkr,
   Didit, MailerSend (SMS inbound, IT inbound, security inbound, generic
   mailbox inbound, outbound-status webhook).

## Credential storage

Sweepr delegates ALL user authentication — passwords, OTP, OAuth, and
sessions — to Clerk. **Sweepr's own database stores no passwords and performs
no password hashing.** Clerk hashes credentials server-side with a bcrypt-class
algorithm; that hashing never happens in, and those hashes are never visible
to, this codebase. This is the correct and intended posture — do not look for
a local password table or add one.

Sweepr's own use of `SHA-256`/HMAC (audited below) is unrelated to password
storage and is scoped to hashing high-entropy tokens, not low-entropy secrets:

| Location | Input hashed | Entropy | Verdict |
|---|---|---|---|
| `lib/approvalNotify.ts` `sha256Hex` | `crypto.randomUUID() x2` single-use action-link token | High (256 bits) | OK — SHA-256 is appropriate for hashing a high-entropy random token for lookup (`token_hash` + `expires_at` + `used_at IS NULL`, same pattern as `fee_change_action_links`/`scope_review_action_links`). |
| `routes/account.ts` `sha256` | user email (for `account_deletion_log.email_hash`) | N/A — not a secret | OK — this is a pseudonymization fingerprint for deletion-audit records, not a credential. Low entropy is irrelevant because the threat model isn't "guess the email," it's "correlate two deletion events without storing plaintext PII forever." |
| `lib/r2.ts` `sha256hex` | AWS SigV4 canonical request | N/A — public request data | OK — standard AWS request-signing hash, not a secret. |
| `lib/crypto.ts` `encryptSecret`/`decryptSecret` | key = SHA-256(`ACCESS_CODE_ENCRYPTION_KEY` env secret); plaintext = access codes/key instructions | Key is a high-entropy env secret | OK — AES-GCM with a random 12-byte IV per encryption (`crypto.getRandomValues(new Uint8Array(12))`, `lib/crypto.ts:28`); key is derived from `c.env.ACCESS_CODE_ENCRYPTION_KEY` (Workers secret), never hardcoded; `requireEncryptionKey()` hard-fails in production if unset (only degrades to a loud dev-mode warning in `development`/`test`). |

**Conclusion: no low-entropy user secret is hashed with plain SHA-256 anywhere
in this codebase.** No PBKDF2 upgrade is needed — there is nothing that
qualifies as "hash a password/PIN-class secret" outside of Clerk, which
already handles that correctly and out of Sweepr's control.

## Audit findings (this pass)

- **Fixed — `apps/api/src/routes/admin.ts:20`**: `GET /admin/users/:id/sms-consent`
  (returns a target user's SMS consent status, IP, user agent, and phone
  number) was reachable with **no authentication at all** — the gated-prefix
  allowlist only covered `/stats,/cleaners,/customers,/jobs,/events,/applications,/disputes`
  and omitted `/users`. Added `/users` to the gated prefixes so it now
  requires `requireAuth` + `requireAdmin` like its siblings.
- **Fixed — `apps/api/src/lib/errors.ts`**: `toSafeError()` accepted an
  `isDev` flag but never used it — production error responses always
  included `detail: err.message`, leaking internal error text (potentially
  including stack-adjacent details) to any client that triggered an
  unhandled exception. Now `detail` is only included when `isDev` is true.
- **Fixed — leaked `detail: String(err)` / raw error messages to clients**
  in `routes/checkr.ts` (`/invite` DB-error paths), `routes/didit.ts`
  (`/session` failure), and `routes/adminMail.ts` (send failure) — server
  logs still get `logger.error(...)` with the full error; clients now get a
  generic message.
- **Verified, no gap**: `/admin/status` and `/admin/insurance` gates, and
  `storage.ts` sign-upload ownership checks, from a prior audit remain in
  place.
- **Verified, no IDOR found** across `bookings.ts`, `reviews.ts`,
  `cleanerDashboard.ts`, `cleaners.ts`, `notifications.ts`,
  `subscriptions.ts`, `account.ts`, `customerProfile.ts`, `dayOfService.ts`,
  `insurance.ts`, `training.ts`, `courses.ts` — every `:id`-scoped
  read/write re-derives ownership from the Clerk JWT.
- **Verified, all webhooks fail closed**: Stripe, Clerk, Checkr, Didit,
  MailerSend (SMS/IT/security/mailbox inbound, outbound-status). Hardened
  `smsInbound.ts` and `itInbound.ts` to use constant-time signature
  comparison (`lib/webhookAuth.ts::timingSafeEqual`) instead of `!==`,
  matching the pattern already used in `mailboxInbound.ts`/`security.ts`.
