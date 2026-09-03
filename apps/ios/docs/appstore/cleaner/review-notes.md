<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Review notes — Clean with Sweepr (cleaner)

## What Clean with Sweepr is
This is the cleaner (worker) side of a two-sided home-cleaning marketplace.
Approved professional cleaners use it to run their day of service: view assigned
jobs, get directions to the property, check in/out with photos, use Smart Entry
to open the door, and track earnings. The customer side is a separate app,
**Sweepr** (`com.getsweepr.customer`).

## Demo account
- Email: `REPLACE_WITH_DEMO_CLEANER_EMAIL`
- Password / code: `REPLACE_WITH_DEMO_CREDENTIALS`
- The demo cleaner is pre-seeded with a sample assigned job for the current day
  so you can see the route handoff, GPS check-in, photo capture, Smart Entry
  reveal/unlock, and the earnings screen.

Sign-in is fully native: email + password with an email one-time-code fallback
(no third-party/social login, so Sign in with Apple is not required under
Guideline 4.8; the same identity backend serves customers — one person can be
both). If a code is needed during review, contact us and we will relay it, or
use the seeded demo credentials above.

## Location — foreground and background (Guideline 5.1.1)
The cleaner app uses location both in the foreground and, **during an active
job**, in the background:

- **When-in-use** — routing to the job and sharing live arrival with the customer.
- **Always / background** — on the day of service, to keep the customer's live
  arrival updated as the cleaner travels. Arrival check-in itself is
  server-verified from these position updates (within 150 m of the property).

Background location is disclosed clearly in
`NSLocationAlwaysAndWhenInUseUsageDescription` and is used only during a
scheduled job — not for continuous tracking. Directions are handed off to the
system Maps app (no embedded turn-by-turn).

## Smart Entry is server-authorized
Smart Entry unlocks are **authorized by Sweepr's servers**: the app calls our API,
which communicates with the lock provider. There is no on-device lock/NFC/BLE SDK.
Access is:

- revealed only **after the cleaner has checked in** to the job,
- gated behind a **Face ID** biometric confirmation, and
- fully logged server-side.

## Payments / payouts — not IAP (Guideline 3.1.1 / 3.1.3(e))
This app does not sell any digital goods. Cleaners are **paid** for real-world
cleaning work; payouts are handled via **Stripe Connect**. There is nothing to
purchase in-app, so In-App Purchase does not apply.

## Account deletion (Guideline 5.1.1(v))
Cleaners can delete their account from **Account → Delete account** in the app,
confirmed in-app and processed server-side. (Note: platform/tax/payout records
may be retained as required by law after account deletion.)

## Review contact
- Contact email: `REPLACE_WITH_REVIEW_CONTACT_EMAIL`
