#!/usr/bin/env bash
#
# Copyright © 2026–Present ClearKey Solutions, LLC.
# Proprietary & Confidential. Internal Use Only.
#
# ============================================================================
# Sweepr iOS — Linux compile-verification harness.
#
# Assembles a scratch SwiftPM package that combines the checked-in SwiftUI /
# MapKit compile shims (Verify/Shims) with the REAL SweeprKit + Sweepr +
# CleanWithSweepr sources, plus the Xcode app-target shells and app-level
# smoke tests from each app's Darwin/ folder, then:
#   (a) builds shims + SweeprKit + Sweepr (customer) app
#   (b) builds shims + SweeprKit + CleanWithSweepr (cleaner) app
#   (c) builds the Xcode app-target shells (Darwin/Sources)
#   (d) runs the SweeprKit unit tests + the app-level smoke tests
# Exits non-zero on ANY compile or test failure.
#
# This proves every .swift file type-checks against faithful API signatures
# (generics, labels, actor-isolation, Swift-6 sendability). It does NOT prove
# runtime SwiftUI/MapKit behaviour — that still needs Xcode (`skip verify`).
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_ROOT="$(cd "$HERE/.." && pwd)"
SCRATCH="${SCRATCH_DIR:-$HERE/.build-scratch}"

echo "==> Assembling scratch package at $SCRATCH"
rm -rf "$SCRATCH"
mkdir -p "$SCRATCH/Sources" "$SCRATCH/Tests"

# Shims (named SwiftUI / MapKit / StripePayments / StripePaymentSheet so app
# sources import them unchanged; both Stripe names are REAL stripe-ios-spm
# products — `StripeCore` is not one, so no shim may bear that name).
cp -R "$HERE/Shims/SwiftUI"             "$SCRATCH/Sources/SwiftUI"
cp -R "$HERE/Shims/MapKit"              "$SCRATCH/Sources/MapKit"
cp -R "$HERE/Shims/StripePayments"      "$SCRATCH/Sources/StripePayments"
cp -R "$HERE/Shims/StripePaymentSheet"  "$SCRATCH/Sources/StripePaymentSheet"

# Real product sources. Module names match the shipping packages so the
# Darwin/ shells and app tests compile with their real `import` lines.
cp -R "$IOS_ROOT/SweeprKit/Sources/SweeprKit" "$SCRATCH/Sources/SweeprKit"
cp -R "$IOS_ROOT/Sweepr/Sources/Sweepr" "$SCRATCH/Sources/Sweepr"
cp -R "$IOS_ROOT/CleanWithSweepr/Sources/CleanWithSweepr" "$SCRATCH/Sources/CleanWithSweepr"
cp -R "$IOS_ROOT/SweeprKit/Tests/SweeprKitTests" "$SCRATCH/Tests/SweeprKitTests"

# `@main` synthesizes a process entry point. On Linux `swift test` links every
# target into ONE runner executable, so the two app mains + the XCTest runner's
# main would collide at link. Entry-point synthesis is runtime-only — strip the
# attribute in the scratch copy; type-checking is unaffected. (Portable -i.)
sed -i.bak 's/^@main$//' \
    "$SCRATCH/Sources/Sweepr/SweeprApp.swift" \
    "$SCRATCH/Sources/CleanWithSweepr/CleanWithSweeprApp.swift"
rm -f "$SCRATCH/Sources/Sweepr/SweeprApp.swift.bak" \
      "$SCRATCH/Sources/CleanWithSweepr/CleanWithSweeprApp.swift.bak"

# Xcode app-target shells + app-level smoke tests (the thin Darwin targets the
# hand-authored SweeprApps.xcodeproj compiles on a Mac).
mkdir -p "$SCRATCH/Sources/AppShells" "$SCRATCH/Tests/AppShellTests"
cp "$IOS_ROOT/Sweepr/Darwin/Sources/"*.swift "$SCRATCH/Sources/AppShells/"
cp "$IOS_ROOT/CleanWithSweepr/Darwin/Sources/"*.swift "$SCRATCH/Sources/AppShells/"
cp "$IOS_ROOT/Sweepr/Darwin/Tests/"*.swift "$SCRATCH/Tests/AppShellTests/"
cp "$IOS_ROOT/CleanWithSweepr/Darwin/Tests/"*.swift "$SCRATCH/Tests/AppShellTests/"

# Drop resource + SKIP marker folders — the shim build type-checks code only.
find "$SCRATCH/Sources" -type d -name Resources -exec rm -rf {} + 2>/dev/null || true
find "$SCRATCH/Sources" -type d -name Skip -exec rm -rf {} + 2>/dev/null || true

cat > "$SCRATCH/Package.swift" <<'PKG'
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SweeprVerify",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "SwiftUI"),
        .target(name: "MapKit", dependencies: ["SwiftUI"]),
        .target(name: "StripePayments"),
        .target(name: "StripePaymentSheet", dependencies: ["StripePayments"]),
        .target(name: "SweeprKit", dependencies: ["SwiftUI", "MapKit"]),
        // Stripe deps ONLY here — the customer app is the only one that takes
        // payments; CleanWithSweepr and SweeprKit never link it.
        .target(name: "Sweepr", dependencies: ["SweeprKit", "SwiftUI", "MapKit", "StripePayments", "StripePaymentSheet"]),
        .target(name: "CleanWithSweepr", dependencies: ["SweeprKit", "SwiftUI", "MapKit"]),
        .target(name: "AppShells", dependencies: ["Sweepr", "CleanWithSweepr"]),
        .testTarget(name: "SweeprKitTests", dependencies: ["SweeprKit"]),
        .testTarget(name: "AppShellTests",
                    dependencies: ["Sweepr", "CleanWithSweepr", "SweeprKit", "SwiftUI"]),
    ]
)
PKG

cd "$SCRATCH"

echo "==> [1/4] Building shims + SweeprKit + Sweepr (customer) app"
swift build --target Sweepr

echo "==> [2/4] Building shims + SweeprKit + CleanWithSweepr (cleaner) app"
swift build --target CleanWithSweepr

echo "==> [3/4] Building the Xcode app-target shells (Darwin/Sources)"
swift build --target AppShells

echo "==> [4/4] Running SweeprKit unit tests + app-level smoke tests"
swift test

echo "==> VERIFY OK — all targets compiled and tests passed."
