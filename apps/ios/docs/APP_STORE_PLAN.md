# Sweepr iOS — App Store readiness plan (execution brief)

> Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only.

Base branch: `ios-refine` (most complete; the other `ios*` branches are subsets and
are being retired). Two apps ship from one `apps/ios/` tree:

- **Sweepr** — customer app, bundle `com.getsweepr.customer`
- **CleanWithSweepr** — cleaner app, bundle `com.getsweepr.cleaner`
- **SweeprKit** — shared Swift package (models, API clients, auth, design system, UI)

## Locked architecture decision (owner, this session)

**Keep SKIP dual-platform.** The apps are SwiftUI transpiled to Kotlin/Compose via
SKIP (skip.tools). Therefore:

- **No native binary SDKs.** Mapbox Navigation SDK and the Seam mobile SDK are
  iOS-only xcframeworks SKIP cannot transpile — they are **out**.
- **Maps = SKIP-safe MapKit + external handoff.** A `MapKit` map (SKIP maps this to
  maps-compose via `skip.yml`) to show the cleaner/job location and route preview,
  plus an "Open in Maps" / directions handoff to the system maps app. **No embedded
  3D turn-by-turn** (matches the web, where Mapbox ToS also forbids in-app TbT).
- **Seam "tap to unlock" = backend-driven.** The unlock is a button that calls our
  API (`/smart-entry/booking/:id/access/unlock` etc.), which talks to Seam
  server-side. No on-device NFC/BLE Seam SDK. The interaction should still *feel*
  like a deliberate, satisfying tap-to-unlock (haptics, animation, confirmation),
  gated exactly as the web is (checked-in cleaner, reveal/unlock guards).
- Everything stays inside the SwiftUI/Foundation subset SkipUI/SkipFoundation/
  SkipModel support. Declare any platform-divergent API in each target's
  `Skip/skip.yml`. Do **not** add `#if canImport` native-only code paths.

## Compile-verify (the only gate available here — no Xcode/Mac in this env)

Swift 6.0.3 toolchain is installed at
`/opt/swift-6.0.3-RELEASE-ubuntu24.04/usr/bin`. Run:

```bash
export PATH="/opt/swift-6.0.3-RELEASE-ubuntu24.04/usr/bin:$PATH"
bash apps/ios/Verify/verify.sh
```

It assembles a scratch SwiftPM package (checked-in SwiftUI/MapKit **shims** +
real SweeprKit + both apps), builds both apps, runs SweeprKitTests. Must print
`VERIFY OK`. If a screen uses a SwiftUI/MapKit API the shims don't declare, add a
faithful signature to `Verify/Shims/**` (matching real Apple API) rather than
dumbing down the app code. This proves type-checking only; runtime SwiftUI/Compose
still needs `skip verify` on a Mac (owner's step).

## Work waves

- **Wave A — foundation (parallel, disjoint):**
  - *SweeprKit+*: elevate the design system (elevation/shadow tokens, motion,
    pressed/disabled states, richer type scale, new components: list row, stat,
    progress, segmented control, sheet, section header, empty/error states);
    add a SKIP-safe `MapPreview` (MapKit) + `openInMaps` handoff; add a
    backend-driven Smart-Entry unlock model + API method + a reusable
    `TapToUnlock` control. Keep verify green; extend shims as needed.
  - *Platform config*: `Info.plist` usage strings (when-in-use + always location,
    camera, photo library, Face ID on cleaner, notifications), background modes
    (location, remote-notification), `*.entitlements` (associated domains for
    universal links, push, keychain), `PrivacyInfo.xcprivacy` for BOTH apps
    (required-reason APIs + data-collection types), App Store metadata
    (`docs/appstore/*`: name, subtitle, keywords, description, promo text,
    privacy-nutrition-label mapping, review notes — document that membership is a
    physical-service Stripe subscription, **not** IAP, per App Review 3.1.1).
- **Wave B — screens (parallel, disjoint app dirs, after A verifies):**
  - *Customer (Sweepr/)*: Home, Bookings, BookingDetail, BookFlow, Membership,
    SmartEntry, LiveTracking, Account — world-class polish on the enriched system.
  - *Cleaner (CleanWithSweepr/)*: Jobs, JobDetail, Route, Earnings, Account —
    RouteScreen uses the maps handoff; JobDetail uses TapToUnlock.

Brand rules (carry over): ClearKey `//` header on every file; money is integer
cents, server authoritative; brand is "Sweepr" (never "Sweepr Pro"); dark mode is
warm graphite, no blue; Smart Entry codes stay behind the reveal/unlock guard and
are only fetched once the cleaner is checked in.
