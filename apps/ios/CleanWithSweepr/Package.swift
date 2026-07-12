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

// Clean with Sweepr — cleaner app. SKIP dual-platform SwiftPM package. Shares
// SweeprKit with the customer app for models, networking, auth, and the design
// system.
//
// Targets the iOS 26 SDK (Xcode 26+), Swift 6 tools, SKIP 1.5.x line — kept in
// lockstep with SweeprKit + the customer app (see apps/ios/README.md).
let package = Package(
    name: "CleanWithSweepr",
    defaultLocalization: "en",
    platforms: [.iOS(.v26)],
    products: [
        .library(name: "CleanWithSweepr", targets: ["CleanWithSweepr"]),
    ],
    dependencies: [
        .package(path: "../SweeprKit"),
        .package(url: "https://source.skip.tools/skip.git", from: "1.5.0"),
        .package(url: "https://source.skip.tools/skip-ui.git", from: "1.5.0"),
        .package(url: "https://source.skip.tools/skip-foundation.git", from: "1.5.0"),
        .package(url: "https://source.skip.tools/skip-model.git", from: "1.5.0"),
    ],
    targets: [
        .target(
            name: "CleanWithSweepr",
            dependencies: [
                .product(name: "SweeprKit", package: "SweeprKit"),
                .product(name: "SkipUI", package: "skip-ui"),
                .product(name: "SkipFoundation", package: "skip-foundation"),
                .product(name: "SkipModel", package: "skip-model"),
            ],
            resources: [.process("Resources")],
            plugins: [.plugin(name: "skipstone", package: "skip")]
        ),
    ]
)
