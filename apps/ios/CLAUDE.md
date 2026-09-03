<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# CLAUDE.md — apps/ios orientation

Native mobile apps for Sweepr. **Swift/SwiftUI, transpiled to Kotlin/Compose for
Android via SKIP (skip.tools).** Genuinely native on both platforms — not web
wrappers. Separate native toolchain: NOT part of pnpm/Turbo; do not wire it in.

## Layout
- `Sweepr.xcworkspace` / `SweeprApps.xcodeproj` — the Xcode entry point: two
  thin app targets (bundle artifacts + one shell source each) over the
  packages, plus two unhosted unit-test targets. All real code stays in the
  packages; keep it that way.
- `SweeprKit/` — shared Swift package: models, `SweeprAPI` client, auth
  abstraction, design tokens, shared UI. Both apps depend on it (DRY).
- `Sweepr/` — customer app ("Sweepr", `com.getsweepr.customer`).
- `CleanWithSweepr/` — cleaner app ("Clean with Sweepr", `com.getsweepr.cleaner`).

See `README.md` here for the full tree, SKIP approach, and build/transpile
commands.

## Rules that carry over from the web codebase
1. Every Swift file starts with the ClearKey `//` copyright header.
2. Money is **integer cents** on the wire (`Money`); never compute totals on the
   client — the server is authoritative (mirrors the web "never trust frontend
   pricing" rule).
3. Booking statuses mirror `apps/api/src/lib/statusMachine.ts` (`BookingStatus`),
   and the cleaner day-of-service flow mirrors `routes/dayOfService.ts`
   (`DayStatus`): discrete endpoints with server guards, GPS-verified arrival —
   a failed call NEVER advances the UI locally.
4. Backend is Hono at `https://api.getsweepr.com`. **Auth is the central
   broker**: native screens drive Clerk's REST API (`SweeprKit/Auth/ClerkAPI`,
   clerk.getsweepr.com proves WHO), then the API worker (`/mobile-auth/*`, the
   mobile BFF holding the broker service keys) exchanges that proof at the
   broker's `/v1/auth/native/exchange` for a per-app mobile session (60-day
   sliding, Keychain via `TokenVault`) — that session is what persists sign-in;
   `BrokerTokenProvider` transparently re-mints the short-lived API bearers.
   Publishable keys (`pk_…`) only in source — never secrets, never tokens in
   URLs or logs.
5. Brand is "Sweepr" (never "Sweepr Pro"); dark mode is warm graphite, no blue.
6. Smart Entry access codes stay behind a deliberate reveal-unlock and are only
   fetched once the cleaner is checked in.
7. **No mock data on production paths** (App Review 2.1): `SweeprMock` /
   `CleanerMock` are for previews/tests only; failures render retryable
   error/empty states and keep whatever real data is on screen.
8. Payments: the customer app (only — `Sweepr/Package.swift`, never SweeprKit
   or CleanWithSweepr) links the Stripe iOS SDK (`stripe-ios-spm`,
   `StripeCore`/`StripePaymentSheet`) and confirms in-app with native
   PaymentSheet (`Support/StripePaymentPresenter.swift`): mint the intent via
   the authed API, present PaymentSheet with the client secret, then poll
   `/payments/intent-status` (bookings) or `/tips/booking/:id` (tips) as a
   safety net alongside the `.completed` callback. `sweepr://stripe-redirect`
   (Info.plist + `SweeprApp.onOpenURL`) is PaymentSheet's return URL for
   redirect/3DS flows. Publishable key only (`pk_…`) in
   `Support/StripeConfig.swift` — never a secret key. Ops:
   docs/MOBILE_LAUNCH_RUNBOOK.md.

## SKIP constraints
SKIP is currently **neutralized** (deps + skipstone plugin removed from the
three `Package.swift` manifests; reintroduction blocks are commented there) so
stock Xcode builds cleanly. Still write code inside the SwiftUI/Foundation
subset SkipUI/SkipFoundation/SkipModel support so Android stays reopenable.
Platform-divergent APIs (e.g. MapKit → maps-compose) are declared in each
target's `Skip/skip.yml`. Run `skip verify` after re-enabling, before shipping
Android.

## Can't build here — but can compile-verify
Xcode/simulator require a Mac: `open apps/ios/Sweepr.xcworkspace`, schemes
`Sweepr` / `CleanWithSweepr` (see README "Open, build, test"; signing team is
set locally, never committed). On Linux, `bash apps/ios/Verify/verify.sh`
type-checks every Swift file (packages + Darwin shells + app tests) against
shims and runs the test suites — keep it green on every iOS change.
