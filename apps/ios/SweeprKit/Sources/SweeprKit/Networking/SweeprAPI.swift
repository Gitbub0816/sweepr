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
        e.keyEncodingStrategy = .convertToSnakeCase
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

    private enum Method: String { case GET, POST, PATCH, DELETE }

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

    /// GET /membership — the customer's membership state.
    public func membership() async throws -> Membership {
        try await request(.GET, "membership", as: Membership.self)
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

// MARK: - Encodable erasure (for request bodies)

private struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { self.encodeFn = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
