<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Review notes — Sweepr (customer)

## What Sweepr is
Sweepr is the customer side of a two-sided home-cleaning marketplace. Customers
book a cleaning, are matched with a background-checked professional cleaner, and
pay for a real-world cleaning performed at their home. The cleaner side is a
separate app, **Clean with Sweepr** (`com.getsweepr.cleaner`).

## Demo account
- Email: `REPLACE_WITH_DEMO_CUSTOMER_EMAIL`
- Password / code: `REPLACE_WITH_DEMO_CREDENTIALS`
- The demo account is pre-seeded with a sample upcoming booking so you can see
  live tracking, Smart Entry, tipping, and Sweepr+ management.

Sign-in is fully native: email + password, with an email one-time-code
fallback (no third-party/social login, so Sign in with Apple is not required
under Guideline 4.8). If a code is required during review, contact us at the
review-contact email and we will relay it, or use the seeded demo credentials
above.

## Payments are for real-world services — NOT In-App Purchase (Guideline 3.1.1 / 3.1.3(e))
All money in Sweepr pays for **physical, real-world cleaning services** delivered
at the customer's home:

- **Bookings** — one charge per cleaning, captured after the service is
  performed. Card entry happens on our secure Stripe-hosted payment page
  (app.getsweepr.com/pay) opened in the browser — standard for real-world
  services under 3.1.3(e), and it gives customers Apple Pay automatically.
- **Tips** — optional, paid to the cleaner.
- **Sweepr+ membership** — a subscription that provides **discounts and perks on
  physical cleaning services**, not digital content or app features.

Per **Guideline 3.1.3(e)** (goods and services consumed outside the app) and
**3.1.1**, these are correctly processed by **Stripe** and must not use In-App
Purchase. There is no digital content, unlockable app functionality, or virtual
currency sold anywhere in the app.

## Location
Location is **foreground only** in the customer app. It is used to show the
cleaner's live arrival on a map and to confirm the service address. The app does
not request "Always" location and declares no background `location` mode.

## Smart Entry
Smart Entry lets a customer grant secure, temporary door access so the cleaner
can enter when the customer isn't home. Every unlock is **authorized by Sweepr's
servers** (the app calls our API, which talks to the lock provider) — there is no
on-device lock SDK, and access is fully logged.

## Account deletion (Guideline 5.1.1(v))
Customers can delete their account and associated data from **Account → Delete
account** in the app. The action is confirmed in-app and processed server-side.

## Review contact
- Contact email: `REPLACE_WITH_REVIEW_CONTACT_EMAIL`
- Notes: cleaning is available only in active service areas; the demo account is
  provisioned in a live area.
