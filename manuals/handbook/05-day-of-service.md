# 05 · Day-of-Service Operations

> **Version 1.0 · Applies to:** Residential cleaning services.
> **Style:** DoorDash/Uber-style workflow with controlled access, real-time
> tracking, evidence collection, and privacy protection.

This is the operational heart of Sweepr. The day-of-service flow is the primary
service-progress experience for both customer and cleaner, comparable to DoorDash
order tracking, Uber trip tracking, and Instacart fulfillment.

## Core principles (non-negotiable)

1. Customer addresses are protected until the day of service.
2. Customer phone numbers are **never** exposed to cleaners.
3. Cleaner phone numbers are **never** exposed to customers.
4. All communication occurs **through Sweepr**.
5. Property access information is **never** released until arrival is verified.
6. Every service **must** have photographic documentation.
7. Every property **must** have documented secure checkout.
8. All timestamps and location events are recorded.
9. Cleaners **cannot** bypass required workflow steps.
10. The customer receives continuous status updates throughout the service.

## The canonical status timeline

Both customer and cleaner see the same progress component:

```text
Scheduled → Cleaner Assigned → Cleaner Accepted → En Route → Arrived
→ Checked In → Before Photos Complete → Cleaning In Progress
→ Final Inspection → Checkout Complete → Completed
```

---

## Customer journey

### 24 hours before service
**Can view:** booking date, service window, assigned cleaner name, profile,
rating, service details.
**Cannot view:** cleaner phone number, personal contact info, exact location.
**Can do:** update access/parking/entry instructions, message support.

### Service day

| Status | What the customer sees |
|--------|------------------------|
| **Scheduled** | "Your cleaning is scheduled today." + cleaner + arrival window + "Waiting for Cleaner Acceptance" |
| **Cleaner on the way** | "Cleaner is on the way." Live map, ETA, status updates (DoorDash-style) |
| **Arrived** | "Your cleaner has arrived." |
| **Checked in** | "Cleaner has checked in and is preparing the property." |
| **Before photos submitted** | "Pre-cleaning inspection completed. Cleaning is now in progress." |
| **Cleaning in progress** | "Cleaning In Progress · Started: 10:17 AM" |
| **Final inspection** | "Cleaner is performing final inspection." |
| **Completed** | "Cleaning Completed" — unlocks before/after photos, summary, secure-checkout photo |

**Communication options** (always through Sweepr):
- **Message cleaner** → Sweepr chat.
- **Call cleaner** → routed through a **number-masking service** (Twilio / Telnyx
  / Plivo). Customer never sees the cleaner's number and vice versa. Call
  recording optional.

**On completion the customer can:** rate, tip, report an issue, or request a
re-clean.

---

## Cleaner journey

### Morning of service
Cleaner sees **Today's Jobs**. Each job card shows: customer first name, service
type, duration estimate, earnings, service window. **The address remains
hidden.**

### Job pickup — "Start Route"
Only when the cleaner taps **Start Route** does Sweepr reveal the **property
address** and a **navigate** button (Google/Apple Maps/Waze). The customer begins
tracking the cleaner. Messaging/calling is available, only through Sweepr.

### Arrival verification — "I've Arrived"
On tap, the system validates **GPS enabled AND location within radius**
(recommended **150–300 feet** of the property).
- **Failure:** "You must be closer to the property to check in." — cannot proceed.
- **Success:** "Arrival Verified" — and **only now** does the system reveal:
  - **Property access** (e.g. "Lockbox Code: 4482", "Key under blue pot", "Smart
    lock: 1982").
  - **Customer instructions** (e.g. "Please avoid nursery", "Use pet-safe
    products", "Garage side entrance only").

### Mandatory before photos
The cleaner **cannot** start cleaning until inspection photos are complete. The
system generates a per-room checklist, e.g.:

| Room | Required photos |
|------|-----------------|
| Kitchen | Wide angle, countertops, sink |
| Living room | Wide angle, main surfaces |
| Bathroom | Sink, toilet, shower |
| Bedroom | Wide angle |

**Photo requirements:** in focus, well lit, taken on-site, GPS-verified,
timestamped. AI validation checks for blur, darkness, empty image, and
duplicates. After all photos upload → status **Pending Cleaning**, customer
notified.

### Cleaning phase
Cleaner sees "Cleaning In Progress." Available actions: chat/call customer,
report issue, add notes, contact support.

**Issue reporting** (e.g. broken appliance, excessive pet waste, unsafe
conditions, property inaccessible) **requires evidence photos** and notifies
support.

### Final documentation (before completion)
- **After photos** — same rooms as before; system guides "match previous angle."
- **Security confirmation photo** — a required final image proving the property
  is secured: front door closed & locked, key returned to lockbox, or alternative
  entry secured.

### Checkout — "Complete Service"
The system verifies all of:

```text
✓ Before photos uploaded
✓ After photos uploaded
✓ Security photo uploaded
✓ GPS still present
✓ Required checklist complete
```

On success: "Job Successfully Completed." Payout enters the processing queue;
customer receives a completion notification.

---

## The completion package

Generated automatically on completion:

- **Service summary** — arrival, check-in, completion times, total duration.
- **Evidence package** — before photos, after photos, security photo.
- **Communication log** — messages, calls, support interactions.
- **Metadata** — GPS records, timestamps, cleaner ID, job ID, device ID.

---

## Anti-fraud controls (summary)

| Control | Rule |
|---------|------|
| Address protection | Hidden until **Start Route** |
| Access protection | Codes hidden until **Arrival Verified** |
| Location verification | GPS enabled + permission granted + within radius |
| Photo verification | Every photo stores timestamp, GPS, device ID |
| Completion verification | **No payout** if any required photo, checkout photo, check-in, or GPS verification is missing |

See [Trust & Safety](./07-trust-and-safety.md) for the privacy architecture and
[Payments & Earnings](./08-payments-and-earnings.md) for how completion gates
payouts.

---

[← Training System](./04-training-system.md) · [Back to index](./README.md) · [Next: Insurance & Coverage →](./06-insurance-and-coverage.md)
