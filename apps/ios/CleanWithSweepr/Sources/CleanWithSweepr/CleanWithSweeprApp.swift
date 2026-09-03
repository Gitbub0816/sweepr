//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import SwiftUI
import SweeprKit

// Entry point for the cleaner "Clean with Sweepr" app.
@main
public struct CleanWithSweeprApp: App {
    @StateObject private var env: AppEnvironment
    @StateObject private var preferences = AppPreferences()

    public init() {
        _env = StateObject(wrappedValue: AppEnvironment())
    }

    public var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(env)
                .environmentObject(preferences)
                .tint(SweeprColor.brand)
                .preferredColorScheme(preferences.appearance.colorScheme)
        }
    }
}
