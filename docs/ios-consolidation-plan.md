<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# iOS consolidation & rebuild plan (recon + plan only)

Status: **reconnaissance complete, no code changed.** This doc maps the four
remote iOS branches, gives a per-branch keep/merge/delete verdict, fixes the
target structure, and lists the gaps to reach App Store quality for the two
native apps (customer **Sweepr**, cleaner **Clean with Sweepr**).

The iOS code does **not** exist on `main`. It lives only on four remote
branches. All four put the code at `apps/ios/` (never a top-level Swift
project). None are wired into pnpm/Turbo — the iOS toolchain is deliberately
separate (`apps/ios/CLAUDE.md`).

---

## 1. What each branch contains

All four branches share the same web monorepo history and diverge from `main`
by 617–625 commits (that count is web history, not iOS-specific). All were last
touched **2026-07-12**. All use the same architecture: a shared Swift package
`SweeprKit` + two app packages `Sweepr` (customer, `com.getsweepr.customer`) and
`CleanWithSweepr` (cleaner, `com.getsweepr.cleaner`), all **SwiftUI targeting
the iOS 26 SDK**, transpiled to Android via **SKIP (skip.tools)**.

| | `origin/ios-refine` | `origin/iOS` | `origin/ios-customer` | `origin/ios-cleaner` |
|---|---|---|---|---|
| HEAD | `b9274bd` | `bb970d2` | `98673bb` | `2eba862` |
| Last commit (UTC) | 07-12 20:29 | 07-12 21:05 | 07-12 17:35 | 07-12 17:27 |
| Swift bytes under `apps/ios` | **253 KB** | 253 KB | 161 KB | 123 KB |
| Both apps present | yes | yes | yes | yes |
| Customer screens | 8 | 8 | 8 | 6 (no Membership, no SmartEntry) |
| Cleaner screens | 5 | 5 | 5 | 5 |
| `SweeprKit` cleaner models/API hoisted | **yes** | yes | no (cleaner code missing) | no (lives in cleaner app's `Support/`) |
| `SweeprKit` State/ (BookingStore, SessionStore) | yes | yes | yes | **no** |
| `SweeprKit` UI (Haptics, Patterns, Toast) | yes | yes | yes | **partial (Components only)** |
| Verify harness (Linux compile-verify) | **yes** | yes | **no** | **no** |
| Relationship | base | `= ios-refine` + 4 noise commits | earlier customer-lead snapshot | earliest cleaner-lead snapshot |

### Key relationships
- **`iOS` is a strict superset of `ios-refine`.** `git merge-base ios-refine
  iOS` == `ios-refine`'s HEAD. `iOS` adds 4 commits: a Verify `.gitignore`
  tweak, a merge, and a "vendor agent skills" commit that is **reverted by its
  own tip**. The only `apps/ios` difference between them is **2 lines of
  `.gitignore`**. For app code they are identical.
- **`ios-refine` is the most complete, most recent iOS state**, and it is what
  the user named as the intended base. It is where `CleanerAPI` + `CleanerModels`
  were hoisted out of the cleaner app into shared `SweeprKit`, and where the
  Linux Verify harness was added.
- **`ios-customer`** is an earlier snapshot whose `SweeprKit` has no cleaner
  models/API (the cleaner app exists but shares nothing) — superseded by refine.
- **`ios-cleaner`** is the earliest/thinnest: cleaner API+models sit *inside*
  the cleaner app (`CleanWithSweepr/.../Support/`), `SweeprKit` lacks State/ and
  most shared UI, and the customer app is missing the Membership and Smart Entry
  screens. Fully superseded.

### Tech stack found (consistent across branches; richest on refine)
- **SwiftUI**, Swift 6 tools, `platforms: [.iOS(.v26)]`, portrait-only.
- **SKIP** deps (`skip`, `skip-ui`, `skip-foundation`, `skip-model` ~1.5.x) +
  `skipstone` plugin — SwiftUI is transpiled to Kotlin/Compose for Android.
- **Maps: Apple MapKit** (`Map(position:)`, `MapCameraPosition`,
  `MKCoordinateRegion`) in customer `LiveTrackingScreen` and cleaner
  `RouteScreen`. **No Mapbox anywhere. No turn-by-turn navigation** — ETAs are
  hardcoded placeholders (`8 + index*12` minutes).
- **Seam: referenced, not integrated.** `SmartEntryScreen` and the cleaner
  `revealAccess`/`setLock` API calls talk to the **backend**, which is the layer
  that talks to Seam. There is no Seam mobile SDK, no BLE/tap-to-unlock.
- **Auth: Clerk, abstracted but not wired.** `AuthTokenProvider` protocol +
  `Anonymous`/`Static` implementations only. There is an explicit
  `TODO(Clerk): add a ClerkTokenProvider … wrapping Clerk.shared.session?.getToken()`.
  No Clerk iOS SDK dependency (kept out of `SweeprKit` to stay SKIP-safe).
- **Networking: real.** `SweeprAPI` (actor, async/await, `URLSession`) against
  `https://api.getsweepr.com`, camelCase request bodies / snake_case-tolerant
  decoder — matches the Hono/zod contract. Customer surface: bookings, booking,
  membership(+checkout/cancel/resume), currentUser, quote, createBooking,
  cancelBooking, coupons, smartEntryStatus, bookingAccess/setBookingAccess,
  cleanerJobs, dayOfServiceStatus, earnings. `CleanerAPI`: acceptOffer,
  declineOffer, transition, revealAccess, setLock, checklist, payouts,
  setAvailability, setServiceAreaZip, verificationStatus, recordPhotoCaptured.
- **Info.plist keys already present** (refine): customer has
  `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`,
  `MinimumOSVersion 26.0`; cleaner adds `NSFaceIDUsageDescription` (biometric
  gate before revealing Smart Entry). No NFC keys yet.
- **Info.plist keys / entitlements MISSING** for the new goal: `NFCReaderUsage`
  + `com.apple.developer.nfc.readersession.formats` (Seam tap-to-unlock),
  `NSLocationAlwaysAndWhenInUseUsageDescription` + background-location /
  `UIBackgroundModes` (turn-by-turn while backgrounded), Mapbox download token
  build config, `PrivacyInfo.xcprivacy` (none of the four branches has one).

---

## 2. Screen inventory (what exists today, on refine)

**Customer `Sweepr` (8):** Home, Bookings, BookingDetail, BookFlow, Membership,
SmartEntry, LiveTracking, Account. Plus `RootView` (tab shell), `SweeprApp`.

**Cleaner `CleanWithSweepr` (5):** Jobs, JobDetail, Route, Earnings, Account.
Plus `RootView`, `CleanWithSweeprApp`.

**Shared `SweeprKit`:** Models (Models, CustomerModels, CleanerModels,
MockData), Networking (SweeprAPI, CleanerAPI), Auth (AuthTokenProvider), State
(BookingStore, SessionStore), Theme (SweeprTheme), UI (SweeprComponents,
SweeprPatterns, SweeprToast, Haptics). Tests: `SweeprKitTests`.

---

## 3. Per-branch verdict

| Branch | Verdict | Rationale / what to salvage |
|---|---|---|
| **`origin/ios-refine`** | **KEEP AS BASE** | Most complete + most recent app code, correct shared-package factoring (cleaner API/models hoisted into `SweeprKit`), and the only branch besides `iOS` with the Linux Verify harness. User confirmed it as the intended base. |
| **`origin/iOS`** | **MERGE-IN then DELETE** | App code is identical to refine except a 2-line Verify `.gitignore` addition; salvage that one hunk, otherwise redundant history (a vendor-skills commit reverted by its own tip). Do not base on it — the extra commits are noise. |
| **`origin/ios-customer`** | **DELETE** | Strictly older subset of refine; its `SweeprKit` predates the cleaner hoist. Nothing unique. |
| **`origin/ios-cleaner`** | **DELETE** | Earliest/thinnest; cleaner code was later hoisted into `SweeprKit` on refine, customer app is missing two screens. Nothing unique survives. |

Net: **base on `ios-refine`, cherry-pick the one `.gitignore` line from `iOS`,
delete the other three branches** once the base branch is cut. (Deletion is the
user's later step — not done here.)

---

## 4. Recommended target structure

Keep the established, sensible layout — **do not invent a new one.** Standardize
on a single location and a single Xcode **workspace** wrapping the three SwiftPM
packages already on refine:

```
apps/ios/
  Sweepr.xcworkspace            # NEW: one workspace, two app schemes
  SweeprKit/                    # shared package (models, API, auth, theme, UI, state)
  Sweepr/                       # customer app  (com.getsweepr.customer)
  CleanWithSweepr/              # cleaner app   (com.getsweepr.cleaner)
  Verify/                       # Linux compile-verify harness (keep, extend)
  CLAUDE.md  README.md
```

Two app targets/schemes — `Sweepr` and `CleanWithSweepr` — over the shared
`SweeprKit`. This matches what the branches already establish and the root
`CLAUDE.md`/`deploy.yml` naming (`Sweepr` customer, `CleanWithSweepr` cleaner).

### The one strategic decision to resolve first: SKIP vs native SDKs
The current code is **SKIP dual-platform (iOS + Android)**. The new goal —
**Mapbox Navigation SDK** (3D turn-by-turn) and **Seam mobile SDK**
(tap-to-unlock) — are **iOS-native binary xcframeworks that SKIP cannot
transpile.** These are mutually exclusive as written. Options, to put to the
user before rebuild:
- **(A) iOS-native-first (recommended for App Store quality now).** Drop SKIP
  from the two map/lock-critical paths (or entirely) and build pure native
  SwiftUI. Fastest path to a world-class iOS app; Android becomes a later,
  separate effort. `SweeprKit`'s networking/models stay pure Swift and reusable.
- **(B) Keep SKIP for shared logic, isolate native SDKs behind
  `#if os(iOS)` / `#if SKIP`** so Mapbox/Seam/Clerk-iOS compile only on Apple
  platforms and Android gets a fallback (e.g. maps-compose + Seam Android SDK).
  More work, preserves cross-platform, risks App Store polish slipping.

Recommendation: **(A)** for the stated "App Store world-class" goal, keeping
`SweeprKit` SKIP-clean so Android remains reopenable later. Confirm with user.

---

## 5. Gap list to App Store readiness (per app)

### Both apps
- **Clerk auth (real).** Add a `ClerkTokenProvider: AuthTokenProvider` in each
  app target wrapping the Clerk iOS SDK (`Clerk.shared.session?.getToken()`),
  with sign-in/sign-up/verify UI. Customer+cleaner share the **primary** Clerk
  application (`clerk.getsweepr.com`); publishable `pk_…` in build config only.
  Note the four-app migration in root `CLAUDE.md` — confirm which Clerk app each
  iOS binary points at (target likely: customer→app, cleaner→clean instances).
- **`PrivacyInfo.xcprivacy`** privacy manifest — **absent on all branches.**
  Required: declare data types collected (location, photos, name/email/coarse
  identifiers), tracking = none, and required-reason API usage
  (UserDefaults, file timestamps). App Store now rejects without it.
- **App Store metadata:** name, subtitle, keywords, description, support/privacy
  URLs (legal.getsweepr.com), category (customer: Lifestyle; cleaner: Business),
  age rating, screenshots (6.7"/6.9" + iPad if supported), app icon set.
- **API client hardening:** token refresh on 401, retry/backoff, offline empty
  states, real error surfacing (currently `SweeprAPIError` exists but UIs use
  mock/placeholder data in several screens).
- **Design-system completeness:** the warm-graphite dark theme + haptics exist;
  audit against `@sweepr/ui` parity and the `sweepr-brand` skill (no "Sweepr
  Pro", no blue-gray, no em dashes in copy).

### Customer `Sweepr`
- **LiveTracking:** replace MapKit placeholder + hardcoded ETA with real cleaner
  position (backend live location) and a real route/ETA. If Mapbox is adopted,
  this becomes a Mapbox map; otherwise MapKit ETA via `MKDirections`.
- **BookFlow:** verify it mirrors the web booking wizard (package / cleaning
  level / add-ons, server-authoritative quote via `quote()` — never client
  math). This is the revenue path; needs the most polish.
- **Smart Entry:** the customer authorizes; ensure the $5 fee / Sweepr+ free
  logic is server-driven and the reveal-unlock is gated.
- **Push notifications** (booking status, cleaner en route) — APNs entitlement +
  registration; none present.

### Cleaner `CleanWithSweepr`
- **Route/turn-by-turn:** the flagship new capability. Integrate **Mapbox
  Navigation SDK** — multi-stop day route from `cleanerJobs()`, 3D guidance,
  voice, off-route reroute. Integration points: `RouteScreen` (map + stop list),
  a new `NavigationScreen`, and a location publisher feeding the customer's live
  tracking. Needs `UIBackgroundModes: location`, always-location plist string,
  Mapbox secret download token in `.netrc`/build config.
- **Seam tap-to-unlock:** integrate **Seam mobile SDK**. Flow: cleaner checks in
  → biometric gate (Face ID key already present) → app fetches a time-boxed Seam
  access grant (backend already has `revealAccess`/`setLock`) → SDK performs the
  BLE/NFC unlock on-device. Needs `NFCReaderUsageDescription` +
  NFC/BLE entitlements, and a `SeamAccessProvider` in the cleaner target. Keep
  access codes behind the deliberate reveal (root convention, `apps/ios/CLAUDE.md`
  rule 6): only fetch once checked in.
- **Photo capture** (before/after, required for check-in/out): wire real camera
  + upload to R2 via backend; `recordPhotoCaptured` exists but capture UI is
  stubbed.

### App Store Review Guideline risks to pre-empt
- **5.1.1 / privacy:** location "always" + background must be clearly justified
  in-app (cleaner routing) or Apple rejects; provide a purpose screen.
- **2.5.x / SDKs:** Mapbox & Seam binary SDKs must be current, and any required-
  reason APIs they use must appear in the privacy manifest.
- **3.1.1 IAP:** membership/Sweepr+ is a **physical-service** subscription billed
  via Stripe → **not** subject to IAP (services rendered in the real world).
  Keep the checkout as web/Stripe (`startMembershipCheckout` returns a URL);
  do **not** present it as digital content. Document this for review notes.
- **4.0 design / 2.1 completeness:** no placeholder/mock data at submission —
  every screen currently on mock data must hit the real API.
- **1.5 support URL / privacy policy URL:** must resolve (legal.getsweepr.com).
- **NFC/BLE unlock:** ensure entitlements match capabilities and the unlock only
  works for the authorized, checked-in cleaner (abuse story mirrors backend).

---

## 6. Linux compile-verification (no Xcode) — the existing pattern

**The pattern already exists on `ios-refine` / `iOS`: `apps/ios/Verify/`.** Use
and extend it; do not invent a new approach.

`Verify/verify.sh` assembles a throwaway SwiftPM package that combines
hand-written, **signature-faithful shims** named `SwiftUI` and `MapKit`
(`Verify/Shims/…`) with the **real** `SweeprKit` + both app sources, then on a
plain Linux Swift 6 toolchain: builds shims+SweeprKit+customer, builds
shims+SweeprKit+cleaner, runs `SweeprKitTests`. Non-zero on any compile/test
failure. It strips `Resources/` and `Skip/` folders (type-checks code only).
`UIKit`/`LocalAuthentication` are behind `#if os(iOS)`/`#if canImport` so they
compile out on Linux.

What it proves: every `.swift` parses & type-checks against faithful signatures,
generics/labels/overloads resolve, Swift-6 strict-concurrency holds (shim `View`
is `@MainActor` like the SDK). What it can NOT prove: runtime SwiftUI/MapKit
behaviour, SKIP transpilation, real SDK edge behaviour. Xcode + `skip verify`
remain the runtime/transpile gate (the user's Mac step).

**Extension needed for the rebuild:** add shims for the new APIs we introduce —
a `MapboxNavigation`/`MapboxMaps` shim, a `Seam` shim, and a `Clerk` shim
(each declaring only the signatures we call) — so the new native code stays
Linux-verifiable. Keep every real SDK dependency behind `#if canImport(...)` in
app code so it compiles out under the shim build, exactly as UIKit does today.
Run `bash apps/ios/Verify/verify.sh` in CI on every iOS change.

---

## 7. Recommended execution sequence (sub-agent ownership)

Do this on a single new base branch cut from `origin/ios-refine`.

0. **Branch setup (human/lead):** cut base from `ios-refine`, cherry-pick the
   one `iOS` `.gitignore` hunk, resolve the SKIP-vs-native decision (§4).
1. **Consolidation agent:** create `apps/ios/Sweepr.xcworkspace` wiring the three
   packages + two schemes; confirm Verify still green; write App Store target
   metadata skeleton. No behavior change.
2. **Auth agent:** real `ClerkTokenProvider` per app + sign-in/up/verify flows;
   add a `Clerk` shim to Verify. Owns Clerk-app pointing per binary.
3. **API/data agent:** replace all mock/placeholder data paths with real
   `SweeprAPI`/`CleanerAPI` calls; 401-refresh, retry, error/empty states.
4. **Cleaner-navigation agent:** Mapbox Navigation SDK in `RouteScreen` +
   `NavigationScreen` + background location publisher; Mapbox shim; plist/
   entitlements/background-modes.
5. **Smart-entry agent:** Seam mobile SDK + biometric gate + NFC/BLE
   entitlements; Seam shim; checked-in-only reveal.
6. **Customer-experience agent:** BookFlow parity with web wizard (server-
   authoritative quote), LiveTracking real position/ETA, push notifications.
7. **Compliance agent:** `PrivacyInfo.xcprivacy` for both apps, full Info.plist
   usage strings, entitlements, App Store metadata + screenshots, review-notes
   (Stripe-not-IAP justification).
8. **Verify/CI agent:** extend `Verify/` shims for the new SDKs; keep the harness
   green; wire it into CI. (Runtime build + submission stay the user's Xcode
   step — this environment has no Xcode.)

Constraints throughout: ClearKey copyright header on every file; money is
integer cents on the wire, never client-computed; statuses read-only mirroring
`statusMachine.ts`; brand "Sweepr" (no "Sweepr Pro"), warm-graphite dark, no
blue; secrets never in source (only `pk_…`).
