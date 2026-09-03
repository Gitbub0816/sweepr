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
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// SweeprAPI — the async/await networking layer over the Hono API at
// api.getsweepr.com, customer surface. Every endpoint here is field-audited
// against the route sources (bookings.ts, membership.ts, coupons.ts,
// customerProfile.ts, smartEntry.ts, payments.ts, account.ts). One instance is
// shared per app via `AppEnvironment`; Bearer auth comes from the injected
// `AuthTokenProvider` (the broker token provider in production).

public enum SweeprAPIError: Error, Sendable {
    case badURL
    case http(status: Int, body: String)
    case decoding(String)
    case transport(String)
    case unauthorized

    /// The server's machine error code when the body was `{ error: "..." }`.
    public var serverCode: String? {
        if case let .http(_, body) = self {
            struct E: Decodable { let error: String? }
            return (try? JSONDecoder().decode(E.self, from: Data(body.utf8)))?.error
        }
        return nil
    }
}

public struct SweeprAPIConfig: Sendable {
    public let baseURL: URL
    public init(baseURL: URL) { self.baseURL = baseURL }

    /// Production Hono worker. The `??` fallback keeps this initializer
    /// non-failable (no force-unwrap); the compile-time-constant literal is
    /// always a valid URL, so the fallback is unreachable.
    public static let production = SweeprAPIConfig(
        baseURL: URL(string: "https://api.getsweepr.com") ?? URL(fileURLWithPath: "/")
    )
}

