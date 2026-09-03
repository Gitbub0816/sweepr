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
// StripePayments COMPILE-VERIFICATION SHIM — NOT a runtime Stripe SDK.
//
// Named `StripePayments` (a REAL product of stripe-ios-spm — verified against
// its manifest at 26.9.0; `StripeCore` is only an internal target there and
// must never be depended on) so the customer app's sources compile UNCHANGED
// on a Linux host with no access to the real package. Declares the two
// long-stable symbols our sources use from this module's surface:
//
// - `STPAPIClient.shared.publishableKey` — Stripe's documented way to set the
//   SDK-wide publishable key (declared in the internal StripeCore target in
//   the real SDK and re-exported through StripePayments/StripePaymentSheet;
//   the shim declares it here and StripePaymentSheet's shim `@_exported`s it,
//   mirroring that visibility).
// - `StripeAPI.handleURLCallback(with:)` — the documented hook (this module's
//   class reference) for completing bank-redirect / 3DS "return to app" flows
//   via `PaymentSheet.Configuration.returnURL` (`SweeprApp.onOpenURL`).
//
// See apps/ios/Verify/README.md and apps/ios/Sweepr/Package.swift for the
// real dependency this stands in for.
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
