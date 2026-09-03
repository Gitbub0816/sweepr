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
// StripePaymentSheet COMPILE-VERIFICATION SHIM — NOT a runtime Stripe SDK.
//
// Named `StripePaymentSheet` so `StripePaymentPresenter.swift` (customer app
// only — the cleaner app never takes payments) compiles UNCHANGED on a Linux
// host with no network access to the real `stripe-ios-spm` package. Declares
// the PaymentSheet construction/configuration surface that file uses — a
// subset that has been stable across Stripe iOS SDK releases: `Configuration`
// (merchantDisplayName / applePay / allowsDelayedPaymentMethods / returnURL),
// `ApplePayConfiguration(merchantId:merchantCountryCode:)`, the
// `PaymentSheetResult` outcome enum, and the client-secret initializer.
//
// Deliberately DOES NOT shim `present(from: UIViewController, completion:)`:
// that call needs a REAL UIViewController from a live UIApplication window
// scene, which only exists on Darwin. `StripePaymentPresenter.swift` keeps
// that one call behind `#if os(iOS)` (same pattern as `SweeprMaps.openInMaps`
// and `SweeprExternal.open`) — Linux Verify type-checks everything up to
// that boundary; the actual presentation still needs Xcode. See
// apps/ios/Verify/README.md.
// ============================================================================

public struct PaymentSheet: Sendable {
    public struct ApplePayConfiguration: Sendable {
        public let merchantId: String
        public let merchantCountryCode: String
        public init(merchantId: String, merchantCountryCode: String) {
            self.merchantId = merchantId
            self.merchantCountryCode = merchantCountryCode
        }
    }

    public struct Configuration: Sendable {
        public var merchantDisplayName: String = ""
        public var applePay: ApplePayConfiguration?
        /// Required `true` for any payment method that settles after
        /// presentation closes (bank redirects, etc.) — Stripe's own
        /// PaymentSheet integration guide sets this unconditionally.
        public var allowsDelayedPaymentMethods: Bool = false
        public var returnURL: String?
        public init() {}
    }

    /// The outcome `present(from:completion:)` hands back. `failed` carries
    /// the underlying `Error` in the real SDK.
    public enum PaymentSheetResult: Sendable {
        case completed
        case canceled
        case failed(error: PaymentSheetShimError)
    }

    public init(paymentIntentClientSecret: String, configuration: Configuration) {}
}

/// Stand-in `Error` type so `PaymentSheetResult.failed`'s payload
/// type-checks without pulling in a real `Error`-conforming Stripe type.
public struct PaymentSheetShimError: Error, Sendable {
    public var localizedDescription: String { "stripe payment sheet error (shim)" }
}