public actor SweeprAPI {
    private let config: SweeprAPIConfig
    private let tokenProvider: AuthTokenProvider
    private let session: URLSession

    private let decoder: JSONDecoder = SweeprJSON.decoder
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        // IMPORTANT: the Hono API validates camelCase request bodies (zod
        // schemas use serviceType/addOnKeys/cleaningLevel…). Request models
        // declare camelCase properties, so we do NOT convert to snake_case.
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    public init(
        config: SweeprAPIConfig = .production,
        tokenProvider: AuthTokenProvider = AnonymousTokenProvider(),
        session: URLSession = .shared
    ) {
        self.config = config
        self.tokenProvider = tokenProvider
        self.session = session
    }

    // MARK: - Core request

    private enum Method: String { case GET, POST, PUT, PATCH, DELETE }

    private func request<T: Decodable>(
        _ method: Method,
        _ path: String,
        query: [String: String] = [:],
        body: Encodable? = nil,
        as type: T.Type
    ) async throws -> T {
        guard var components = URLComponents(
            url: config.baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        ) else { throw SweeprAPIError.badURL }
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw SweeprAPIError.badURL }

        var req = URLRequest(url: url)
        req.httpMethod = method.rawValue
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await tokenProvider.currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw SweeprAPIError.transport(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw SweeprAPIError.transport("Non-HTTP response")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SweeprAPIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw SweeprAPIError.decoding(String(describing: error))
        }
    }

    // MARK: - Bookings

    /// GET /bookings — raw snake_case rows, newest first, envelope `{bookings}`.
    public func bookings() async throws -> [Booking] {
        try await request(.GET, "bookings", as: BookingListResponse.self).bookings
    }

    /// GET /bookings/:id — `{ booking, cleaner }`; booking additionally carries
    /// the address join + addon_keys + deep_clean_applied.
    public func bookingDetail(id: String) async throws -> BookingDetail {
        let resp = try await request(.GET, "bookings/\(id)", as: BookingDetailResponse.self)
        return BookingDetail(booking: resp.booking, cleaner: resp.cleaner)
    }

    /// Convenience for call sites that only need the booking row.
    public func booking(id: String) async throws -> Booking {
        try await bookingDetail(id: id).booking
    }

    /// POST /bookings/quote — server-authoritative price for a proposed booking.
    /// The client NEVER computes totals; this snapshot is the source of truth.
    public func quote(_ req: QuoteRequest) async throws -> QuoteResponse {
        try await request(.POST, "bookings/quote", body: req, as: QuoteResponse.self)
    }

    /// POST /bookings — create a booking (201 `{ booking }`, raw row).
    public func createBooking(_ req: QuoteRequest) async throws -> Booking {
        try await request(.POST, "bookings", body: req, as: BookingEnvelope.self).booking
    }

    /// PATCH /bookings/:id/status — the ONLY customer-permitted transition is
    /// `cancelled_by_customer`, and only before a cleaner accepts.
    @discardableResult
    public func cancelBooking(id: String) async throws -> Booking {
        try await request(
            .PATCH, "bookings/\(id)/status",
            body: StatusChangeRequest(status: "cancelled_by_customer"),
            as: BookingEnvelope.self
        ).booking
    }

    // MARK: - Addresses (customer-profile)

    /// GET /customer-profile/addresses → `{ addresses }` (camelCase, mapped).
    public func addresses() async throws -> [CustomerAddress] {
        try await request(.GET, "customer-profile/addresses", as: AddressListResponse.self).addresses
    }

    /// POST /customer-profile/addresses → 201 `{ id }`. Upserts on exact match.
    public func createAddress(_ req: CreateAddressRequest) async throws -> String {
        try await request(.POST, "customer-profile/addresses", body: req, as: CreatedIdResponse.self).id
    }

    // MARK: - Customer profile (real, server-backed preferences)

    /// GET /customer-profile — Settings only reads the two preference fields;
    /// the rest of `profile` (home details, addresses) is used elsewhere.
    public func customerProfilePreferences() async throws -> CustomerProfilePreferences {
        try await request(.GET, "customer-profile", as: CustomerProfileEnvelope.self).profile
    }

    /// PATCH /customer-profile — partial update; omit a parameter to leave it
    /// unchanged server-side (mirrors the zod schema's all-optional fields).
    public func updateCustomerProfilePreferences(
        preferredLanguage: SweeprLanguage? = nil, smsConsent: Bool? = nil
    ) async throws {
        struct Body: Encodable { let preferredLanguage: String?; let smsConsent: Bool? }
        struct Ignored: Decodable {}
        _ = try await request(
            .PATCH, "customer-profile",
            body: Body(preferredLanguage: preferredLanguage?.rawValue, smsConsent: smsConsent),
            as: Ignored.self
        )
    }

    // MARK: - Auth

    /// GET /auth/me — the signed-in identity (generous rate bucket server-side).
    public func currentUser() async throws -> CurrentUser {
        try await request(.GET, "auth/me", as: CurrentUserResponse.self).user
    }

    // MARK: - Coupons

    /// GET /coupons/mine — active, unexpired coupons (camelCase, mapped).
    /// They apply automatically at booking; there is no redeem endpoint.
    public func coupons() async throws -> [Coupon] {
        try await request(.GET, "coupons/mine", as: CouponListResponse.self).coupons
    }

    // MARK: - Membership (Sweepr+)

    /// GET /membership — flat camelCase state incl. pricing + cancel status.
    public func membershipInfo() async throws -> MembershipInfo {
        try await request(.GET, "membership", as: MembershipInfo.self)
    }

    /// POST /membership/checkout — Stripe hosted Checkout URL to open in the
    /// browser (`interval` must be "month" | "year" on the wire).
    public func startMembershipCheckout(interval: MembershipPlanInterval) async throws -> URL? {
        let resp = try await request(
            .POST, "membership/checkout",
            body: MembershipCheckoutRequest(interval: interval),
            as: CheckoutSessionResponse.self
        )
        return resp.url.flatMap { URL(string: $0) }
    }

    /// POST /membership/cancel — cancel at period end (benefits persist until then).
    @discardableResult
    public func cancelMembership() async throws -> Bool {
        try await request(.POST, "membership/cancel", as: OKResponse.self).ok
    }

    /// POST /membership/resume — undo a pending cancellation.
    @discardableResult
    public func resumeMembership() async throws -> Bool {
        try await request(.POST, "membership/resume", as: OKResponse.self).ok
    }

    // MARK: - Calendar availability (advisory — the server re-checks at quote/create)

    /// GET /calendar/availability — blocked dates + pricing/promo markers for
    /// the visible month. Public endpoint (no auth required server-side, but
    /// attaching a token when we have one is harmless).
    public func calendarAvailability(
        from: String, to: String, lat: Double? = nil, lng: Double? = nil
    ) async throws -> [CalendarDayInfo] {
        var query = ["from": from, "to": to]
        if let lat { query["lat"] = String(lat) }
        if let lng { query["lng"] = String(lng) }
        return try await request(.GET, "calendar/availability", query: query, as: CalendarAvailabilityResponse.self).days
    }

    /// GET /cleaners/availability-slots — the six 2-hour arrival windows and
    /// real per-window availability for one date.
    public func arrivalWindows(date: String, zip: String? = nil) async throws -> ArrivalWindowsResponse {
        var query = ["date": date]
        if let zip { query["zip"] = zip }
        return try await request(.GET, "cleaners/availability-slots", query: query, as: ArrivalWindowsResponse.self)
    }

    // MARK: - Payments
    //
    // The customer app (only) links the Stripe iOS SDK (SKIP constraint means
    // CleanWithSweepr and SweeprKit never do). It creates the PaymentIntent
    // through these AUTHENTICATED endpoints, then hands the client secret to
    // `StripePaymentPresenter` (apps/ios/Sweepr) to confirm in-app with
    // Stripe's native PaymentSheet — no more hand-off to a hosted web page.

    /// GET /payments/methods — saved cards; degrades to [] server-side.
    public func paymentMethods() async throws -> [PaymentMethodSummary] {
        try await request(.GET, "payments/methods", as: PaymentMethodsResponse.self).methods
    }

    /// POST /payments/create-intent { bookingId } — the manual-capture booking
    /// PaymentIntent (authorize now, capture after service). Amount comes from
    /// the server; a 409 means another create is settling — retry shortly.
    public func createBookingPaymentIntent(bookingId: String) async throws -> PaymentIntentGrant {
        struct Body: Encodable { let bookingId: String }
        return try await request(
            .POST, "payments/create-intent",
            body: Body(bookingId: bookingId), as: PaymentIntentGrant.self
        )
    }

    /// POST /tips { bookingId, amountCents } — immediate-capture tip intent,
    /// 100% to the cleaner. Only completed bookings within the 3-day window.
    public func createTip(bookingId: String, amountCents: Int) async throws -> PaymentIntentGrant {
        struct Body: Encodable { let bookingId: String; let amountCents: Int }
        return try await request(
            .POST, "tips",
            body: Body(bookingId: bookingId, amountCents: amountCents), as: PaymentIntentGrant.self
        )
    }

    /// GET /tips/booking/:id → `{ tip }` (raw snake_case row or null).
    public func tipStatus(bookingId: String) async throws -> TipRecord? {
        try await request(.GET, "tips/booking/\(bookingId)", as: TipEnvelope.self).tip
    }

    /// GET /payments/intent-status/:bookingId — polled as a safety net
    /// alongside the native PaymentSheet. `paid` = authorized (manual
    /// capture) or settled.
    public func bookingPaymentStatus(bookingId: String) async throws -> BookingPaymentStatus {
        try await request(.GET, "payments/intent-status/\(bookingId)", as: BookingPaymentStatus.self)
    }

    // MARK: - Smart Entry

    /// GET /smart-entry/status — whether the feature is on and the $5 fee /
    /// member-included state for the paywall.
    public func smartEntryStatus() async throws -> SmartEntryStatus {
        try await request(.GET, "smart-entry/status", as: SmartEntryStatus.self)
    }

    /// GET /smart-entry/booking/:id — the booking's current access selection.
    public func bookingAccess(bookingId: String) async throws -> BookingAccessAuthorization? {
        try await request(.GET, "smart-entry/booking/\(bookingId)", as: BookingAccessResponse.self).authorization
    }

    /// PUT /smart-entry/booking/:id — set the access method (+ authorize/provision
    /// Smart Entry). Returns any fee charged in cents.
    @discardableResult
    public func setBookingAccess(bookingId: String, _ req: SetBookingAccessRequest) async throws -> SetBookingAccessResponse {
        try await request(.PUT, "smart-entry/booking/\(bookingId)", body: req, as: SetBookingAccessResponse.self)
    }

    // MARK: - Reviews

    /// POST /reviews — rate a completed cleaning (201 `{ review }`). The
    /// server requires the booking to be completed and the cleanerId to match.
    public func submitReview(
        bookingId: String, cleanerId: String, rating: Int, comment: String? = nil
    ) async throws {
        struct Body: Encodable {
            let bookingId: String
            let cleanerId: String
            let rating: Int
            let comment: String?
        }
        struct Ignored: Decodable {}
        _ = try await request(
            .POST, "reviews",
            body: Body(bookingId: bookingId, cleanerId: cleanerId, rating: rating, comment: comment),
            as: Ignored.self
        )
    }

    // MARK: - Account (privacy / right to erasure)

    /// POST /account/delete — App Store Guideline 5.1.1(v) in-app account
    /// deletion. HARD-deletes the account and (by default) every associated
    /// record via FK cascade, and removes the Clerk identity so the user can't
    /// sign back into a ghost account (`routes/account.ts`). The server
    /// re-verifies identity: `confirmEmail` MUST equal the signed-in account's
    /// email or the call is rejected 400.
    @discardableResult
    public func requestAccountDeletion(
        confirmEmail: String,
        scope: AccountDeletionScope = .accountAndData
    ) async throws -> AccountDeletionResponse {
        try await request(
            .POST, "account/delete",
            body: AccountDeletionRequest(confirmEmail: confirmEmail, scope: scope),
            as: AccountDeletionResponse.self
        )
    }
}

