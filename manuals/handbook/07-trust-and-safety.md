# 07 · Trust & Safety

Trust is the product. This chapter consolidates the privacy and anti-fraud
architecture that lets a stranger safely enter someone's home — protecting both
parties.

## The privacy contract

| Protected thing | Exposed to whom | When unlocked |
|-----------------|-----------------|---------------|
| Customer home address | Cleaner | On **Start Route** (service day) |
| Property access codes / entry method | Cleaner | On **Arrival Verified** (GPS within radius) |
| Customer phone number | Cleaner | **Never** (masked) |
| Cleaner phone number | Customer | **Never** (masked) |
| ID images / selfies / biometrics | Sweepr | **Never received or stored** |

These rules are summarized operationally in
[Day-of-Service](./05-day-of-service.md); this chapter explains *why* and *how*.

## Number masking

All voice and chat communication is routed through Sweepr. Calls go through a
masking provider (**Twilio / Telnyx / Plivo**) so neither party sees the other's
real number. Chat is in-app. Call recording is optional and disclosed.

**Why:** personal contact info is the most common vector for off-platform
arrangements, harassment, and post-job privacy violations. Masking removes it
entirely.

## Address & access protection

- **Address** is withheld until the cleaner commits to the job by tapping
  **Start Route**. This prevents address harvesting from job listings.
- **Access codes / keys** are withheld until **arrival is GPS-verified** within
  150–300 ft of the property. A code is never visible to someone who is not
  physically there.

## Identity verification without biometric liability

Sweepr verifies identity through **Didit's hosted flow**. The cleaner completes
verification on Didit's surface; Sweepr receives only a pass/fail result and a
session reference.

> **Hard rule:** Sweepr **NEVER** receives or stores ID images, selfies, or
> biometric data. Didit credentials are never exposed to the frontend — the
> client only ever receives a hosted URL. This keeps Sweepr out of scope for
> biometric-data liability (e.g. BIPA-style risk).

## Evidence & accountability

Every job is documented so disputes have facts, not opinions:

- **Before/after photos** per room, validated for blur/darkness/empty/duplicate.
- **Secure-checkout photo** proving the property was locked/secured.
- **Metadata** on every photo: timestamp, GPS coordinates, device ID.
- **Communication log**: messages, calls, support interactions.

## Anti-fraud controls

| Control | Enforcement |
|---------|-------------|
| Workflow cannot be skipped | Steps are gated server-side; status only advances when prerequisites are met |
| Arrival fraud | GPS + radius check before access codes release |
| Photo fraud | On-site, timestamped, GPS-tagged; AI quality + duplicate checks |
| Payout fraud | **No payout** without complete before/after/security photos, check-in, and GPS verification |
| Insurance fraud | OCR + AI document validation with a 0–100 confidence score and manual review queue (see [Insurance](./06-insurance-and-coverage.md)) |

## API security posture

- The API authenticates with **`Authorization: Bearer` tokens, not cookies**, so
  it is **immune to CSRF by design**.
- Secrets are split by trust boundary: build-time `VITE_*` values live in GitHub
  secrets; runtime secrets (e.g. `FIREBASE_SERVICE_ACCOUNT`, `CLERK_SECRET_KEY`,
  `MAILERSEND_API_KEY`) live in **Cloudflare Worker secrets**.
- Rate limiting is applied at the edge (`apps/api/src/middleware/rateLimit.ts`).

More detail in [Engineering & Architecture](./10-engineering-and-architecture.md)
and [Data, Privacy & Compliance](./09-data-privacy-compliance.md).

---

[← Insurance & Coverage](./06-insurance-and-coverage.md) · [Back to index](./README.md) · [Next: Payments & Earnings →](./08-payments-and-earnings.md)
