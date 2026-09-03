//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
// ============================================================================
// StripeCore COMPILE-VERIFICATION SHIM — NOT a runtime Stripe SDK.
//
// Named `StripeCore` so `StripePaymentPresenter.swift` compiles UNCHANGED on
// a Linux host that has no network access to the real `stripe-ios-spm`
// package. Declares the long-stable symbols that file reads from this
// module: `STPAPIClient.shared.publishableKey`, which has been Stripe's
// documented way to set the SDK-wide publishable key since the very first
// modularized releases, and `StripeAPI.handleURLCallback(with:)`, the
// documented hook for completing bank-redirect / 3DS "return to app" flows
// via `PaymentSheet.Configuration.returnURL`. See apps/ios/Verify/README.md
// and apps/ios/Sweepr/Package.swift for the real dependency this stands in for.
// ============================================================================
import Foundation

public final class STPAPIClient: @unchecked Sendable {
    public static let shared = STPAPIClient()
    public var publishableKey: String?
    public init() {}
}

public enum StripeAPI {
    @discardableResult
    public static func handleURLCallback(with url: URL) -> Bool { true }
}
