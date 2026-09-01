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
# CleanWithSweepr sources, then:
#   (a) builds shims + SweeprKit + Sweepr (customer) app
#   (b) builds shims + SweeprKit + CleanWithSweepr (cleaner) app
#   (c) runs the SweeprKit unit tests
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

# Shims (named SwiftUI / MapKit so app sources import them unchanged).
cp -R "$HERE/Shims/SwiftUI" "$SCRATCH/Sources/SwiftUI"
cp -R "$HERE/Shims/MapKit"  "$SCRATCH/Sources/MapKit"

# Real product sources.
cp -R "$IOS_ROOT/SweeprKit/Sources/SweeprKit" "$SCRATCH/Sources/SweeprKit"
cp -R "$IOS_ROOT/Sweepr/Sources/Sweepr" "$SCRATCH/Sources/SweeprApp"
cp -R "$IOS_ROOT/CleanWithSweepr/Sources/CleanWithSweepr" "$SCRATCH/Sources/CleanApp"
cp -R "$IOS_ROOT/SweeprKit/Tests/SweeprKitTests" "$SCRATCH/Tests/SweeprKitTests"

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
        .target(name: "SweeprKit", dependencies: ["SwiftUI", "MapKit"]),
        .target(name: "SweeprApp", dependencies: ["SweeprKit", "SwiftUI", "MapKit"]),
        .target(name: "CleanApp", dependencies: ["SweeprKit", "SwiftUI", "MapKit"]),
        .testTarget(name: "SweeprKitTests", dependencies: ["SweeprKit"]),
    ]
)
PKG

cd "$SCRATCH"

echo "==> [1/3] Building shims + SweeprKit + Sweepr (customer) app"
swift build --target SweeprApp

echo "==> [2/3] Building shims + SweeprKit + CleanWithSweepr (cleaner) app"
swift build --target CleanApp

echo "==> [3/3] Running SweeprKit unit tests"
swift test

echo "==> VERIFY OK — all targets compiled and tests passed."
