//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import Foundation
// StripePaymentSheet re-exports the core Stripe symbols (STPAPIClient etc.) —
// Stripe's own PaymentSheet guide uses this single import; `StripeCore` is
// not a product of stripe-ios-spm and must never be imported directly.
import StripePaymentSheet
#if os(iOS)
import UIKit
#endif

public enum StripePaymentOutcome: Sendable {
    case completed
    case canceled
    case failed(String)
}

/// Presents Stripe's native PaymentSheet in-app for a booking payment or tip,
/// replacing the old hosted-page/Safari bounce-out (`SweeprExternal.open`).
/// The server remains fully authoritative — this only presents UI for a
/// client secret the server already created; capture/status still flow
/// through the existing `/payments/intent-status` and `/tips/booking/:id`
/// polling as a safety net after `.completed`.
@MainActor
public final class StripePaymentPresenter {
    public init() {}

    public func pay(clientSecret: String) async -> StripePaymentOutcome {
        STPAPIClient.shared.publishableKey = StripeConfig.publishableKey
        var configuration = PaymentSheet.Configuration()
        configuration.merchantDisplayName = "Sweepr"
        configuration.allowsDelayedPaymentMethods = true
        // Lets bank-redirect methods and 3DS "return to app" flows come back
        // via the `sweepr://` scheme registered in Info.plist, handled in
        // `SweeprApp`'s `.onOpenURL` with `StripeAPI.handleURLCallback(with:)`.
        configuration.returnURL = "sweepr://stripe-redirect"
        if let merchantId = StripeConfig.applePayMerchantId {
            configuration.applePay = .init(merchantId: merchantId, merchantCountryCode: "US")
        }
        let sheet = PaymentSheet(paymentIntentClientSecret: clientSecret, configuration: configuration)
        return await present(sheet)
    }

    #if os(iOS)
    private func present(_ sheet: PaymentSheet) async -> StripePaymentOutcome {
        guard let viewController = Self.topViewController() else {
            return .failed("Couldn't present the payment sheet.")
        }
        return await withCheckedContinuation { continuation in
            sheet.present(from: viewController) { result in
                switch result {
                case .completed: continuation.resume(returning: .completed)
                case .canceled: continuation.resume(returning: .canceled)
                case .failed(let error): continuation.resume(returning: .failed(error.localizedDescription))
                }
            }
        }
    }

    private static func topViewController() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
            return nil
        }
        var top = root
        while let presented = top.presentedViewController { top = presented }
        return top
    }
    #else
    private func present(_ sheet: PaymentSheet) async -> StripePaymentOutcome {
        .failed("Payments require iOS.")
    }
    #endif
}
