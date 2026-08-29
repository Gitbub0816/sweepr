<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Review compliance checklist — Sweepr (customer)

| Guideline | Risk | Status / mitigation |
| --- | --- | --- |
| **3.1.1 / 3.1.3(e)** In-App Purchase | Membership + payments could be mistaken for IAP | Bookings, tips, and Sweepr+ pay for **real-world cleaning services** → Stripe, not IAP. Documented in `review-notes.md`. No digital goods anywhere. |
| **5.1.1** Data collection & permission strings | Vague purpose strings get rejected | All usage strings are specific and behavior-scoped (see `Sweepr/Darwin/Info.plist`). Location is foreground-only; no unjustified permissions. |
| **5.1.1(v)** Account deletion | Missing in-app deletion | In-app **Account → Delete account** (confirm which screen ships the control — see below). |
| **5.1.2 / privacy manifest** | xcprivacy mismatch with App Privacy | `PrivacyInfo.xcprivacy` and `privacy-nutrition-label.md` are kept in sync; tracking = false, no tracking domains. |
| **4.0** Design | Thin/low-quality UI | Full native SwiftUI experience (home, booking wizard, live tracking, membership, account). |
| **2.1** Completeness | Broken demo / placeholder content | Provide a working demo account (`review-notes.md`); screens fall back to sample data offline so nothing appears broken. |
| **4.2** Minimum functionality | Marketplace app must be substantial | Booking, live tracking, Smart Entry, membership, history — well beyond minimum. |
| **Push** | aps-environment | `Sweepr.entitlements` declares `aps-environment` (development; promoted to production at distribution). |
| **Universal links** | associated-domains must resolve | `applinks:app.getsweepr.com`; ensure the AASA file is served at `https://app.getsweepr.com/.well-known/apple-app-site-association`. |

## Owner action items before submit
- [ ] Confirm the **in-app account deletion** control ships on the Account screen
      (Guideline 5.1.1(v)). If not yet present, it must be added by the Swift-owning
      agent before submission.
- [ ] Fill demo credentials + review-contact email in `review-notes.md`.
- [ ] Confirm the AASA file is deployed for `app.getsweepr.com`.
- [ ] Verify Sweepr+ is presented purely as a physical-service discount (no
      language implying unlocked app features), to keep the 3.1.3(e) posture clean.
