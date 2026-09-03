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

// Cleaner-facing models — field-audited against the REAL routes:
// `cleanerDashboard.ts` (jobs/offers/earnings/availability/service-area),
// `dayOfService.ts` (the day-of-service machine + live status + photos), and
// `cleaners.ts` (onboarding progress). Rows arrive snake_case and are decoded
// via convertFromSnakeCase; money is integer cents unless noted.

// MARK: - Jobs list (GET /cleaner-dashboard/my-jobs → { jobs: [row] })

/// One flat row from my-jobs / available-offers. Offers (from
/// /available-offers) carry no status/day_status — `isOffer` is stamped
/// client-side by which endpoint produced the row.
public struct CleanerJob: Codable, Hashable, Identifiable, Sendable {
    public let id: String                    // booking id
    public let status: BookingStatus?
    public let dayStatus: DayStatus?
    public let serviceType: String
    public let scheduledAt: Date?
    public let totalPrice: Int?
    public let cleanerPayout: Int?           // cents, this cleaner's cut
    public let bedrooms: Int?
    public let bathrooms: Double?
    public let arrivalWindowStart: String?   // "HH:MM:SS"
    public let arrivalWindowEnd: String?
    public let addressCity: String?
    public let addressState: String?

    /// Stamped client-side: true when the row came from /available-offers.
    public var isOffer: Bool = false

    private enum CodingKeys: String, CodingKey {
        case id, status, dayStatus, serviceType, scheduledAt, totalPrice,
             cleanerPayout, bedrooms, bathrooms, arrivalWindowStart,
             arrivalWindowEnd, addressCity, addressState
    }

    public var packageDisplayName: String {
        serviceType.split(separator: "_")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    public var payoutMoney: Money? { cleanerPayout.map { Money(cents: $0) } }

    /// True once the cleaner is actively working the job (in-shift banner).
    public var isActiveShift: Bool {
        switch dayStatus {
        case .en_route, .arrived, .in_progress, .awaiting_checkout: return true
        default: return status?.isTrackable ?? false
        }
    }

    /// Area label — the full address is only ever revealed through
    /// start-route / the live endpoint, never on list rows.
    public var areaLabel: String {
        let city = addressCity ?? "Nearby"
        let state = addressState.map { ", \($0)" } ?? ""
        return "\(city)\(state)"
    }

    public var homeSummary: String {
        let bd = bedrooms.map { "\($0) bd" } ?? ""
        let ba = bathrooms.map { b in
            b.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(b)) ba" : "\(b) ba"
        } ?? ""
        return [bd, ba].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    public init(
        id: String, status: BookingStatus?, dayStatus: DayStatus?, serviceType: String,
        scheduledAt: Date?, totalPrice: Int?, cleanerPayout: Int?, bedrooms: Int?,
        bathrooms: Double?, arrivalWindowStart: String?, arrivalWindowEnd: String?,
        addressCity: String?, addressState: String?, isOffer: Bool = false
    ) {
        self.id = id
        self.status = status
        self.dayStatus = dayStatus
        self.serviceType = serviceType
        self.scheduledAt = scheduledAt
        self.totalPrice = totalPrice
        self.cleanerPayout = cleanerPayout
        self.bedrooms = bedrooms
        self.bathrooms = bathrooms
        self.arrivalWindowStart = arrivalWindowStart
        self.arrivalWindowEnd = arrivalWindowEnd
        self.addressCity = addressCity
        self.addressState = addressState
        self.isOffer = isOffer
    }
}

/// Segments shown on the Jobs screen. "Available" is the offers inbox.
public enum JobSegment: String, CaseIterable, Identifiable, Sendable {
    case today = "Today"
    case upcoming = "Upcoming"
    case available = "Available"
    public var id: String { rawValue }
}

// MARK: - Day-of-service transition responses (`routes/dayOfService.ts`)

/// POST /jobs/bookings/:id/start-route → the revealed service address.
public struct RevealedAddress: Codable, Hashable, Sendable {
    public let line1: String?
    public let city: String?
    public let state: String?
    public let zip: String?

