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

// AuthBranding — the per-app voice of the shared auth flow. Both apps run the
// exact same ceremony; only the welcome story differs. Brand is "Sweepr"
// (never "Sweepr Pro").

public struct AuthBranding: Sendable {
    public struct Benefit: Identifiable, Sendable {
        public let id = UUID()
        public let icon: String
        public let title: String
        public let subtitle: String
        public init(icon: String, title: String, subtitle: String) {
            self.icon = icon
            self.title = title
            self.subtitle = subtitle
        }
    }

    public let appName: String
    public let heroIcon: String
    public let headline: String
    public let subheadline: String
    public let benefits: [Benefit]
    public let createAccountTitle: String
    public let signUpFootnote: String

    public init(
        appName: String, heroIcon: String, headline: String, subheadline: String,
        benefits: [Benefit], createAccountTitle: String, signUpFootnote: String
    ) {
        self.appName = appName
        self.heroIcon = heroIcon
        self.headline = headline
        self.subheadline = subheadline
        self.benefits = benefits
        self.createAccountTitle = createAccountTitle
        self.signUpFootnote = signUpFootnote
    }

    public static let customer = AuthBranding(
        appName: "Sweepr",
        heroIcon: "sparkles",
        headline: "A cleaner home,\nbooked in minutes",
        subheadline: "Background-checked professionals, transparent prices, and live arrival tracking.",
        benefits: [
            Benefit(icon: "checkmark.shield.fill", title: "Vetted cleaners",
                    subtitle: "Every pro passes a background check"),
            Benefit(icon: "tag.fill", title: "Exact pricing up front",
                    subtitle: "See your total before you confirm"),
            Benefit(icon: "location.fill", title: "Track the day of",
                    subtitle: "Follow your cleaner's arrival live"),
        ],
        createAccountTitle: "Create your account",
        signUpFootnote: "By creating an account you agree to Sweepr's Terms of Service and Privacy Policy."
    )

    public static let cleaner = AuthBranding(
        appName: "Sweepr",
        heroIcon: "briefcase.fill",
        headline: "Clean on your\nown schedule",
        subheadline: "Pick the jobs you want, get paid fast, and grow with Sweepr.",
        benefits: [
            Benefit(icon: "calendar.badge.checkmark", title: "You choose the jobs",
                    subtitle: "Accept only offers that fit your day"),
            Benefit(icon: "dollarsign.circle.fill", title: "Fast, clear payouts",
                    subtitle: "See exactly what each job pays"),
            Benefit(icon: "graduationcap.fill", title: "Free training",
                    subtitle: "Level up with Sweepr courses"),
        ],
        createAccountTitle: "Join as a cleaner",
        signUpFootnote: "By creating an account you agree to Sweepr's Cleaner Platform Agreement and Privacy Policy."
    )
}
