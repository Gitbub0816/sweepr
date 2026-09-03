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

// Typed models mirroring the REAL Hono API wire shapes (field-audited against
// apps/api/src/routes — see each type's doc note for its source route). The
// booking endpoints return RAW snake_case DB rows (decoded via
// convertFromSnakeCase); money is INTEGER CENTS everywhere. Never do price
// math on the client; totals are computed server-side.

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

    /// The only customer-permitted transition is cancellation, and the server
    /// (`statusMachine.ts`) accepts it only from these states.
    public var isCustomerCancellable: Bool {
        switch self {
        case .draft, .quoted, .payment_pending, .booked, .matching, .offered_to_cleaner:
            return true
        default:
            return false
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

// MARK: - Day-of-service status (`bookings.day_status`)

/// The server-owned day-of-service machine (`routes/dayOfService.ts`):
/// en_route → arrived (GPS-verified, server flips it) → in_progress →
/// awaiting_checkout → completed. The client never sets this directly — each
/// transition is its own endpoint with its own guards.
public enum DayStatus: String, Codable, Hashable, Sendable {
    case en_route, arrived, in_progress, awaiting_checkout, completed
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DayStatus(rawValue: raw) ?? .unknown
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

// MARK: - Booking (raw row from GET /bookings, GET /bookings/:id, POST /bookings)
//
// The API returns `SELECT bookings.*` — snake_case columns, no nesting. The
// detail route additionally aliases the address join onto the row
// (address_line1/city/state/zip) and adds addon_keys + deep_clean_applied;
// those keys are simply absent on the list route, so they're all optional.

public struct Booking: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let status: BookingStatus
    public let dayStatus: DayStatus?
    public let cleanerId: String?
    public let addressId: String?
    public let serviceType: String          // the "package" — WHAT gets cleaned
    public let cleaningLevel: CleaningLevel?
    public let bedrooms: Int?
    public let bathrooms: Double?
    public let sqft: Int?
    public let homeType: String?
    public let scheduledAt: Date?
    public let durationMinutes: Int?
    /// Postgres TIME columns ("HH:MM:SS") — kept as strings.
    public let arrivalWindowStart: String?
    public let arrivalWindowEnd: String?

    // Money (integer cents, server-computed)
    public let basePrice: Int?
    public let addonsTotal: Int?
    public let serviceFee: Int?
    public let tax: Int?
    public let totalPrice: Int?
    public let cleaningLevelSurchargeCents: Int?
    public let smartEntryFeeCents: Int?
    public let sweeprPlusDiscountCents: Int?

    // Live-tracking position (present while the cleaner shares location)
    public let cleanerLat: Double?
    public let cleanerLng: Double?

    // Detail-route extras (absent on the list route)
    public let addressLine1: String?
    public let addressCity: String?
    public let addressState: String?
    public let addressZip: String?
    public let addonKeys: [String]?
    public let deepCleanApplied: Bool?

    public let notes: String?
    public let entryNotes: String?
    public let parkingNotes: String?
    public let accessMethod: String?
    public let createdAt: Date?

    public var packageDisplayName: String {
        serviceType
            .split(separator: "_")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    public var totalMoney: Money? { totalPrice.map { Money(cents: $0) } }

    /// One-line address when the detail route included the join.
    public var addressOneLine: String? {
        guard let line1 = addressLine1 else { return nil }
        let city = addressCity.map { ", \($0)" } ?? ""
        let zip = addressZip.map { " \($0)" } ?? ""
        return "\(line1)\(city)\(zip)"
    }

    /// A short "2 bd · 1 ba" summary for rows.
    public var homeSummary: String? {
        guard let bedrooms else { return nil }
        let ba = bathrooms.map { $0.truncatingRemainder(dividingBy: 1) == 0 ? String(Int($0)) : String($0) }
        return "\(bedrooms) bd" + (ba.map { " · \($0) ba" } ?? "")
    }
}

/// The privacy-gated cleaner summary on GET /bookings/:id — present only once
/// a cleaner is assigned, the status qualifies, and it's within 24h of the
/// appointment. camelCase on the wire.
public struct BookingCleanerSummary: Codable, Hashable, Sendable {
    public let displayName: String
    public let foundingMember: Bool?
    public let foundingMemberId: Int?

    public init(displayName: String, foundingMember: Bool? = nil, foundingMemberId: Int? = nil) {
        self.displayName = displayName
        self.foundingMember = foundingMember
        self.foundingMemberId = foundingMemberId
    }
}

/// GET /bookings/:id envelope: `{ booking, cleaner }`.
public struct BookingDetail: Sendable {
    public let booking: Booking
    public let cleaner: BookingCleanerSummary?

    public init(booking: Booking, cleaner: BookingCleanerSummary?) {
        self.booking = booking
        self.cleaner = cleaner
    }
}

// MARK: - Customer addresses (GET/POST /customer-profile/addresses)

/// camelCase, mapped server-side.
public struct CustomerAddress: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String?
    public let line1: String
    public let line2: String?
    public let city: String
    public let state: String
    public let zip: String
    public let lat: Double?
    public let lng: Double?
    public let isDefault: Bool?
    public let propertyType: String?

    public var oneLine: String {
        let unit = line2.map { " \($0)" } ?? ""
        return "\(line1)\(unit), \(city) \(zip)"
    }
}

/// POST /customer-profile/addresses body (state is the 2-letter code).
public struct CreateAddressRequest: Codable, Hashable, Sendable {
    public var street: String
    public var unit: String?
    public var city: String
    public var state: String
    public var zip: String
    public var label: String?
    public var makeDefault: Bool?

    public init(street: String, unit: String? = nil, city: String, state: String,
                zip: String, label: String? = nil, makeDefault: Bool? = nil) {
        self.street = street
        self.unit = unit
        self.city = city
        self.state = state
        self.zip = zip
        self.label = label
        self.makeDefault = makeDefault
    }
}

// MARK: - Membership (legacy compact shape kept for old call sites)

public struct Membership: Codable, Hashable, Sendable {
    public let active: Bool
    public let planName: String?
    public let renewsAt: Date?
    public let creditsCents: Int?
    public let discountPct: Int?
}
