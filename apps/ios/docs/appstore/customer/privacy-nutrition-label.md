<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Privacy ("nutrition label") — Sweepr (customer)

This is the human-readable mapping of what to enter in App Store Connect →
App Privacy. It matches `Sweepr/Sources/Sweepr/Resources/PrivacyInfo.xcprivacy`
exactly. Keep the two in sync.

## Tracking
- **Does this app track you?** No.
- Tracking domains: none.

## Data collected
All items below are **linked to your identity**, used only for **App
Functionality**, and **not** used for tracking.

| Data type | ASC category | Why |
| --- | --- | --- |
| Precise Location | Location → Precise Location | Live cleaner-arrival map; confirm service address (foreground only) |
| Name | Contact Info → Name | Account and booking |
| Email Address | Contact Info → Email Address | Account, receipts, notifications |
| Phone Number | Contact Info → Phone Number | Account, cleaner/customer contact |
| Physical Address | Contact Info → Physical Address | The home service address to be cleaned |
| Payment Info | Financial Info → Payment Info | Bookings, tips, Sweepr+ (processed by Stripe) |
| Photos or Videos | User Content → Photos or Videos | Scope-request and booking images |
| Device ID | Identifiers → Device ID | Device continuity on booking requests |

## Not collected
- No browsing/search history, no contacts, no health, no advertising data.
- No third-party analytics/advertising SDKs in the app.

## Required-reason APIs
- **UserDefaults** — reason `CA92.1` (app preferences / `@AppStorage`, accessible
  only to the app itself).
