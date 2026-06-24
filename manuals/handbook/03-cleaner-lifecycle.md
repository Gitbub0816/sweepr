# 03 · Cleaner Lifecycle

A cleaner moves through a strict, gated lifecycle. Each stage unlocks the next —
a cleaner **MUST NOT** be able to accept jobs until every required stage is
complete. The authoritative state lives in the `cleaners.status` column.

## Lifecycle states

The `cleaners.status` field (see `packages/db/src/migrations/007_training_system.sql`)
progresses through:

```text
draft
profile_incomplete
identity_pending
training_required
training_in_progress
training_failed
training_completed
background_check_available
background_check_pending
background_check_passed
background_check_failed
pending_activation
active
paused
rejected
```

> Legacy values (`pending`, `approved`, `suspended`) remain accepted for backward
> compatibility during migration but MUST NOT be used for new flows.

## The onboarding funnel

```text
1. Sign up (Clerk)
        ↓
2. Build profile  ──────────────►  profile_incomplete → identity_pending
        ↓
3. Complete required training  ──►  training_required → training_in_progress → training_completed
        ↓
4. Identity verification  ───────►  (Didit hosted flow — Sweepr stores NO biometric data)
        ↓
5. Background check  ────────────►  background_check_available → pending → passed
        ↓
6. Activation review  ───────────►  pending_activation → active
```

### 1. Sign-up & authentication
Cleaners authenticate with **Clerk**. Social (Google/Apple) and phone auth are
supported where enabled in the Clerk dashboard. A `users` row is created/linked
by `clerk_id`; role is stored in both Clerk `publicMetadata.role` and the DB
`users.role` (these are kept in sync — see
[Engineering & Architecture](./10-engineering-and-architecture.md)).

### 2. Profile
Basic professional profile: name, photo (avatar), service offerings, working
area. Profile photos are uploaded via signed URLs to object storage (see
[Engineering & Architecture](./10-engineering-and-architecture.md) — storage is
moving to Cloudflare R2).

### 3. Required training — the unlock gate
Training is **the first hard gate** and gates the background check. A cleaner
must pass all **base** modules (and any **service-specific** modules for the
services they offer) before `background_check_unlocked` flips true. Full detail:
[Training System](./04-training-system.md).

Relevant cleaner columns:
- `training_status`
- `training_completed_at`
- `required_training_completed`
- `background_check_unlocked`

### 4. Identity verification
Handled by **Didit** via a hosted flow. **Critical privacy rule:** Sweepr
**NEVER** receives or stores ID images, selfies, or biometric data. The client
only ever receives a hosted URL; Didit credentials are never exposed to the
frontend. Sweepr stores only the pass/fail result and a session reference.

### 5. Background check
Once unlocked by training, the background check runs (Checkr). The cleaner moves
through `background_check_available → pending → passed/failed`.

### 6. Activation
After identity + background check pass, the cleaner enters
`pending_activation` for a final operations review, then becomes `active` and can
accept jobs.

## Ongoing obligations once active

An active cleaner MUST continuously maintain:

| Obligation | Enforced by |
|------------|-------------|
| Valid coverage (own policy or Sweepr program) | [Insurance & Coverage](./06-insurance-and-coverage.md) — `Coverage Required` blocks jobs |
| Current required training (incl. re-takes on major policy changes) | [Training System](./04-training-system.md) |
| Good standing (rating, conduct, no open disputes) | [Policies & Conduct](./11-policies-and-conduct.md) |

If any lapses, the cleaner is moved to a restricted state and **cannot accept
jobs** until resolved.

## Pausing & offboarding

- `paused` — voluntary or administrative hold; retains account and history.
- `rejected` — failed a gate or violated policy.
- Data handling on offboarding follows
  [Data, Privacy & Compliance](./09-data-privacy-compliance.md).

---

[← Company Overview](./02-company-overview.md) · [Back to index](./README.md) · [Next: Training System →](./04-training-system.md)
