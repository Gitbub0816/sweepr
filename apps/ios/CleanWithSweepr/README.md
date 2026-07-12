<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# Clean with Sweepr — cleaner app

Native cleaner app (iOS SwiftUI + Android Compose via SKIP). Bundle
`com.getsweepr.cleaner`. Depends on `../SweeprKit`. Same Clerk primary
application as the customer app (one account can be both).

**Screens:** `RootView` TabView → Jobs · Route · Earnings · Account, plus
`JobDetailScreen` — the day-of-service flow (mirrors the web
`JobDetailPage.tsx`): check-in status advancement and the Smart Entry
reveal-unlock (access code hidden behind a deliberate gesture, fetched only once
checked in). `RouteScreen` plots the day's stops on a native map.

## Run iOS
```bash
brew install skiptools/skip/skip     # one-time
cd apps/ios/CleanWithSweepr
xed .                                # open in Xcode, ⌘R
```

## Run Android (transpiled)
```bash
cd apps/ios/CleanWithSweepr
skip export
skip launch --android
```

First-time project generation and the Clerk token provider TODO are covered in
`apps/ios/README.md` ("Finishing setup").
