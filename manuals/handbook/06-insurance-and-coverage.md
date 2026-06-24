# 06 · Insurance & Coverage

The Insurance & Coverage module lives in the **Cleaner Dashboard** at:

```text
Dashboard → Account → Insurance & Coverage
```

## Purpose

Give cleaners two ways to satisfy their coverage requirement:

1. **Maintain their own qualifying insurance policy**, or
2. **Enroll in Sweepr's optional contractor coverage program.**

This reduces platform risk, simplifies onboarding, increases cleaner trust,
improves customer confidence, and creates a recurring revenue stream.

## Navigation

```text
Dashboard
 ├── Jobs
 ├── Earnings
 ├── Schedule
 ├── Messages
 ├── Performance
 └── Account
      ├── Profile
      ├── Background Check
      ├── Tax Documents
      ├── Banking
      ├── Insurance & Coverage   ◄── this module
      └── Settings
```

## Insurance dashboard

**Header card:** "Insurance & Coverage" with a status badge:

- 🟢 **Covered**
- 🟡 **Verification Pending**
- 🔴 **Coverage Required**

**Coverage method** (radio): `○ Sweepr Coverage Program` · `○ Personal Insurance
Policy`.

### If covered under Sweepr

```text
Coverage Program Active
Monthly Fee:        $15.00
Coverage Type:      Platform Contractor Coverage
Coverage Limit:     Up to $100,000 per covered incident
Status:             Active
Next Billing Date:  July 1, 2026
```
Button: **Manage Coverage**

### If using own insurance

```text
Insurance Provider:    State Farm
Policy Number:         XXXX-XXXX-1234
Coverage Amount:       $1,000,000
Expiration:            03/15/2027
Verification Status:   Verified
```
Button: **Update Insurance**

## Coverage selection screen

Shown when no coverage exists, a policy has expired, or the user changes options.

| | Option A — Sweepr Coverage Program (Recommended) | Option B — Bring Your Own Insurance |
|--|--|--|
| Benefits | No separate policy, immediate activation, auto-maintained, covers approved Sweepr jobs | Use existing policy |
| Cost | **$15/month**, up to $100,000 per covered incident | Cost of own policy |
| Requirements | — | Active policy, general liability, valid expiration |
| Action | **Enroll** | **Upload Insurance** |

## Enrollment flow (Sweepr program)

The cleaner must acknowledge:

```text
✓ Coverage applies only to approved Sweepr jobs.
✓ Coverage does not cover personal tools.
✓ Coverage does not cover activities outside the platform.
✓ Coverage does not guarantee claim approval.
✓ Monthly fee will be charged automatically.
```
Button: **Activate Coverage**

### Billing
Stripe subscription — product **"Sweepr Contractor Coverage"**, price **$15/month**.

`cleaner_coverage_subscriptions`:
```ts
{ id, cleaner_id, stripe_subscription_id, status, monthly_fee,
  started_at, canceled_at, next_billing_date, created_at }
```

## Bring-your-own-insurance flow

Cleaner uploads a PDF/JPG/PNG (max **10 MB**) which runs through a validation
pipeline:

```text
Upload → OCR Extraction → AI Validation → Risk Rules → Verified or Manual Review
```

### OCR extraction
Extracts `insurer_name`, `policy_number`, `insured_name`, `effective_date`,
`expiration_date`, `coverage_limit`, `document_type`.
Tools: Google Document AI / Azure Form Recognizer / AWS Textract.

### AI validation
- **Insurer exists** (State Farm, Progressive, Allstate, Travelers, Nationwide,
  Farmers, Liberty Mutual, …).
- **Dates valid:** `effective_date < today < expiration_date`.
- **Coverage amount:** `coverage_limit >= required_limit`.
- **Policy-number format:** matches expected pattern, not gibberish, not
  obviously fake.

### Fraud detection
AI flags Photoshop artifacts, missing signatures, strange fonts, edited fields,
low-confidence OCR, template inconsistencies. Produces a **0–100 score**:

```text
92 = Verified · 73 = Manual Review · 40 = Rejected
```

### Manual review queue
Internal admin panel "Insurance Review" shows cleaner, upload date, confidence
score, and AI notes, with actions: **Approve / Reject / Request New Upload**.

## Expiration tracking

A nightly job checks `expiration_date` and notifies at **60, 30, 14, 7, 1 days**
and on expiry, e.g.:

```text
Your insurance policy expires in 30 days. Please upload an updated policy to
avoid account restrictions.
```

## Account restrictions

```text
Expired insurance  AND  no Sweepr coverage  =  Cannot Accept Jobs
```
Status becomes **Coverage Required** (ties into the
[Cleaner Lifecycle](./03-cleaner-lifecycle.md) restricted states).

## Claims workflow

```text
Customer reports damage → Create incident → Investigation
→ Determine liability → Submit insurance claim → Resolution
```

## Important business rules

**Coverage applies ONLY while:** the cleaner is actively assigned, performing
approved Sweepr work, the job exists in Sweepr, and the cleaner is authorized.

**Coverage does NOT apply to:** personal errands, side jobs, work booked outside
the platform, criminal activity, intentional damage, or unauthorized services.

## Data model

`CleanerInsurance`:
```ts
{ id, cleaner_id,
  coverage_type,        // SWEEPR | PERSONAL
  provider_name, policy_number, coverage_limit,
  effective_date, expiration_date,
  verification_status, verification_score,
  document_url,         // stored in Cloudflare R2
  created_at, updated_at }
```

## Phase 2 (future)

Integrations with **Canopy Connect, Certificial, MeasureOne** for automated
verification, live policy monitoring, real-time expiration updates, and reduced
manual reviews. Until the platform exceeds ~5,000 cleaners, **AI document
validation + manual review** is the most cost-effective approach.

---

[← Day-of-Service](./05-day-of-service.md) · [Back to index](./README.md) · [Next: Trust & Safety →](./07-trust-and-safety.md)
