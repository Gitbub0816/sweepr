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

// SweeprKit — the shared, dual-platform (iOS + transpiled Android) foundation
// for the Sweepr customer and cleaner apps. Every product target depends on this
// package for models, networking, auth, the design system, and shared UI.
//
// SKIP: the `skip` and `skipstone` plugins transpile this Swift package into a
// Kotlin/Jetpack-Compose Gradle module. Keep every symbol here inside the subset
// of SwiftUI/Foundation that SkipUI/SkipFoundation/SkipModel support.
//
// Targets the iOS 26 SDK (Xcode 26+). `swift-tools-version` is 6.0; SKIP's 1.5.x
// line is the first to support the Swift 6 language mode + iOS 26 SwiftUI surface
// we adopt (see apps/ios/README.md → "SKIP / iOS 26 configuration").
let package = Package(
    name: "SweeprKit",
    defaultLocalization: "en",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [
        .library(name: "SweeprKit", targets: ["SweeprKit"]),
    ],
    dependencies: [
        // Pin these to the versions your `skip` toolchain reports via `skip verify`.
        // Raised from the 1.2.0/1.0.0 foundation pins to the unified 1.5.x line,
        // the first SKIP release train we target for Swift 6 / iOS 26.
        .package(url: "https://source.skip.tools/skip.git", from: "1.5.0"),
        .package(url: "https://source.skip.tools/skip-ui.git", from: "1.5.0"),
        .package(url: "https://source.skip.tools/skip-foundation.git", from: "1.5.0"),
        .package(url: "https://source.skip.tools/skip-model.git", from: "1.5.0"),
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
