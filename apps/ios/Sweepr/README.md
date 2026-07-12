<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# Sweepr — customer app

Native customer app (iOS SwiftUI + Android Compose via SKIP). Bundle
`com.getsweepr.customer`. Depends on `../SweeprKit`.

**Screens:** `RootView` TabView → Home · Book · Bookings · Account, plus
`BookingDetailScreen` and a native `LiveTrackingScreen` (MapKit → maps-compose).
`BookFlowScreen` is a wizard stub to port from `apps/customer/src/booking/`.

## Run iOS
```bash
brew install skiptools/skip/skip     # one-time
cd apps/ios/Sweepr
xed .                                # open in Xcode, ⌘R
```

## Run Android (transpiled)
```bash
cd apps/ios/Sweepr
skip export                          # Swift → Kotlin/Compose
skip launch --android                # build + install
```

First-time project generation and the Clerk token provider TODO are covered in
`apps/ios/README.md` ("Finishing setup").
