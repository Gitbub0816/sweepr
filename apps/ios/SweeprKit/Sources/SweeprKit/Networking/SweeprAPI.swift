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
// api.getsweepr.com. One instance is shared per app via `AppEnvironment`.
// Bearer auth is supplied by an injected `AuthTokenProvider`.

public enum SweeprAPIError: Error, Sendable {
    case badURL
    case http(status: Int, body: String)
    case decoding(String)
    case transport(String)
    case unauthorized
}

public struct SweeprAPIConfig: Sendable {
    public let baseURL: URL
    public init(baseURL: URL) { self.baseURL = baseURL }

    /// Production Hono worker.
    public static let production = SweeprAPIConfig(
        baseURL: URL(string: "https://api.getsweepr.com")!
    )
}

public actor SweeprAPI {
    private let config: SweeprAPIConfig
    private let tokenProvider: AuthTokenProvider
    private let session: URLSession

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        // IMPORTANT: the Hono API validates camelCase request bodies (zod schemas
        // use serviceType/addOnKeys/cleaningLevel/deviceId…). Request models here
        // already declare camelCase properties, so we do NOT convert to
        // snake_case — that would make every zValidator reject the body. The
        // decoder still uses convertFromSnakeCase because several responses
        // (e.g. booking_access_authorizations columns) come back snake_case.
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

    // MARK: - Customer endpoints

    /// GET /bookings — the signed-in customer's bookings.
    public func bookings() async throws -> [Booking] {
        try await request(.GET, "bookings", as: BookingListResponse.self).bookings
    }

    /// GET /bookings/:id — full booking detail.
    public func booking(id: String) async throws -> Booking {
        try await request(.GET, "bookings/\(id)", as: BookingResponse.self).booking
    }

    /// GET /membership — legacy compact membership state (kept for callers that
    /// only need active/plan). Prefer `membershipInfo()` for the full web shape.
    public func membership() async throws -> Membership {
        try await request(.GET, "membership", as: Membership.self)
    }

    /// GET /auth/me — the signed-in user (generous polling bucket server-side).
    public func currentUser() async throws -> CurrentUser {
        try await request(.GET, "auth/me", as: CurrentUserResponse.self).user
    }

    /// POST /bookings/quote — server-authoritative price for a proposed booking.
    /// The client NEVER computes totals; this snapshot is the source of truth.
    public func quote(_ req: QuoteRequest) async throws -> QuoteResponse {
        try await request(.POST, "bookings/quote", body: req, as: QuoteResponse.self)
    }

    /// POST /bookings — create a booking from the reviewed quote input.
    public func createBooking(_ req: QuoteRequest) async throws -> Booking {
        try await request(.POST, "bookings", body: req, as: BookingResponse.self).booking
    }

    /// POST /bookings/:id/status — the only customer-permitted transition is
    /// cancellation (`cancelled_by_customer`); the server validates the machine.
    @discardableResult
    public func cancelBooking(id: String) async throws -> Booking {
        try await request(
            .POST, "bookings/\(id)/status",
            body: StatusChangeRequest(status: "cancelled_by_customer"),
            as: BookingResponse.self
        ).booking
    }

    // MARK: - Coupons

    /// GET /coupons/mine — the customer's active/attachable coupons.
    public func coupons() async throws -> [Coupon] {
        try await request(.GET, "coupons/mine", as: CouponListResponse.self).coupons
    }

    // MARK: - Membership (Sweepr+)

    /// GET /membership — full membership state incl. pricing + cancel status.
    public func membershipInfo() async throws -> MembershipInfo {
        try await request(.GET, "membership", as: MembershipInfo.self)
    }

    /// POST /membership/checkout — start a Stripe Checkout subscription; returns
    /// the hosted URL to open. Returns nil url if checkout couldn't be created.
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

    // MARK: - Cleaner (day-of-service) endpoints

    /// GET /cleaner-dashboard/jobs — jobs offered/assigned to the cleaner.
    public func cleanerJobs() async throws -> [Job] {
        try await request(.GET, "cleaner-dashboard/jobs", as: JobListResponse.self).jobs
    }

    /// GET /day-of-service/:bookingId — live day-of-service status for a job.
    public func dayOfServiceStatus(bookingId: String) async throws -> DayOfServiceStatus {
        try await request(.GET, "day-of-service/\(bookingId)", as: DayOfServiceStatus.self)
    }

    /// GET /cleaner-dashboard/earnings — payout summary.
    public func earnings() async throws -> EarningsSummary {
        try await request(.GET, "cleaner-dashboard/earnings", as: EarningsSummary.self)
    }
}

// MARK: - Response envelopes (match Hono `c.json({...})` shapes)

private struct BookingListResponse: Decodable { let bookings: [Booking] }
private struct BookingResponse: Decodable { let booking: Booking }
private struct JobListResponse: Decodable { let jobs: [Job] }
private struct CurrentUserResponse: Decodable { let user: CurrentUser }
private struct CouponListResponse: Decodable { let coupons: [Coupon] }
private struct OKResponse: Decodable { let ok: Bool }
private struct StatusChangeRequest: Encodable { let status: String }

// MARK: - Encodable erasure (for request bodies)

private struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { self.encodeFn = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
