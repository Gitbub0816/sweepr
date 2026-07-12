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

// Typed models mirroring the web app's key entities. These map onto the Hono API
// JSON shapes (api.getsweepr.com). Money is INTEGER CENTS on the wire — mirroring
// the DB convention — and is only converted to dollars for display via
// `Money.dollarsString`. Never do price math on the client; totals are computed
// server-side.

// MARK: - Money

/// A monetary amount stored as integer cents, matching the backend convention.
public struct Money: Codable, Hashable, Sendable {
    public let cents: Int
    public init(cents: Int) { self.cents = cents }

    public var dollars: Double { Double(cents) / 100.0 }

    /// e.g. 15900 -> "$159.00"
    public var dollarsString: String {
        let sign = cents < 0 ? "-" : ""
        let abs = Swift.abs(cents)
        return "\(sign)$\(abs / 100).\(String(format: "%02d", abs % 100))"
    }
}

// MARK: - Booking status

/// Mirrors `lib/statusMachine.ts`. The client only *reads* status; transitions
/// are validated and performed server-side.
public enum BookingStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case draft, quoted, payment_pending, booked, matching, offered_to_cleaner
    case cleaner_accepted, confirmed, cleaner_on_the_way, arrived, in_progress
    case completed_pending_review, completed
    case cancelled_by_customer, cancelled_by_cleaner, disputed, refunded

    /// Fallback for unknown/new server statuses so decoding never hard-fails.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = BookingStatus(rawValue: raw) ?? .draft
    }

    public var isActive: Bool {
        switch self {
        case .completed, .cancelled_by_customer, .cancelled_by_cleaner, .refunded:
            return false
        default:
            return true
        }
    }

    /// True once the cleaner is en route / on site — drives the live-tracking UI.
    public var isTrackable: Bool {
        switch self {
        case .cleaner_on_the_way, .arrived, .in_progress: return true
        default: return false
        }
    }

    public var displayLabel: String {
        switch self {
        case .draft: return "Draft"
        case .quoted: return "Quoted"
        case .payment_pending: return "Payment pending"
        case .booked: return "Booked"
        case .matching: return "Finding your cleaner"
        case .offered_to_cleaner: return "Offered"
        case .cleaner_accepted: return "Cleaner assigned"
        case .confirmed: return "Confirmed"
        case .cleaner_on_the_way: return "On the way"
        case .arrived: return "Arrived"
        case .in_progress: return "In progress"
        case .completed_pending_review: return "Wrapping up"
        case .completed: return "Completed"
        case .cancelled_by_customer: return "Cancelled"
        case .cancelled_by_cleaner: return "Cancelled by cleaner"
        case .disputed: return "Disputed"
        case .refunded: return "Refunded"
        }
    }
}

// MARK: - Cleaning level (HOW much labor — surcharge, never scope)

public enum CleaningLevel: String, Codable, Hashable, Sendable {
    case refresh, extra_attention, significant_attention

    public var displayLabel: String {
        switch self {
        case .refresh: return "Refresh"
        case .extra_attention: return "Extra attention"
        case .significant_attention: return "Significant attention"
        }
    }
}

// MARK: - Address

public struct Address: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let street: String
    public let unit: String?
    public let city: String?
    public let state: String?
    public let zip: String
    public let latitude: Double?
    public let longitude: Double?

    public var oneLine: String {
        let unitPart = unit.map { " \($0)" } ?? ""
        let cityPart = city.map { ", \($0)" } ?? ""
        return "\(street)\(unitPart)\(cityPart) \(zip)"
    }
}

// MARK: - Cleaner

public struct Cleaner: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let firstName: String
    public let lastName: String?
    public let avatarUrl: String?
    public let rating: Double?
    public let completedJobs: Int?
    /// Present only while a job is trackable — the cleaner's last-known position.
    public let latitude: Double?
    public let longitude: Double?

    public var displayName: String {
        if let l = lastName, let initial = l.first { return "\(firstName) \(initial)." }
        return firstName
    }
}

// MARK: - Quote (server-authoritative pricing snapshot)

public struct Quote: Codable, Hashable, Sendable {
    public let subtotal: Money
    public let levelSurcharge: Money
    public let addOnsTotal: Money
    public let discount: Money
    public let tax: Money
    public let total: Money
}

// MARK: - Booking

public struct Booking: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let status: BookingStatus
    public let serviceType: String          // the "package" — WHAT gets cleaned
    public let cleaningLevel: CleaningLevel?
    public let bedrooms: Int?
    public let bathrooms: Double?
    public let scheduledAt: Date?
    public let address: Address?
    public let cleaner: Cleaner?
    public let quote: Quote?
    public let addOns: [String]?

    public var packageDisplayName: String {
        serviceType
            .split(separator: "_")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}

// MARK: - Membership

public struct Membership: Codable, Hashable, Sendable {
    public let active: Bool
    public let planName: String?
    public let renewsAt: Date?
    public let creditsCents: Int?
    public let discountPct: Int?
}

// MARK: - Smart Entry access (reveal-unlock on the cleaner side)

public struct SmartEntryAccess: Codable, Hashable, Sendable {
    public enum Method: String, Codable, Sendable {
        case lockbox, smart_lock, doorman, garage_code, other
    }
    public let method: Method
    /// Sensitive: only returned by the API to a checked-in cleaner near check-in
    /// time. The UI keeps it hidden behind a deliberate reveal-unlock gesture.
    public let instructions: String?
    public let code: String?
    public let revealedAt: Date?
}

// MARK: - Day-of-service status (cleaner job lifecycle)

public struct DayOfServiceStatus: Codable, Hashable, Sendable {
    public let bookingId: String
    public let status: BookingStatus
    public let checkedInAt: Date?
    public let arrivedAt: Date?
    public let startedAt: Date?
    public let completedAt: Date?
    public let requiresBeforePhotos: Bool
    public let requiresAfterPhotos: Bool
    public let smartEntry: SmartEntryAccess?
}

// MARK: - Cleaner-facing job + earnings

public struct Job: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let booking: Booking
    public let payoutEstimate: Money?
    public let distanceMeters: Double?
}

public struct EarningsSummary: Codable, Hashable, Sendable {
    public let weekToDate: Money
    public let pendingPayout: Money
    public let lifetime: Money
    public let jobsThisWeek: Int
}