// MARK: - Response envelopes (match Hono `c.json({...})` shapes)

private struct BookingListResponse: Decodable { let bookings: [Booking] }
private struct BookingEnvelope: Decodable { let booking: Booking }
private struct BookingDetailResponse: Decodable {
    let booking: Booking
    let cleaner: BookingCleanerSummary?
}
private struct AddressListResponse: Decodable { let addresses: [CustomerAddress] }
private struct CreatedIdResponse: Decodable { let id: String }
private struct CurrentUserResponse: Decodable { let user: CurrentUser }
private struct CouponListResponse: Decodable { let coupons: [Coupon] }
private struct CustomerProfileEnvelope: Decodable { let profile: CustomerProfilePreferences }
private struct PaymentMethodsResponse: Decodable { let methods: [PaymentMethodSummary] }
private struct OKResponse: Decodable { let ok: Bool }
private struct StatusChangeRequest: Encodable { let status: String }

/// GET /payments/methods rows (camelCase, mapped server-side).
public struct PaymentMethodSummary: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let brand: String
    public let last4: String
    public let expMonth: Int?
    public let expYear: Int?
    public let isDefault: Bool
}

/// POST /payments/create-intent and POST /tips both answer with a client
/// secret + server-authoritative amount (cents).
public struct PaymentIntentGrant: Codable, Sendable {
    public let clientSecret: String?
    public let id: String?
    /// create-intent: booking total. Tips echo `amountCents` instead.
    public let amount: Int?
    public let amountCents: Int?

    public var resolvedAmountCents: Int? { amount ?? amountCents }
}

/// GET /payments/intent-status/:bookingId.
public struct BookingPaymentStatus: Codable, Sendable {
    public let status: String?
    public let paid: Bool
}

/// GET /tips/booking/:id `tip` object — raw snake_case row.
public struct TipRecord: Codable, Hashable, Sendable {
    public let id: String
    public let amountCents: Int?
    public let status: String?      // pending | succeeded | failed | refunded
    public let createdAt: Date?

    public init(id: String, amountCents: Int?, status: String?, createdAt: Date?) {
        self.id = id
        self.amountCents = amountCents
        self.status = status
        self.createdAt = createdAt
    }
}

private struct TipEnvelope: Decodable { let tip: TipRecord? }

// MARK: - Encodable erasure (for request bodies)

private struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { self.encodeFn = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
