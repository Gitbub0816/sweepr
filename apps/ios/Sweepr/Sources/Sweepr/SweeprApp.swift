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

// Entry point for the customer "Sweepr" app. On iOS this is the SwiftUI @main; on
// Android, SkipUI generates the equivalent Compose Activity from this same source.
@main
public struct SweeprApp: App {
    @StateObject private var env: AppEnvironment

    public init() {
        _env = StateObject(wrappedValue: AppEnvironment())
    }

    public var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(env)
                .tint(SweeprColor.brand)
        }
    }
}
