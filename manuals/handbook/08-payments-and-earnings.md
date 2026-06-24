# 08 · Payments & Earnings

> 🟡 This chapter documents the current model and intended behavior. Where
> implementation is still in progress it is marked ⚪.

## Principles

1. **Pay is shown up front.** Job cards display earnings before a cleaner accepts.
2. **Completion gates payout.** A payout is only queued once the day-of-service
   workflow is fully and verifiably complete.
3. **Tips pass through.** Tips go to the cleaner.

## How a payout is earned

A payout enters the processing queue **only** when checkout verification passes
(see [Day-of-Service](./05-day-of-service.md)):

```text
✓ Before photos uploaded
✓ After photos uploaded
✓ Security (secure-checkout) photo uploaded
✓ GPS present throughout
✓ Required checklist complete
        ↓
"Job Successfully Completed" → payout enters processing queue
```

If any requirement is missing, **no payout is released**. This is an anti-fraud
control, not a discretionary penalty.

## Money flows

| Flow | Direction | Notes |
|------|-----------|-------|
| Booking charge | Customer → Sweepr | Captured per the booking |
| Service fee (take rate) | Retained by Sweepr | Marketplace revenue |
| Cleaner payout | Sweepr → Cleaner | After verified completion |
| Tip | Customer → Cleaner | Pass-through |
| Coverage subscription | Cleaner → Sweepr | $15/month Stripe subscription ([Insurance](./06-insurance-and-coverage.md)) |

## Banking & tax

Cleaners manage payout banking and tax documents under
**Account → Banking** and **Account → Tax Documents**
(see [Cleaner Lifecycle](./03-cleaner-lifecycle.md) navigation).

## Holds & disputes ⚪

- A job under dispute (e.g. damage report, re-clean request) may have its payout
  **held** pending resolution via the claims workflow.
- Resolution and liability determination follow
  [Insurance & Coverage](./06-insurance-and-coverage.md) and
  [Policies & Conduct](./11-policies-and-conduct.md).

---

[← Trust & Safety](./07-trust-and-safety.md) · [Back to index](./README.md) · [Next: Data, Privacy & Compliance →](./09-data-privacy-compliance.md)