    public var oneLine: String {
        [line1, city, zip].compactMap { $0 }.joined(separator: ", ")
    }
}

public struct StartRouteResponse: Codable, Sendable {
    public let ok: Bool
    public let dayStatus: DayStatus?
    public let address: RevealedAddress?
}

/// POST /jobs/bookings/:id/location — server flips arrived within 150 m.
public struct LocationPingResponse: Codable, Sendable {
    public let ok: Bool
    public let arrivalVerified: Bool?
    public let seatCheckedIn: Bool?
}

/// Legacy access code rows returned by start-clean (Smart Entry uses the
/// separate /cleaner reveal flow; these cover keypad/lockbox instructions).
public struct JobAccessCode: Codable, Hashable, Sendable {
    public let codeType: String?
    public let codeValue: String?
    public let notes: String?
}

public struct StartCleanResponse: Codable, Sendable {
    public let ok: Bool
    public let dayStatus: DayStatus?
    public let accessCodes: [JobAccessCode]?
}

public struct FinishCleanResponse: Codable, Sendable {
    public let ok: Bool
    public let dayStatus: DayStatus?
}

public struct CompleteJobResponse: Codable, Sendable {
    public let ok: Bool
    public let dayStatus: DayStatus?
    public let durationMins: Int?
}

// MARK: - Live job status (GET /jobs/bookings/:id/live)

public struct LiveJobPhoto: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let photoType: String            // before | after | checkout | damage
    public let roomLabel: String?
    public let createdAt: Date?
}

public struct LiveJobAddress: Codable, Hashable, Sendable {
    public let street: String?
    public let city: String?
    public let state: String?
    public let zip: String?
    public let lat: Double?
    public let lng: Double?

    public var oneLine: String {
        [street, city, zip].compactMap { $0 }.joined(separator: ", ")
    }
}

public struct LiveJobBooking: Codable, Hashable, Sendable {
    public let id: String
    public let status: BookingStatus
    public let dayStatus: DayStatus?
    public let scheduledAt: Date?
    public let arrivalVerifiedAt: Date?
    public let startedAt: Date?
    public let completedAt: Date?
    public let totalPrice: Int?
    public let serviceType: String?
    public let deepCleanApplied: Bool?
    public let cleanerName: String?
    /// Absent (key omitted) until the address is revealed to this cleaner.
    public let address: LiveJobAddress?
    public let accessCodes: [JobAccessCode]?
    public let photos: [LiveJobPhoto]?
}

public struct LiveLocation: Codable, Hashable, Sendable {
    public let lat: Double
    public let lng: Double
    public let createdAt: Date?
}

public struct LiveJobStatus: Codable, Sendable {
    public let booking: LiveJobBooking
    public let lastLocation: LiveLocation?
    public let photos: [LiveJobPhoto]?

    public var beforeCount: Int { (photos ?? []).filter { $0.photoType == "before" }.count }
    public var afterCount: Int { (photos ?? []).filter { $0.photoType == "after" }.count }
}

// MARK: - Earnings (GET /cleaner-dashboard/earnings)

public struct EarningsRecentPayout: Codable, Hashable, Sendable {
    public let date: Date?                  // paid_at; null until actually paid
    public let amount: Int?                 // cents
    public let status: String?
    public let bookingId: String?
}

public struct EarningsRecentTip: Codable, Hashable, Sendable {
    public let bookingId: String?
    public let amountCents: Int?
    public let date: Date?
}

public struct EarningsSummary: Codable, Sendable {
    public let thisWeek: Int
    public let thisMonth: Int
    public let lastMonth: Int
    public let allTime: Int
    public let pendingPayout: Int
    public let nextPayoutDate: Date?
    public let stripeConnected: Bool
    public let onboardingUrl: String?
    public let recent: [EarningsRecentPayout]
    public let tipsThisMonth: Int?
    public let tipsAllTime: Int?
    public let recentTips: [EarningsRecentTip]?

    public var thisWeekMoney: Money { Money(cents: thisWeek) }
    public var pendingMoney: Money { Money(cents: pendingPayout) }
    public var allTimeMoney: Money { Money(cents: allTime) }
}

// MARK: - Onboarding progress (GET /cleaners/onboarding-progress)

public struct OnboardingSteps: Codable, Hashable, Sendable {
    public let profile: Bool
    public let training: Bool
    public let background: Bool
    public let identity: Bool
    public let insurance: Bool
    public let submitted: Bool
    public let approved: Bool
}

public struct OnboardingProgress: Codable, Sendable {
    public let status: String               // incomplete | pending_review | approved
    public let steps: OnboardingSteps

