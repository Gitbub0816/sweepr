# 02 · Company Overview

## What Sweepr is

Sweepr is a **residential cleaning marketplace**. Customers book a vetted,
trained, insured cleaning professional for their home; cleaners receive
guaranteed, documented, fairly-paid work. The platform sits between the two
parties and handles everything that normally breaks down in informal
arrangements: identity verification, scheduling, navigation, communication,
proof of work, payment, and dispute resolution.

The experience is intentionally modeled on best-in-class on-demand services —
DoorDash, Uber, Instacart — adapted for the unique trust requirements of letting
someone into your home.

## The two sides of the marketplace

### Customers
- Book a service window and a service type (Standard, Deep, Move-out, etc.).
- See the assigned cleaner's name, photo, and rating in advance.
- Track the cleaner in real time on service day (like a DoorDash driver).
- Receive a full evidence package on completion (before/after photos, secure
  checkout photo, timeline).
- Rate, tip, report an issue, or request a re-clean.

### Cleaners
- Complete a structured onboarding: profile → training → identity →
  background check → activation.
- Receive job cards with earnings up front; addresses stay hidden until they
  start their route.
- Follow a guided, step-by-step service workflow that cannot be skipped.
- Get paid reliably, with optional platform insurance coverage.

## How a booking flows end to end

```text
Customer books
      ↓
Cleaner assigned (vetted, trained, covered)
      ↓
Service day: tracking, masked comms, arrival verification
      ↓
Evidence: before photos → cleaning → after photos → secure checkout
      ↓
Completion package generated → payout queued → customer rates/tips
```

The detailed operational rules for service day live in
[Day-of-Service Operations](./05-day-of-service.md).

## The product surface (the apps)

Sweepr is a pnpm + Turborepo monorepo. Each audience gets a dedicated app, all
sharing common UI and utilities.

| App | Path | Audience | Purpose |
|-----|------|----------|---------|
| **Marketing** | `apps/marketing` | Public | Landing pages, coverage map, waitlist, pricing |
| **Customer** | `apps/customer` | Customers | Booking, tracking, history, evidence |
| **Cleaner** | `apps/cleaner` | Cleaners | Onboarding, training, jobs, day-of-service workflow, earnings, insurance |
| **Admin** | `apps/admin` | Internal | Operations, training authoring, review queues, broadcasts, service areas |
| **Status** | `apps/status` | Public | Incident / status page |
| **Legal** | `apps/legal` | Public | Contracts, policies, agreements |
| **API** | `apps/api` | — | Cloudflare Worker (Hono) backend for all apps |

Shared packages:

| Package | Purpose |
|---------|---------|
| `packages/ui` | Shared React components, layout shell, map styles |
| `packages/utils` | Pricing, storage helpers, shared logic |
| `packages/db` | Schema, migrations, typed query helpers |

## Where we operate

Sweepr launches market by market. The live and upcoming service areas are
managed in the Admin app (Service Areas) and surfaced publicly on the marketing
coverage map. During pre-launch, pricing may be gated behind a newsletter CTA via
the `prelaunch_pricing` site setting while numbers are finalized.

## Business model (at a glance)

- **Service fee** on each completed booking (marketplace take rate).
- **Optional cleaner coverage program** — a recurring $15/month contractor
  insurance subscription (see [Insurance & Coverage](./06-insurance-and-coverage.md)).
- **Tips** pass through to cleaners.

---

[← Welcome](./01-welcome.md) · [Back to index](./README.md) · [Next: Cleaner Lifecycle →](./03-cleaner-lifecycle.md)
