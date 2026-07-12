<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# Clean with Sweepr — cleaner app

Native cleaner app (iOS SwiftUI + Android Compose via SKIP). Bundle
`com.getsweepr.cleaner`. Depends on `../SweeprKit`. Same Clerk primary
application as the customer app (one account can be both).

**Targets the iOS 26 SDK** (build with Xcode 26+; `Package.swift` platform is
`.iOS(.v26)`, `Skip.env` sets `IPHONEOS_DEPLOYMENT_TARGET = 26.0`, and
`Darwin/Info.plist` sets `MinimumOSVersion` to `26.0`). Uses iOS 26-era SwiftUI
(`NavigationStack`, `ContentUnavailableView`, two-parameter `.onChange`) within
the SKIP-supported subset.

**Screens:** `RootView` TabView → Jobs · Route · Earnings · Account.
- **Jobs** — Today / Upcoming / Available (offer inbox) segments; masked
  address until en route; accept/decline with haptics; pull-to-refresh; an
  in-shift banner pins the active job at the top; `ContentUnavailableView`
  empty states.
- **`JobDetailScreen`** — the day-of-service flow, the heart of the app
  (mirrors the web `JobDetailPage.tsx`): Confirmed → Start Route (Apple Maps
  deep link) → Arrive → Smart Entry (biometric-gated reveal, 45s auto-hide,
  unlock/secure, "powered by Seam") → Before photos → In-progress checklist by
  room → After photos → Secure the door → Checkout. Progress bar + haptics at
  each step.
- **Route** — MapKit stops with sequence numbers and an ETA card list per stop
  (polyline overlay is a documented stub — see the file comment).
- **Earnings** — today/week/lifetime stat cards, recent payouts, a tips
  visibility note, and a founding-member 5% bonus badge slot.
- **Account** — profile, Didit/Yardstik verification badges, service-area ZIP
  entry, availability toggle, sign out confirmation.

Cleaner-only endpoints without a confirmed backend contract yet (offer
accept/decline, Smart Entry reveal/unlock, checklist, payouts, availability,
service area, verification status) live in `Support/CleanerAPI.swift` rather
than `SweeprKit`, per this app's ownership boundary — hoist them into
`SweeprKit/Networking/SweeprAPI.swift` once confirmed. Supporting local models
(`JobSegment`, `DayOfServiceStep`, `RoomChecklist`, `PayoutRecord`,
`VerificationStatus`, etc.) live in `Support/CleanerModels.swift` for the same
reason.

## Run iOS
```bash
brew install skiptools/skip/skip     # one-time
cd apps/ios/CleanWithSweepr
xed .                                # open in Xcode 26+, ⌘R
```

## Run Android (transpiled)
```bash
cd apps/ios/CleanWithSweepr
skip export
skip launch --android
```

First-time project generation and the Clerk token provider TODO are covered in
`apps/ios/README.md` ("Finishing setup").