    public var isApproved: Bool { status == "approved" }
}

// MARK: - Availability & service area (cleanerDashboard.ts)

public struct AvailabilitySlot: Codable, Hashable, Sendable {
    public let dayOfWeek: Int               // 0–6
    public var startTime: String            // "HH:MM"
    public var endTime: String
    public var active: Bool

    public init(dayOfWeek: Int, startTime: String, endTime: String, active: Bool) {
        self.dayOfWeek = dayOfWeek
        self.startTime = startTime
        self.endTime = endTime
        self.active = active
    }

    /// The PUT /cleaner-dashboard/availability schema wants snake_case keys
    /// verbatim; the API clients build the body from this.
    public var putJSON: [String: Any] {
        ["day_of_week": dayOfWeek, "start_time": startTime, "end_time": endTime, "active": active]
    }
}

public struct ServiceArea: Codable, Hashable, Sendable {
    public let centerLat: Double?
    public let centerLng: Double?
    public let radiusMiles: Double
    public let label: String?

    public init(centerLat: Double?, centerLng: Double?, radiusMiles: Double, label: String?) {
        self.centerLat = centerLat
        self.centerLng = centerLng
        self.radiusMiles = radiusMiles
        self.label = label
    }
}

// MARK: - Local cleaning guide (client-side only)
//
// The API has no room-checklist endpoint; this is the cleaner's on-device
// working guide, generated from the job's scope. Purely local state — it never
// syncs, and completing it gates nothing server-side (photos + the
// finish/complete endpoints do).

public struct ChecklistItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let label: String
    public var done: Bool

    public init(id: String = UUID().uuidString, label: String, done: Bool = false) {
        self.id = id
        self.label = label
        self.done = done
    }
}

public struct RoomChecklist: Identifiable, Hashable, Sendable {
    public let id: String
    public let room: String
    public var items: [ChecklistItem]

    public init(id: String = UUID().uuidString, room: String, items: [ChecklistItem]) {
        self.id = id
        self.room = room
        self.items = items
    }

    public var isComplete: Bool { items.allSatisfy(\.done) }
}

public enum CleaningGuide {
    /// Builds the on-device working guide from a job's scope.
    public static func build(bedrooms: Int?, bathrooms: Double?, deepClean: Bool) -> [RoomChecklist] {
        var rooms: [RoomChecklist] = []
        let bedroomCount = max(bedrooms ?? 1, 0)
        let bathroomCount = max(Int((bathrooms ?? 1).rounded(.up)), 0)

        rooms.append(RoomChecklist(room: "Kitchen", items: [
            ChecklistItem(label: "Counters & backsplash wiped"),
            ChecklistItem(label: "Sink scrubbed & shined"),
            ChecklistItem(label: "Stovetop degreased"),
            ChecklistItem(label: "Exterior of appliances wiped"),
            ChecklistItem(label: "Floor vacuumed & mopped"),
        ] + (deepClean ? [ChecklistItem(label: "Cabinet fronts detailed")] : [])))

        for i in 0..<bathroomCount {
            rooms.append(RoomChecklist(room: bathroomCount > 1 ? "Bathroom \(i + 1)" : "Bathroom", items: [
                ChecklistItem(label: "Toilet cleaned & disinfected"),
                ChecklistItem(label: "Shower / tub scrubbed"),
                ChecklistItem(label: "Vanity, sink & mirror polished"),
                ChecklistItem(label: "Floor cleaned"),
            ]))
        }

        for i in 0..<bedroomCount {
            rooms.append(RoomChecklist(room: bedroomCount > 1 ? "Bedroom \(i + 1)" : "Bedroom", items: [
                ChecklistItem(label: "Surfaces dusted"),
                ChecklistItem(label: "Mirrors cleaned"),
                ChecklistItem(label: "Floor vacuumed"),
                ChecklistItem(label: "Bed made / linens neatened"),
            ]))
        }

        rooms.append(RoomChecklist(room: "Living areas", items: [
            ChecklistItem(label: "Surfaces dusted"),
            ChecklistItem(label: "Soft furnishings straightened"),
            ChecklistItem(label: "Floors vacuumed & mopped"),
            ChecklistItem(label: "Trash emptied"),
        ]))
        return rooms
    }
}
