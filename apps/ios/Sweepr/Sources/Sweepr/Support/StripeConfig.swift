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
    /// OWNER ACTION REQUIRED before shipping: replace with the real live
    /// publishable key (same value as the web apps' VITE_STRIPE_PUBLISHABLE_KEY
    /// GitHub secret — it's public-safe, just copy it in). Left as an obvious
    /// placeholder rather than guessed so a forgotten swap fails loudly (a
    /// real Stripe SDK call with this key errors immediately) instead of
    /// silently hitting the wrong account. See docs/MOBILE_LAUNCH_RUNBOOK.md.
    public static let publishableKey = "pk_live_REPLACE_WITH_REAL_STRIPE_PUBLISHABLE_KEY"

    /// Apple Pay is OFF (nil) until a real Apple Developer Merchant ID exists
    /// here AND the `com.apple.developer.in-app-payments` entitlement is
    /// added in Xcode (both are one-time owner setup — see
    /// docs/MOBILE_LAUNCH_RUNBOOK.md). `nil` degrades PaymentSheet to
    /// card-entry only, which already solves "leaves the app to pay" — Apple
    /// Pay is a fast-follow, not a blocker.
    public static let applePayMerchantId: String? = nil
}
