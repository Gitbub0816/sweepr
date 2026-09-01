// swift-tools-version: 6.0
//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import PackageDescription

// Sweepr — customer app library. The iOS app target lives in the hand-authored
// Xcode project at apps/ios/SweeprApps.xcodeproj (open apps/ios/Sweepr.xcworkspace),
// which links this `Sweepr` library product; `SweeprApp` (@main) lives here in
// the package so the app target itself stays a thin shell.
//
// SKIP (Android transpilation) is currently NEUTRALIZED so stock Xcode builds
// need nothing beyond Apple SDKs. No Swift source here imports a Skip module,
// so re-enabling Android later is a manifest-only change — restore:
//
//   dependencies: [
//       .package(url: "https://source.skip.tools/skip.git", from: "1.5.0"),
//       .package(url: "https://source.skip.tools/skip-ui.git", from: "1.5.0"),
//       .package(url: "https://source.skip.tools/skip-foundation.git", from: "1.5.0"),
//       .package(url: "https://source.skip.tools/skip-model.git", from: "1.5.0"),
//   ]
//   target deps:  .product(name: "SkipUI", package: "skip-ui"),
//                 .product(name: "SkipFoundation", package: "skip-foundation"),
//                 .product(name: "SkipModel", package: "skip-model")
//   target:       plugins: [.plugin(name: "skipstone", package: "skip")]
//
// Targets the iOS 26 SDK (Xcode 26+), Swift 6 tools — kept in lockstep with
// SweeprKit (see apps/ios/README.md).
let package = Package(
    name: "Sweepr",
    defaultLocalization: "en",
    // String platform version (not `.v26`) so the manifest also parses on
    // pre-6.2 Swift toolchains (Linux CI/verify) — semantics are identical.
    platforms: [.iOS("26.0")],
    products: [
        .library(name: "Sweepr", targets: ["Sweepr"]),
    ],
    dependencies: [
        .package(path: "../SweeprKit"),
    ],
    targets: [
        .target(
            name: "Sweepr",
            dependencies: [
                .product(name: "SweeprKit", package: "SweeprKit"),
            ],
            resources: [.process("Resources")]
        ),
    ]
)
