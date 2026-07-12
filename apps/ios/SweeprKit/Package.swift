// swift-tools-version: 5.9
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

// SweeprKit — the shared, dual-platform (iOS + transpiled Android) foundation
// for the Sweepr customer and cleaner apps. Every product target depends on this
// package for models, networking, auth, the design system, and shared UI.
//
// SKIP: the `skip` and `skipstone` plugins transpile this Swift package into a
// Kotlin/Jetpack-Compose Gradle module. Keep every symbol here inside the subset
// of SwiftUI/Foundation that SkipUI/SkipFoundation/SkipModel support.
let package = Package(
    name: "SweeprKit",
    defaultLocalization: "en",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "SweeprKit", targets: ["SweeprKit"]),
    ],
    dependencies: [
        // Pin these to the versions your `skip` toolchain reports via `skip verify`.
        .package(url: "https://source.skip.tools/skip.git", from: "1.2.0"),
        .package(url: "https://source.skip.tools/skip-ui.git", from: "1.0.0"),
        .package(url: "https://source.skip.tools/skip-foundation.git", from: "1.0.0"),
        .package(url: "https://source.skip.tools/skip-model.git", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "SweeprKit",
            dependencies: [
                .product(name: "SkipUI", package: "skip-ui"),
                .product(name: "SkipFoundation", package: "skip-foundation"),
                .product(name: "SkipModel", package: "skip-model"),
            ],
            resources: [.process("Resources")],
            plugins: [.plugin(name: "skipstone", package: "skip")]
        ),
        .testTarget(
            name: "SweeprKitTests",
            dependencies: [
                "SweeprKit",
                .product(name: "SkipTest", package: "skip"),
            ],
            plugins: [.plugin(name: "skipstone", package: "skip")]
        ),
    ]
)
