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

// Shared preference vocabulary for both apps' Settings screens. Every case
// here is a REAL `users.preferred_language` value both `customerProfile.ts`
// and `cleanerDashboard.ts`'s `/settings` accept — never invent a language
// the server doesn't recognize.

public enum SweeprLanguage: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case en, es, vi, zhHans = "zh-Hans", zhHant = "zh-Hant", fil, ko, ar, pt, hi

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .en: return "English"
        case .es: return "Español"
        case .vi: return "Tiếng Việt"
        case .zhHans: return "简体中文"
        case .zhHant: return "繁體中文"
        case .fil: return "Filipino"
        case .ko: return "한국어"
        case .ar: return "العربية"
        case .pt: return "Português"
        case .hi: return "हिन्दी"
        }
    }
}

// MARK: - Customer profile (GET/PATCH /customer-profile)

/// The subset of `GET /customer-profile`'s `profile` object this app reads —
/// server response includes home-details fields too, but Settings only needs
/// these two.
public struct CustomerProfilePreferences: Codable, Hashable, Sendable {
    public let preferredLanguage: String?
    public let smsConsent: Bool

    public var language: SweeprLanguage? { preferredLanguage.flatMap(SweeprLanguage.init(rawValue:)) }
}

// MARK: - Cleaner settings (GET/PUT /cleaner-dashboard/settings)

/// Real, server-backed cleaner preferences — every field here is a genuine
/// column on `cleaners`/`users`, not a client-side fabrication.
public struct CleanerSettings: Codable, Hashable, Sendable {
    public var maxJobsPerDay: Int
    public var maxDistanceMiles: Double
    public var acceptsLastMinute: Bool
    public var notificationJobOffer: Bool
    public var notificationReminder: Bool
    public var notificationPayout: Bool
    public var notificationMarketing: Bool
    public var preferredServiceTypes: [String]
    public var acceptedJobTypes: [String]
    public var preferredLanguage: String?

    public var language: SweeprLanguage? { preferredLanguage.flatMap(SweeprLanguage.init(rawValue:)) }

    public init(
        maxJobsPerDay: Int = 3,
        maxDistanceMiles: Double = 25,
        acceptsLastMinute: Bool = true,
        notificationJobOffer: Bool = true,
        notificationReminder: Bool = true,
        notificationPayout: Bool = true,
        notificationMarketing: Bool = false,
        preferredServiceTypes: [String] = ["standard", "deep"],
        acceptedJobTypes: [String] = ["standard", "move_in_out", "vacation_rental"],
        preferredLanguage: String? = nil
    ) {
        self.maxJobsPerDay = maxJobsPerDay
        self.maxDistanceMiles = maxDistanceMiles
        self.acceptsLastMinute = acceptsLastMinute
        self.notificationJobOffer = notificationJobOffer
        self.notificationReminder = notificationReminder
        self.notificationPayout = notificationPayout
        self.notificationMarketing = notificationMarketing
        self.preferredServiceTypes = preferredServiceTypes
        self.acceptedJobTypes = acceptedJobTypes
        self.preferredLanguage = preferredLanguage
    }
}

/// The three canonical job types a cleaner can opt into (matches
/// `cleanerDashboard.ts`'s `JOB_TYPE_VALUES` — at least one is required).
public enum CleanerJobType: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case standard, move_in_out, vacation_rental

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .standard: return "Standard bookings"
        case .move_in_out: return "Move in / out"
        case .vacation_rental: return "Vacation rentals"
        }
    }
}
