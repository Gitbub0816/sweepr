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
        // Native embedded payments (StripePaymentPresenter.swift) — the
        // customer app is the ONLY target that takes this dependency
        // (SweeprKit and CleanWithSweepr never link Stripe). Xcode resolves
        // this automatically the first time it opens the workspace.
        //
        // Version + product names verified against the package's real
        // manifest on 2026-09-03 (latest release 26.9.0). NOTE: `StripeCore`
        // is an INTERNAL target of this package, not a product — never
        // depend on it here; `StripePaymentSheet` re-exports the core
        // symbols (STPAPIClient etc.), and `StripePayments` is the product
        // that declares `StripeAPI.handleURLCallback(with:)`.
        .package(url: "https://github.com/stripe/stripe-ios-spm", from: "26.9.0"),
    ],
    targets: [
        .target(
            name: "Sweepr",
            dependencies: [
                .product(name: "SweeprKit", package: "SweeprKit"),
                .product(name: "StripePayments", package: "stripe-ios-spm"),
                .product(name: "StripePaymentSheet", package: "stripe-ios-spm"),
            ],
            resources: [.process("Resources")]
        ),
    ]
)
