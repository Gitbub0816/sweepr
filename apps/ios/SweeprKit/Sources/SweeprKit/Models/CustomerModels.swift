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

// Additional customer-facing models mirroring the Hono API JSON shapes used by
// the web customer app (apps/customer). Money stays INTEGER CENTS on the wire;
// the client never computes totals. All decoding uses `convertFromSnakeCase`.

// MARK: - Current user (GET /auth/me → { user })

public struct CurrentUser: Codable, Hashable, Sendable, Identifiable {
    public let clerkId: String
    public let email: String?
    /// Canonical users.id (uuid) — null until the row exists.
    public let userId: String?
    public let firstName: String?
    public let lastName: String?
    public let role: String?

    public var id: String { clerkId }

    public var displayName: String {
        let name = [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        return name.isEmpty ? (email ?? "there") : name
    }

    public var greetingName: String {
        firstName ?? (email.map { String($0.prefix(while: { $0 != "@" })) } ?? "there")
    }
}

// MARK: - Service package catalogue (matches createSchema `serviceType`)

public enum ServicePackage: String, Codable, Hashable, Sendable, CaseIterable {
    case light, standard, deep, move_in_out, recurring
    case post_construction, vacation_rental

    public var displayName: String {
        switch self {
        case .light: return "Light clean"
        case .standard: return "Standard clean"
        case .deep: return "Deep clean"
        case .move_in_out: return "Move in / out"
        case .recurring: return "Recurring"
        case .post_construction: return "Post-construction"
        case .vacation_rental: return "Vacation rental"
        }
    }

    public var blurb: String {
        switch self {
        case .light: return "A quick tidy of the essentials."
        case .standard: return "Our everyday top-to-bottom clean."
        case .deep: return "Detailed, into-the-corners attention."
        case .move_in_out: return "Empty-home turnover clean."
        case .recurring: return "Set it and forget it on a cadence."
        case .post_construction: return "Dust and debris after a build."
        case .vacation_rental: return "Guest-ready turnaround."
        }
    }

    public var systemIcon: String {
        switch self {
        case .light: return "wind"
        case .standard: return "sparkles"
        case .deep: return "bubbles.and.sparkles.fill"
        case .move_in_out: return "shippingbox.fill"
        case .recurring: return "arrow.triangle.2.circlepath"
        case .post_construction: return "hammer.fill"
        case .vacation_rental: return "bed.double.fill"
        }
    }
}

public enum HomeType: String, Codable, Hashable, Sendable, CaseIterable {
    case studio, apartment, house, condo, townhouse, large_house, other

    public var displayName: String {
        switch self {
        case .studio: return "Studio"
        case .apartment: return "Apartment"
        case .house: return "House"
        case .condo: return "Condo"
        case .townhouse: return "Townhouse"
        case .large_house: return "Large house"
        case .other: return "Other"
        }
    }
}

// MARK: - Quote (POST /bookings/quote)

/// Request body — mirrors the subset of `createSchema` the quote endpoint reads.
public struct QuoteRequest: Codable, Hashable, Sendable {
    public var serviceType: ServicePackage
    public var bedrooms: Int
    public var bathrooms: Int
    public var sqft: Int
    public var homeType: HomeType
    public var hasPets: Bool
    public var heavyMess: Bool
    public var suppliesNeeded: Bool
    public var addOnKeys: [String]
    public var scheduledAt: String       // ISO-8601 string (server expects datetime)
    /// Optional 2-hour arrival window ("HH:MM", 24h) chosen from
    /// GET /cleaners/availability-slots. Omit entirely for an exact-time
    /// booking (backward compatible with the server's `.optional()` schema).
    public var arrivalWindowStart: String?
    public var arrivalWindowEnd: String?
    /// Minutes EAST of UTC (`TimeZone.current.secondsFromGMT() / 60`) — lets
    /// the server build the arrival instant from the customer's LOCAL date +
    /// window instead of the request's own UTC day, matching the web
    /// client's `-new Date().getTimezoneOffset()` convention.
    public var timezoneOffsetMinutes: Int?
    public var cleaningLevel: CleaningLevel
    public var addressId: String?
    public var notes: String?

