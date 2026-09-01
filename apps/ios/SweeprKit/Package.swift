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

// SweeprKit — the shared foundation for the Sweepr customer and cleaner apps.
// Every product target depends on this package for models, networking, auth,
// the design system, and shared UI.
//
// SKIP (Android transpilation) is currently NEUTRALIZED so a stock Xcode build
// of the iOS apps needs nothing beyond Apple SDKs: no remote dependencies, no
// build plugins, no plugin-trust prompt. No Swift source in this package
// imports a Skip module (the code stays inside the SkipUI-supported SwiftUI
// subset by convention), so re-enabling Android later is a manifest-only
// change — restore the dependency/product/plugin lines below and run
// `skip verify` to pin versions:
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
//   test deps:    .product(name: "SkipTest", package: "skip")
//   both targets: plugins: [.plugin(name: "skipstone", package: "skip")]
//
// The Skip/skip.yml markers and Skip.env files are kept in place for that
// reintroduction.
//
// Targets the iOS 26 SDK (Xcode 26+); macOS is declared for host-side tests.
// String platform versions (not `.v26`) so the manifest also parses on pre-6.2
// Swift toolchains (Linux CI/verify) — semantics are identical.
let package = Package(
    name: "SweeprKit",
    defaultLocalization: "en",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [
        .library(name: "SweeprKit", targets: ["SweeprKit"]),
    ],
    targets: [
        .target(
            name: "SweeprKit",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "SweeprKitTests",
            dependencies: ["SweeprKit"]
        ),
    ]
)
