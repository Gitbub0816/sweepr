//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import CleanWithSweepr

// The Xcode app target is a thin shell: all app code, including the executable
// entry point (`@main CleanWithSweeprApp`), lives in the local SwiftPM package
// at apps/ios/CleanWithSweepr. This target contributes only the bundle
// artifacts — Info.plist, app icons, entitlements, and the privacy manifest.
//
// Referencing `CleanWithSweeprApp.self` here forces the linker to load the
// package library's object file that carries the `main` symbol, so the
// executable always resolves its entry point from the package.
enum CleanWithSweeprAppShell {
    static let entryPoint: Any.Type = CleanWithSweeprApp.self
}