    public init(
        serviceType: ServicePackage,
        bedrooms: Int,
        bathrooms: Int,
        sqft: Int,
        homeType: HomeType,
        hasPets: Bool = false,
        heavyMess: Bool = false,
        suppliesNeeded: Bool = false,
        addOnKeys: [String] = [],
        scheduledAt: String,
        arrivalWindowStart: String? = nil,
        arrivalWindowEnd: String? = nil,
        timezoneOffsetMinutes: Int? = nil,
        cleaningLevel: CleaningLevel = .refresh,
        addressId: String? = nil,
        notes: String? = nil
    ) {
        self.serviceType = serviceType
        self.bedrooms = bedrooms
        self.bathrooms = bathrooms
        self.sqft = sqft
        self.homeType = homeType
        self.hasPets = hasPets
        self.heavyMess = heavyMess
        self.suppliesNeeded = suppliesNeeded
        self.addOnKeys = addOnKeys
        self.scheduledAt = scheduledAt
        self.arrivalWindowStart = arrivalWindowStart
        self.arrivalWindowEnd = arrivalWindowEnd
        self.timezoneOffsetMinutes = timezoneOffsetMinutes
        self.cleaningLevel = cleaningLevel
        self.addressId = addressId
        self.notes = notes
    }
}

/// A single priced line, `{ label, cents }` from the pricing rule engine.
public struct QuoteLineItem: Codable, Hashable, Sendable, Identifiable {
    public let label: String
    public let cents: Int
    public var id: String { "\(label)-\(cents)" }
    public var money: Money { Money(cents: cents) }
}

/// The server-authoritative price snapshot returned by POST /bookings/quote.
public struct QuotePrice: Codable, Hashable, Sendable {
    public let totalPrice: Int
    public let levelSurchargeCents: Int
    public let emergencySurchargeCents: Int
    public let isEmergency: Bool
    public let lineItems: [QuoteLineItem]
    public let requiresCustomQuote: Bool

    public var total: Money { Money(cents: totalPrice) }
}

public struct QuoteResponse: Codable, Hashable, Sendable {
    public let total: Double            // dollars, convenience mirror of price.totalPrice
    public let price: QuotePrice
    public let engine: String?

    public var totalMoney: Money { price.total }
}

// MARK: - Calendar availability (GET /calendar/availability?from&to&lat&lng)
//
// Public/advisory: greys out blocked dates and shows adjustment/promo
// markers on the picker BEFORE the customer commits to a date. The server
// still re-checks at quote and booking-create time (`date_unavailable`) —
// this is UX, not the source of truth.

public struct CalendarDayInfo: Codable, Hashable, Sendable {
    public let date: String                  // "YYYY-MM-DD", customer's local calendar date
    public let blocked: Bool?
    public let adjustmentLabel: String?       // e.g. surge pricing note
    public let promoLabel: String?
}

/// GET /calendar/availability → { days: [...] }.
public struct CalendarAvailabilityResponse: Codable, Sendable {
    public let days: [CalendarDayInfo]
}

// MARK: - Arrival windows (GET /cleaners/availability-slots?date&zip)
//
// The real 2-hour arrival windows for ONE date, with per-window cleaner
// availability. Distinct from `AvailabilitySlot` (CleanerModels.swift), which
// is a cleaner's own recurring WEEKLY schedule — different shape, different
// endpoint, different domain concept.

public struct ArrivalWindow: Codable, Hashable, Sendable, Identifiable {
    public let start: String                  // "08:00"
    public let end: String                    // "10:00"
    public let label: String                  // "8:00 – 10:00 AM"
    public let available: Bool
    public var id: String { start }
}

/// GET /cleaners/availability-slots → { date, slots }.
public struct ArrivalWindowsResponse: Codable, Sendable {
    public let date: String?
    public let slots: [ArrivalWindow]
}

// MARK: - Coupons (GET /coupons/mine → { coupons })

public struct Coupon: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let code: String
    public let title: String?
    public let description: String?
    public let theme: String?
    /// Wire values (coupons.ts): "percent_off" | "amount_off" | "free_addon".
    public let kind: String?
    /// Percent (1–100) for percent_off; CENTS for amount_off.
    public let value: Double?
    public let addonKey: String?
    public let usesLeft: Int?
    public let minBookingTotalCents: Int?
    public let expiresAt: Date?

    public var displayValue: String {
        switch kind {
        case "percent_off": return value.map { "\(Int($0))% off" } ?? "Discount"
        case "amount_off": return value.map { Money(cents: Int($0)).dollarsString + " off" } ?? "Discount"
        case "free_addon": return "Free add-on"
        default: return title ?? "Offer"
        }
    }
}

// MARK: - Membership (GET /membership — the richer web shape)

public struct MembershipPricing: Codable, Hashable, Sendable {
    public let monthlyCents: Int?
    public let annualCents: Int?
    public let discountPercent: Int?
    public let monthlyDiscountCapCents: Int?

    public var monthly: Money? { monthlyCents.map { Money(cents: $0) } }
    public var annual: Money? { annualCents.map { Money(cents: $0) } }
}

public struct MembershipInfo: Codable, Hashable, Sendable {
    public let enabled: Bool
    public let member: Bool
    public let status: String?
    public let cancelAtPeriodEnd: Bool
    public let currentPeriodEnd: Date?
    public let pricing: MembershipPricing

    public var isActive: Bool { member }
}

