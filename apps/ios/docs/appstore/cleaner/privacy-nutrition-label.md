<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Privacy ("nutrition label") — Clean with Sweepr (cleaner)

Human-readable mapping for App Store Connect → App Privacy. Matches
`CleanWithSweepr/Sources/CleanWithSweepr/Resources/PrivacyInfo.xcprivacy`
exactly. Keep the two in sync.

## Tracking
- **Does this app track you?** No.
- Tracking domains: none.

## Data collected
All items below are **linked to your identity**, used only for **App
Functionality**, and **not** used for tracking.

| Data type | ASC category | Why |
| --- | --- | --- |
| Precise Location | Location → Precise Location | En-route routing, live-arrival sharing, and geofenced Smart Entry — foreground **and** day-of-service background |
| Name | Contact Info → Name | Account and profile |
| Email Address | Contact Info → Email Address | Account and notifications |
| Phone Number | Contact Info → Phone Number | Account and customer contact |
| Physical Address | Contact Info → Physical Address | Customer job addresses serviced |
| Payment Info | Financial Info → Payment Info | Stripe Connect payout details and earnings |
| Photos or Videos | User Content → Photos or Videos | Required before/after and scope images |
| Device ID | Identifiers → Device ID | Device continuity on day-of-service requests |

Note when completing App Privacy: for **Precise Location**, indicate background
use — it powers continuous live-arrival updates and geofenced Smart Entry during
an active job (see the `NSLocationAlwaysAndWhenInUseUsageDescription` string).

## Not collected
- No browsing/search history, no contacts, no health, no advertising data.
- No third-party analytics/advertising SDKs in the app.

## Required-reason APIs
- **UserDefaults** — reason `CA92.1` (app preferences / `@AppStorage`).
