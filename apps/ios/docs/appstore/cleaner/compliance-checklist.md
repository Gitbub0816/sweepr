<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Review compliance checklist — Clean with Sweepr (cleaner)

| Guideline | Risk | Status / mitigation |
| --- | --- | --- |
| **3.1.1 / 3.1.3(e)** In-App Purchase | Earnings/financial flows mistaken for IAP | No digital goods sold. Cleaners are **paid** via Stripe Connect for real-world work. Documented in `review-notes.md`. |
| **5.1.1** Permission strings | Background location is the highest-risk permission | `NSLocationAlwaysAndWhenInUseUsageDescription` clearly scopes background use to an active job (live arrival + geofenced Smart Entry). Face ID, camera, photos strings are specific. |
| **5.1.1** Background location justification | Apple scrutinizes "Always" location | Used only during a scheduled day of service; disclosed in-string and in `review-notes.md`. `UIBackgroundModes` includes `location`. |
| **5.1.1(v)** Account deletion | Missing in-app deletion | In-app **Account → Delete account** (confirm which screen ships it — see below). |
| **5.1.2 / privacy manifest** | xcprivacy mismatch | `PrivacyInfo.xcprivacy` ↔ `privacy-nutrition-label.md` in sync; precise location marked background-capable; tracking = false. |
| **4.0** Design | Thin UI | Full native SwiftUI day-of-service experience (jobs, route, job detail, earnings, account). |
| **2.1** Completeness | Reviewer can't exercise a cleaner flow | Demo cleaner seeded with a current-day job so route, check-in, Smart Entry, and earnings are all reachable. |
| **Push** | aps-environment | `CleanWithSweepr.entitlements` declares `aps-environment`. |
| **Universal links** | associated-domains | `applinks:clean.getsweepr.com`; ensure AASA is served at `https://clean.getsweepr.com/.well-known/apple-app-site-association`. |
| **Smart Entry safety** | "Unlock a door" could raise questions | Server-authorized, post-check-in, Face ID-gated, fully logged. No on-device lock SDK. Explained in `review-notes.md`. |

## Owner action items before submit
- [ ] Confirm the **in-app account deletion** control ships on the Account screen
      (Guideline 5.1.1(v)); note lawful retention of payout/tax records.
- [ ] Fill demo cleaner credentials + review-contact email in `review-notes.md`.
- [ ] Confirm the AASA file is deployed for `clean.getsweepr.com`.
- [ ] Confirm the reviewer's demo cleaner will be inside an active service area on
      the review date, with a job scheduled, so background location + Smart Entry
      are demonstrable.
