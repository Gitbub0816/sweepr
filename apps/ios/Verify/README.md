<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->
# Sweepr iOS — Linux compile-verification harness

`Verify/` type-checks **every** Swift file under `apps/ios/` (SweeprKit + both
apps) on a plain Linux Swift 6 toolchain — no Mac, no Xcode, no `skip` CLI. It
exists so structural regressions (wrong labels, bad generics, actor-isolation
mistakes, Swift-6 sendability violations, deprecated-API drift) are caught in CI
long before a developer opens Xcode.

## How to run

```bash
bash apps/ios/Verify/verify.sh
```

Exits non-zero on any compile or test failure. The scratch build lands in
`Verify/.build-scratch/` (git-ignored via the repo root rules; delete freely).

## What it does

`verify.sh` assembles a throwaway SwiftPM package that combines:

- **`Shims/SwiftUI/` + `Shims/MapKit/`** — hand-written stub targets *named*
  `SwiftUI` and `MapKit`, so the real app sources `import SwiftUI` / `import
  MapKit` **unchanged**. The stubs declare minimal, signature-faithful versions
  of every SwiftUI/MapKit API the app actually uses (the `View` protocol is
  `@MainActor` like the real SDK; `@State`/`@Binding`/`@Observable` interplay,
  `@ViewBuilder`, chainable modifiers returning `some View`, `TabView` /
  `NavigationStack` / `Map(position:)` + `MapContentBuilder`, etc.).
- **the REAL** `SweeprKit`, `Sweepr`, and `CleanWithSweepr` sources, the
  Xcode app-target shells (`<App>/Darwin/Sources/`), the `SweeprKitTests`,
  and the app-level smoke tests (`<App>/Darwin/Tests/`).

Then it (1) builds shims + SweeprKit + the customer app, (2) builds shims +
SweeprKit + the cleaner app, (3) builds the app-target shells, (4) runs the
SweeprKit unit tests + app smoke tests.

One munge besides dropping `Resources/`/`Skip/` folders: the `@main` attribute
is stripped from the two App entry files in the scratch copy — `swift test` on
Linux links every target into a single runner executable, so two synthesized
`main`s plus the XCTest runner's would collide at link. Entry-point synthesis
is runtime-only; type-checking is unaffected.

`UIKit` / `LocalAuthentication` are only imported behind `#if os(iOS)` /
`#if canImport(...)` in the app code, so they compile out on Linux and need no
shim.

## What it PROVES

- Every `.swift` file parses and type-checks against faithful API signatures.
- Generic constraints, argument labels, and overloads resolve correctly.
- Swift 6 strict-concurrency holds: main-actor isolation and `Sendable`
  conformances are real (the shim `View` is `@MainActor`, matching the SDK).
- SweeprKit's model/decoding logic passes its unit tests.

## What it CANNOT prove

- **Runtime SwiftUI/MapKit behaviour.** The shims have *no* rendering, layout,
  animation, or gesture behaviour — view bodies and content closures are
  type-checked but never evaluated. Visual correctness, navigation, and live
  data flow still require Xcode + the iOS simulator.
- **SKIP transpilation.** Whether a given construct lowers to Kotlin/Compose is
  decided by `skip verify` on a Mac, not here.
- **Real SDK edge behaviour** (e.g. exact `Map` camera semantics, `DatePicker`
  styles) — signatures match, behaviour does not.

Treat a green harness as "the code is structurally sound and Swift-6-clean";
treat Xcode + `skip verify` as the runtime/transpile gate.
