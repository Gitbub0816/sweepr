<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# Sweepr native mobile apps (iOS-first; Android via SKIP paused)

Two genuinely-native mobile apps that share one Swift codebase. **Not** web
wrappers — native SwiftUI on iOS. The Android story (transpilation to
Kotlin/Jetpack Compose via [SKIP](https://skip.tools)) is **paused/neutralized**
so a stock Xcode build needs nothing beyond Apple SDKs — see "SKIP status"
below for the one-manifest re-enable path.

## Open, build, test (Mac + Xcode 26)

```bash
open apps/ios/Sweepr.xcworkspace     # or open SweeprApps.xcodeproj directly
```

- Pick the **`Sweepr`** scheme (customer app) or **`CleanWithSweepr`** scheme
  (cleaner app) and an iOS 26 simulator. ⌘R runs, ⌘B builds.
- ⌘U runs that app's smoke tests (`SweeprAppTests` / `CleanWithSweeprAppTests`,
  unhosted logic tests) **plus** the shared `SweeprKitTests` package suite —
  both schemes include SweeprKitTests in their Test action.
- **Signing:** the project deliberately ships with no `DEVELOPMENT_TEAM`.
  Simulator builds work as-is. For a device or archive, select the target →
  Signing & Capabilities → choose your team (signing style is already
  Automatic). The committed entitlements (push, associated domains) also
  require those capabilities on your App ID for device builds.
- The Xcode **app targets are thin shells**: each compiles one
  `Darwin/Sources/*AppShell.swift` file and bundles Info.plist, the icon asset
  catalog, entitlements, and `PrivacyInfo.xcprivacy`. All real app code —
  including the `@main` entry point — lives in the SwiftPM packages, so the
  Verify harness and (later) SKIP keep working from the same sources.

## The modules

```
apps/ios/
├── Sweepr.xcworkspace         entry point — wraps SweeprApps.xcodeproj
├── SweeprApps.xcodeproj       both app targets + both unit-test targets
│                              (project.pbxproj is XML plist; Xcode rewrites
│                              it to OpenStep format on first save — normal)
├── SweeprKit/                 shared Swift package (models, networking, auth, theme, UI)
│   ├── Package.swift          swift-tools 6.0, iOS 26
│   ├── Skip.env               IPHONEOS_DEPLOYMENT_TARGET = 26.0
│   └── Sources/SweeprKit/
│       ├── Models/            Booking, Address, Cleaner, Quote, Membership,
│       │                      SmartEntryAccess, DayOfServiceStatus, Job, Money,
│       │                      BookingStatus (mirrors lib/statusMachine.ts);
│       │                      CustomerModels (CurrentUser, ServicePackage, HomeType,
│       │                      QuoteRequest/Response, Coupon, MembershipInfo,
│       │                      SmartEntryStatus, AccessMethod, booking-access) + MockData
│       ├── Networking/        SweeprAPI (async/await URLSession, Bearer auth)
│       ├── Auth/              AuthTokenProvider protocol (Clerk bridge point)
│       ├── State/             SessionStore + BookingStore (@Observable, loading states)
│       ├── Theme/             SweeprTheme design tokens (seafoam / warm graphite)
│       ├── UI/                SweeprButton/Card/Badge/SkeletonBlock, SweeprPatterns
│       │                      (SectionTitle, QuickAction, StatTile, ChoiceRow,
│       │                      StatusTimeline), Haptics, SweeprToast
│       └── Skip/skip.yml      SKIP transpile marker
│
├── Sweepr/                    CUSTOMER app — "Sweepr" (com.getsweepr.customer)
│   ├── Package.swift          depends on ../SweeprKit
│   ├── Skip.env               bundle id, version, Clerk pk, API base
│   ├── Sweepr.entitlements    push + associated domains
│   ├── Darwin/                Xcode app-target bundle artifacts
│   │   ├── Info.plist         iOS app metadata + usage strings
│   │   ├── PrivacyInfo.xcprivacy  privacy manifest (app-bundle root)
│   │   ├── Assets.xcassets    AppIcon (1024 single-size + dark + tinted)
│   │   ├── Sources/           SweeprAppShell.swift (thin target shell)
│   │   └── Tests/             SweeprAppTests.swift (app-level smoke tests)
│   └── Sources/Sweepr/
│       ├── SweeprApp.swift    @main
│       ├── RootView.swift     TabView: Home · Book · Bookings · Account (+ toast)
│       ├── Support/           AppEnvironment (SweeprAPI + SessionStore +
│       │                      BookingStore + ToastCenter)
│       ├── Screens/           Home (greeting/hero/quick-actions/promo),
│       │                      BookFlow (7-step wizard + server quote),
│       │                      Bookings (segmented + swipe-cancel),
│       │                      BookingDetail (timeline, tip, review, access),
│       │                      Membership (Sweepr+ join/manage),
│       │                      SmartEntry (access-method + $5 paywall),
│       │                      LiveTracking (native MapKit), Account
│       └── Skip/skip.yml
│
└── CleanWithSweepr/           CLEANER app — "Clean with Sweepr" (com.getsweepr.cleaner)
    ├── Package.swift          depends on ../SweeprKit
    ├── Skip.env
    ├── CleanWithSweepr.entitlements
    ├── Darwin/                Info.plist, PrivacyInfo.xcprivacy,
    │                          Assets.xcassets (AppIcon), Sources/, Tests/
    └── Sources/CleanWithSweepr/
        ├── CleanWithSweeprApp.swift   @main
        ├── RootView.swift     TabView: Jobs · Route · Earnings · Account
        ├── Support/           AppEnvironment
        └── Screens/           Jobs, JobDetail (day-of-service: check-in +
                               Smart Entry reveal-unlock), Route (map),
                               Earnings, Account
```

Both apps depend on `SweeprKit` via a local SwiftPM path dependency, so models,
the API client, auth, the theme, and shared components are written **once**.

## SKIP status (Android) — paused, deliberately easy to re-enable

The SKIP dependencies and the `skipstone` build plugin are **removed from all
three `Package.swift` manifests** so that a hand-authored, stock-Xcode build of
the iOS apps cannot be broken by transpilation: with the plugin attached,
skipstone runs on every build of those targets and an untranspilable construct
fails the *iOS* build too, plus first-open requires network resolution of four
remote packages and a plugin-trust prompt. None of the Swift sources import a
Skip module, so removal changed no code.

What was kept for reintroduction:
- `Skip/skip.yml` markers and `Skip.env` files are untouched.
- The code still stays inside the SwiftUI/Foundation subset
  SkipUI/SkipFoundation/SkipModel support (MapKit usage is the one
  `skip.yml`-declared divergence).
- Each `Package.swift` carries a comment block with the exact dependency /
  product / plugin lines to restore. After restoring, run `skip verify` on a
  Mac to pin the SKIP release train, then `skip export` for the Android build.

## Design system

`SweeprKit/Theme/SweeprTheme.swift` ports `packages/config/tailwind.ts`:
seafoam brand (`#0f766e` / `#14b8a6`), charcoal `#1c1a17`, and the deliberate
"warm graphite" (no blue) dark mode. Radii, spacing, and fonts are tokenized.
`Color(light:dark:)` gives theme-aware colors that map to Compose's dark-theme
check on Android.

## Backend integration

`SweeprAPI` (actor) talks to the Hono API at `https://api.getsweepr.com` with
async/await `URLSession` and a `Bearer` token from an injected
`AuthTokenProvider`. Wired endpoints:

- Customer: `GET /auth/me`, `GET /bookings`, `GET /bookings/:id`,
  `POST /bookings/quote`, `POST /bookings`, `POST /bookings/:id/status` (cancel),
  `GET /coupons/mine`, `GET /membership`, `POST /membership/checkout|cancel|resume`,
  `GET /smart-entry/status`, `GET/PUT /smart-entry/booking/:id`.
- Cleaner (day-of-service): `GET /cleaner-dashboard/jobs`,
  `GET /day-of-service/:id`, `GET /cleaner-dashboard/earnings`.

**Request bodies are camelCase** — the Hono zod schemas validate camelCase
(`serviceType`, `addOnKeys`, `cleaningLevel`, `deviceId`…), so the JSON encoder
does **not** snake_case-convert; the decoder still uses `convertFromSnakeCase`
because some responses (e.g. `booking_access_authorizations` columns) are
snake_case. Membership `interval` crosses the wire as `"month"`/`"year"`.
Money crosses the wire as **integer cents** (`Money`) exactly like the DB; the
client never computes totals — `POST /bookings/quote` is authoritative. Every
screen falls back to `SweeprMock` data when the network/Clerk session is
unavailable, so the UI is coherent in previews and offline.

State lives in two shared `@Observable` stores (SweeprKit `State/`): `SessionStore`
(auth phase + `CurrentUser`) and `BookingStore` (bookings + `LoadState` +
pull-to-refresh). `ToastCenter` drives `SweeprToast`. Key actions fire
`SweeprHaptics`.

### Auth (Clerk) — the one TODO to finish

`AuthTokenProvider` is a protocol so SweeprKit stays SDK-free and transpilable.
Each app currently injects `AnonymousTokenProvider`. To go live, add a
`ClerkTokenProvider` in each app target that returns
`Clerk.shared.session?.getToken()` (primary application, `clerk.getsweepr.com`).
Only the publishable key (`pk_…`, in `Skip.env`) ever lives in source.

## iOS 26 configuration

The apps target the **iOS 26 SDK (Xcode 26+)** and use iOS 26-era SwiftUI.

- **Deployment floor is 26.0 everywhere it's declared**, kept in lockstep so
  the SwiftPM and Xcode builds agree: `Package.swift`
  (`platforms: [.iOS("26.0")]` — the string form, so pre-6.2 Swift toolchains
  on Linux can still parse the manifest; SweeprKit also `.macOS("15.0")` for
  host tests), `Skip.env` (`IPHONEOS_DEPLOYMENT_TARGET = 26.0`),
  `Darwin/Info.plist` (`MinimumOSVersion = 26.0`), and the Xcode project
  (`IPHONEOS_DEPLOYMENT_TARGET = 26.0`, `SWIFT_VERSION = 6.0`).
- **`swift-tools-version` is 6.0.**
- **Modern SwiftUI adopted (kept inside the SKIP-supported subset):** `NavigationStack` +
  `navigationDestination`, `.refreshable`, `.scrollIndicators(.hidden)`,
  two-parameter `.onChange`, `.swipeActions`, `@Observable` / `@Bindable`
  (Observation, via SkipModel), and `@Environment(\.openURL)`.
- **Modern MapKit adopted:** `LiveTrackingScreen` and `RouteScreen` now use the
  iOS 17+ `Map(position:)` + `MapContentBuilder` API (`Annotation`), replacing the
  deprecated `Map(coordinateRegion:annotationItems:)` / `MapAnnotation`. A
  connecting `MapPolyline` between route stops is the next increment once
  `skip verify` confirms overlay support on Android.
- **Verify on-device / on a Mac (SKIP support is version-sensitive):** the
  `.graphical` `DatePicker` and `Stepper` in the booking wizard. Decision: keep
  both (iOS-26-supported, and the booking flow reads better with the graphical
  calendar); `.compact` / a plain `+`/`−` control are the SKIP-safe fallbacks if
  `skip verify` reports either isn't transpilable — swap is localized to
  `BookFlowScreen.scheduleStep` / `stepperCard`.

`swift-tools-version` (6.0) and `platforms` (`.iOS("26.0")`) are aligned across
**all three** `Package.swift` files (SweeprKit, Sweepr, CleanWithSweepr).

## Compile verification (`Verify/`)

`apps/ios/Verify/` is a checked-in Linux harness that compiler-verifies every
Swift file — SweeprKit, both app packages, **and the Xcode app-target shells +
app-level smoke tests from `Darwin/`** — against faithful SwiftUI/MapKit stub
signatures, then runs `SweeprKitTests` and the app smoke tests. No Mac
required: `bash apps/ios/Verify/verify.sh` with any Swift 6.1+ Linux
toolchain. See `Verify/README.md` for what it proves and its limits (runtime
SwiftUI/MapKit behaviour still needs Xcode).

## App icons

Committed under each app's `Darwin/Assets.xcassets/AppIcon.appiconset` in the
modern single-size format: one 1024×1024 opaque sRGB PNG per appearance
(any / dark / tinted). The mark is the brand broom + sparkles from
`Sweepr-logo.png`: customer = white mark on the seafoam gradient
(#14b8a6 → #0d9488); cleaner = mirrored seafoam mark (#2dc5ae) on warm
graphite — related family, instantly distinguishable. Regeneration is
scripted (deterministic PIL drawing); ask before hand-editing the PNGs.

## Finishing setup (on a Mac)

1. `open apps/ios/Sweepr.xcworkspace`, set your signing team on the four
   targets (see "Open, build, test" above).
2. Replace `AnonymousTokenProvider` with a real `ClerkTokenProvider` in each
   app target (the `TODO(Clerk)` in `SweeprApp.swift` /
   `CleanWithSweeprApp.swift`); publishable key lives in `Skip.env`.
3. Optional: drop `Sweepr-logo.png` into
   `SweeprKit/Sources/SweeprKit/Resources/` for in-app use.
4. Android, when wanted: restore the SKIP blocks in the three
   `Package.swift` files (see "SKIP status"), `brew install
   skiptools/skip/skip`, `skip checkup`, `skip verify`, then `skip export` /
   `skip launch --android`.

## Not wired into pnpm/Turbo

These are a separate native toolchain (SwiftPM + Gradle) and are intentionally
self-contained under `apps/ios/`. They are **not** part of the pnpm workspace or
Turbo build, and they don't touch the web apps.
