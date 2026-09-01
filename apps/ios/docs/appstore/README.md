<!-- Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only. -->

# App Store submission kit — Sweepr iOS

Prepared metadata, privacy declarations, and review notes for the two Sweepr iOS
apps. This is the platform-config + metadata layer; the Swift app targets are
built by the SKIP toolchain on a Mac (see below).

## Two apps

| App | Bundle ID | Display name | Universal-link domain |
| --- | --- | --- | --- |
| Customer | `com.getsweepr.customer` | Sweepr | `app.getsweepr.com` |
| Cleaner | `com.getsweepr.cleaner` | Clean with Sweepr | `clean.getsweepr.com` |

## Folder layout
```
docs/appstore/
├── README.md                     ← this index
├── customer/
│   ├── metadata.md               name, subtitle, keywords, description, URLs, category
│   ├── privacy-nutrition-label.md  App Privacy mapping (matches xcprivacy)
│   ├── review-notes.md           App Review notes (marketplace, demo, IAP posture)
│   └── compliance-checklist.md   guideline risk checklist + owner action items
└── cleaner/
    ├── metadata.md
    ├── privacy-nutrition-label.md
    ├── review-notes.md
    └── compliance-checklist.md
```

## Where the platform-config files live (source of truth)
| Concern | Customer (Sweepr) | Cleaner (CleanWithSweepr) |
| --- | --- | --- |
| Info.plist | `Sweepr/Darwin/Info.plist` | `CleanWithSweepr/Darwin/Info.plist` |
| Entitlements | `Sweepr/Sweepr.entitlements` | `CleanWithSweepr/CleanWithSweepr.entitlements` |
| Privacy manifest | `Sweepr/Sources/Sweepr/Resources/PrivacyInfo.xcprivacy` | `CleanWithSweepr/Sources/CleanWithSweepr/Resources/PrivacyInfo.xcprivacy` |

The `privacy-nutrition-label.md` files are the human-readable copy of the
`.xcprivacy` manifests — keep them in sync whenever data collection changes.

## Key compliance posture (both apps)
- **No In-App Purchase.** Sweepr+ membership, bookings, tips, and cleaner payouts
  are all **real-world cleaning services** billed via **Stripe** — App Review
  Guideline 3.1.3(e) / 3.1.1. Do not add StoreKit/IAP.
- **No tracking.** `NSPrivacyTracking = false`, no tracking domains, no
  advertising/analytics SDKs in the native apps.
- **Location:** customer = foreground only; cleaner = foreground **plus**
  day-of-service background (live arrival + geofenced Smart Entry).
- **Smart Entry is server-authorized** — no on-device lock SDK; no NFC entitlement.

## Still requires the owner's Mac / Xcode / App Store Connect
This environment has no Xcode, no `skip` CLI, and no signing identity. On a Mac,
the owner must:

1. **Generate the Xcode projects** — `skip init` per app (see `apps/ios/README.md`
   "Finishing setup"), which wires in the committed `Darwin/Info.plist`,
   `*.entitlements`, and `Resources/PrivacyInfo.xcprivacy`. Confirm the
   entitlements file is attached to each app target's build settings
   (`CODE_SIGN_ENTITLEMENTS`).
2. **Signing** — create the App IDs, enable Push Notifications + Associated
   Domains + (cleaner) Background Modes capabilities, and provisioning profiles in
   the Apple Developer portal. Set `aps-environment` to `production` for release
   builds (the committed value is `development`; Xcode promotes it on export).
3. **AASA files** — deploy the apple-app-site-association files at
   `https://app.getsweepr.com/.well-known/...` and
   `https://clean.getsweepr.com/.well-known/...` so universal links resolve.
4. **Screenshots** — capture required device screenshots (6.9"/6.5" + iPad if
   offered) on simulator/device. Not producible in this environment.
5. **App Store Connect** — create both app records, paste the `metadata.md`
   fields, complete **App Privacy** from the `privacy-nutrition-label.md` files,
   paste **review notes**, and fill the `REPLACE_...` demo credentials + contact
   email placeholders.
6. **Upload** — `skip export` to produce the archives, then upload builds via
   Xcode Organizer / Transporter and submit for review.
7. **Account deletion** — verify the in-app account-deletion control ships on each
   Account screen (Guideline 5.1.1(v)) before submitting; if absent, the
   Swift-owning work must add it.
