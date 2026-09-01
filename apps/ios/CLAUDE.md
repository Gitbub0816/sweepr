<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# CLAUDE.md — apps/ios orientation

Native mobile apps for Sweepr. **Swift/SwiftUI, transpiled to Kotlin/Compose for
Android via SKIP (skip.tools).** Genuinely native on both platforms — not web
wrappers. Separate native toolchain: NOT part of pnpm/Turbo; do not wire it in.

## Layout
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
3. Booking statuses mirror `apps/api/src/lib/statusMachine.ts` (`BookingStatus`).
   The client only reads status; transitions happen server-side.
4. Backend is Hono at `https://api.getsweepr.com`; auth is Clerk primary
   application (`clerk.getsweepr.com`), Bearer token via `AuthTokenProvider`.
   Publishable keys (`pk_…`) only in source — never secrets.
5. Brand is "Sweepr" (never "Sweepr Pro"); dark mode is warm graphite, no blue.
6. Smart Entry access codes stay behind a deliberate reveal-unlock and are only
   fetched once the cleaner is checked in.

## SKIP constraints
Stay inside the SwiftUI/Foundation subset SkipUI/SkipFoundation/SkipModel
support. Platform-divergent APIs (e.g. MapKit → maps-compose) are declared in
each target's `Skip/skip.yml`. Run `skip verify` before shipping.

## Can't build here
Xcode/simulator and the `skip` CLI require a Mac. See README "Finishing setup"
for the `skip init` / `skip export` / `skip launch` commands that complete the
project on a developer machine.
