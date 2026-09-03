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
// StripePayments (a real stripe-ios-spm product; `StripeCore` is not one) is
// the documented home of `StripeAPI.handleURLCallback(with:)`.
import StripePayments

// Entry point for the customer "Sweepr" app. On iOS this is the SwiftUI @main; on
// Android, SkipUI generates the equivalent Compose Activity from this same source.
@main
public struct SweeprApp: App {
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
                // The `sweepr://` scheme (Info.plist) is Stripe PaymentSheet's
                // `returnURL` target for bank-redirect / 3DS "return to app"
                // flows (`StripePaymentPresenter`) — nothing else uses it.
                .onOpenURL { url in
                    _ = StripeAPI.handleURLCallback(with: url)
                }
        }
    }
}
