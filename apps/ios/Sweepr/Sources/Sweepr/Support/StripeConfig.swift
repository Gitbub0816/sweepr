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

// Stripe configuration for the customer app's embedded PaymentSheet. Only the
// PUBLISHABLE key belongs here (pk_…, never sk_… or whsec_…) — root CLAUDE.md
// "Secrets hygiene" explicitly allows publishable keys in source. This is the
// SAME value already used by the web apps (VITE_STRIPE_PUBLISHABLE_KEY).
public enum StripeConfig {
    /// The REAL live publishable key, extracted 2026-09-03 from the deployed
    /// customer web bundle (app.getsweepr.com — the same value the site ships
    /// to every visitor as VITE_STRIPE_PUBLISHABLE_KEY, so the app and web
    /// charge against the same Stripe account). Client-side-safe by design;
    /// only sk_…/whsec_… are secret. See docs/MOBILE_LAUNCH_RUNBOOK.md.
    public static let publishableKey = "pk_live_51TbQfnCssmqib76cfj6O4TYCLllJ2wGwCXO6206R5vut7Go6z47N0o08GvdRXGqsYA4vrz8ntBuTGYdI9cXlXjPI00XzobPsjE"

    /// Apple Pay is OFF (nil) until a real Apple Developer Merchant ID exists
    /// here AND the `com.apple.developer.in-app-payments` entitlement is
    /// added in Xcode (both are one-time owner setup — see
    /// docs/MOBILE_LAUNCH_RUNBOOK.md). `nil` degrades PaymentSheet to
    /// card-entry only, which already solves "leaves the app to pay" — Apple
    /// Pay is a fast-follow, not a blocker.
    public static let applePayMerchantId: String? = nil
}