public enum MembershipPlanInterval: String, Codable, Sendable {
    // Raw values are the wire tokens the API expects (`interval: "month" | "year"`).
    case monthly = "month"
    case annual = "year"
}

/// Request body for POST /membership/checkout.
public struct MembershipCheckoutRequest: Codable, Hashable, Sendable {
    public let interval: MembershipPlanInterval
    public init(interval: MembershipPlanInterval) { self.interval = interval }
}

/// POST /membership/checkout → { url } (Stripe Checkout).
public struct CheckoutSessionResponse: Codable, Hashable, Sendable {
    public let url: String?
}

// MARK: - Smart Entry (GET /smart-entry/status)

public struct SmartEntryStatus: Codable, Hashable, Sendable {
    public let enabled: Bool
    public let remoteUnlockEnabled: Bool
    public let manualCodeEnabled: Bool
    public let feeCents: Int
    public let includedWithMembership: Bool

    public var fee: Money { Money(cents: feeCents) }

    /// Copy for the paywall: "$5" or "Included with Sweepr+".
    public var feeLabel: String {
        includedWithMembership ? "Included with Sweepr+" : fee.dollarsString
    }
}

// MARK: - Booking access method (GET/PUT /smart-entry/booking/:id)

public enum AccessMethod: String, Codable, Hashable, Sendable, CaseIterable {
    case home              // someone home
    case keypad_code
    case smart_entry       // Seam-provisioned remote unlock ($5 / included)
    case lockbox
    case front_desk
    case other

    public var displayName: String {
        switch self {
        case .home: return "Someone's home"
        case .keypad_code: return "Keypad code"
        case .smart_entry: return "Smart Entry"
        case .lockbox: return "Lockbox"
        case .front_desk: return "Front desk / doorman"
        case .other: return "Other"
        }
    }

    public var systemIcon: String {
        switch self {
        case .home: return "person.fill"
        case .keypad_code: return "number"
        case .smart_entry: return "lock.open.rotation"
        case .lockbox: return "lock.square"
        case .front_desk: return "building.2.fill"
        case .other: return "ellipsis.circle"
        }
    }
}

/// GET /smart-entry/booking/:id → { authorization } (snake_case columns).
public struct BookingAccessAuthorization: Codable, Hashable, Sendable {
    public let accessMethod: String?
    public let lockDeviceId: String?
    public let customerAuthorizedAt: Date?
    public let accessStartsAt: Date?
    public let accessEndsAt: Date?
    public let revokedAt: Date?

    public var method: AccessMethod? {
        accessMethod.flatMap { AccessMethod(rawValue: $0) }
    }
    public var isSmartEntryProvisioned: Bool {
        method == .smart_entry && revokedAt == nil && customerAuthorizedAt != nil
    }
}

public struct BookingAccessResponse: Codable, Sendable {
    public let authorization: BookingAccessAuthorization?
}

/// PUT /smart-entry/booking/:id request body (mirrors `bookingAccessSchema`).
public struct SetBookingAccessRequest: Codable, Hashable, Sendable {
    public let method: AccessMethod
    public let deviceId: String?
    public let secretValue: String?
    public let authorize: Bool?

    public init(method: AccessMethod, deviceId: String? = nil, secretValue: String? = nil, authorize: Bool? = nil) {
        self.method = method
        self.deviceId = deviceId
        self.secretValue = secretValue
        self.authorize = authorize
    }
}

public struct SetBookingAccessResponse: Codable, Sendable {
    public let ok: Bool
    public let smartEntryFeeCents: Int?
    public var fee: Money? { smartEntryFeeCents.map { Money(cents: $0) } }
}

// MARK: - Account deletion (POST /account/delete — GDPR/CCPA right to erasure)

/// What a deletion removes. Mirrors the `scope` enum on `routes/account.ts`:
/// `account_and_data` hard-deletes the account and every dependent row (FK
/// cascade), `account` removes the login while retaining anonymized records.
public enum AccountDeletionScope: String, Codable, Hashable, Sendable {
    case account
    case accountAndData = "account_and_data"
}

/// Request body for `POST /account/delete`. The backend re-verifies identity by
/// requiring the caller to type their exact account email in `confirmEmail`
/// (camelCase — the API encoder does NOT snake_case request bodies).
public struct AccountDeletionRequest: Codable, Hashable, Sendable {
    public let confirmEmail: String
    public let scope: AccountDeletionScope
    public init(confirmEmail: String, scope: AccountDeletionScope = .accountAndData) {
        self.confirmEmail = confirmEmail
        self.scope = scope
    }
}

/// `POST /account/delete` → `{ ok, deleted }`.
public struct AccountDeletionResponse: Codable, Sendable {
    public let ok: Bool
    public let deleted: Bool?
}
