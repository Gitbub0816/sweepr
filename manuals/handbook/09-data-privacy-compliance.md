# 09 · Data, Privacy & Compliance

This chapter is the reference for how Sweepr handles personal data. It complements
the repo-level [`SECURITY.md`](../../SECURITY.md) and the operational rules in
[Trust & Safety](./07-trust-and-safety.md).

## Data-handling non-negotiables

1. **No biometric data, ever.** Sweepr NEVER receives or stores ID images,
   selfies, or biometric data. Identity verification is delegated to Didit's
   hosted flow; Sweepr keeps only pass/fail + a session reference.
2. **Least exposure.** Personal contact info and home addresses are withheld
   until the workflow strictly requires them, and from whom.
3. **Documented, not hoarded.** We retain evidence necessary for disputes and
   compliance; we do not collect data we don't need.

## Categories of personal data we process

| Category | Examples | Where it lives |
|----------|----------|----------------|
| Account | name, email, role | Neon Postgres + Clerk |
| Contact (masked) | phone (for masking only) | masking provider; never cross-exposed |
| Location (service) | GPS at arrival, photo geotags | Neon (event records) |
| Evidence | before/after/security photos | Object storage (→ Cloudflare R2) |
| Verification result | identity pass/fail, background result | Neon (result only) |
| Insurance docs | uploaded policy files | Cloudflare R2 + `CleanerInsurance` metadata |
| Communications | chat, call metadata/recordings | Neon + provider |

## GDPR & data subject rights

Migration `002_gdpr.sql` establishes GDPR-supporting structures. We support:

- **Access / export** — a data subject can request their data.
- **Erasure** — account deletion / right to be forgotten, subject to legal
  retention (e.g. evidence tied to an open dispute or financial records).
- **Rectification** — correcting inaccurate profile data.

## Retention

- **Evidence packages** are retained for the dispute/claims window and any legal
  hold; otherwise aged out per policy.
- **Financial records** follow applicable tax/accounting retention.
- **Verification artifacts** are minimal by design (results only).

## Cookies & consent

The marketing site uses a cookie-consent mechanism
(`apps/marketing/src/components/CookieConsent.tsx`). Non-essential tracking is
gated behind consent.

## Security posture (summary)

- **Auth:** Clerk; API uses `Authorization: Bearer` tokens (no cookies →
  CSRF-immune by design).
- **Secrets boundary:** build-time `VITE_*` → GitHub secrets; runtime secrets →
  Cloudflare Worker secrets. Service-account JSON
  (`FIREBASE_SERVICE_ACCOUNT`) is a Worker secret, never shipped to the client.
- **Edge controls:** rate limiting and origin allow-listing in the API.
- **Transport:** HTTPS throughout; outbound goes through the platform proxy with
  pinned CA — TLS verification is never disabled.

## Legal documents

Customer- and cleaner-facing legal text (e.g. Independent Contractor Agreement,
Privacy Policy) is served by `apps/legal`. The handbook describes operational
intent; the legal app is the binding text.

---

[← Payments & Earnings](./08-payments-and-earnings.md) · [Back to index](./README.md) · [Next: Engineering & Architecture →](./10-engineering-and-architecture.md)
