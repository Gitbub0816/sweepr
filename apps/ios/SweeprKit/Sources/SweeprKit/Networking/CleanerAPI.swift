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

// Cleaner day-of-service network calls, hoisted into SweeprKit alongside
// `SweeprAPI` so both apps (and Android via SKIP) can reuse them. Mirrors
// `SweeprAPI`'s request-building conventions (Bearer auth via
// `AuthTokenProvider`, camelCase request bodies, snake_case responses decoded
// via `convertFromSnakeCase`, ISO-8601 dates). Endpoints map to
// `apps/api/src/routes/cleanerAccess.ts` / `dayOfService.ts` /
// `cleanerDashboard.ts`.
//
// Endpoints without a confirmed response shape yet are marked STUB — they fail
// soft to `CleanerMock` data so the UI is always exercisable offline.

public actor CleanerAPI {
    private let baseURL: URL
    private let tokenProvider: AuthTokenProvider
    private let session: URLSession

    public init(
        baseURL: URL = SweeprAPIConfig.production.baseURL,
        tokenProvider: AuthTokenProvider,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
    }

    private func makeRequest(method: String, path: String, jsonBody: [String: Any]? = nil) async throws -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await tokenProvider.currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let jsonBody {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        }
        return req
    }

    // MARK: - Job offers

    /// POST /cleaner-dashboard/jobs/:id/accept
    public func acceptOffer(jobId: String) async throws {
        let req = try await makeRequest(method: "POST", path: "cleaner-dashboard/jobs/\(jobId)/accept")
        _ = try await session.data(for: req)
    }

    /// POST /cleaner-dashboard/jobs/:id/decline
    public func declineOffer(jobId: String) async throws {
        let req = try await makeRequest(method: "POST", path: "cleaner-dashboard/jobs/\(jobId)/decline")
        _ = try await session.data(for: req)
    }

    // MARK: - Day-of-service transitions

    /// POST /day-of-service/:bookingId/transition { transition }
    /// Server validates against `lib/statusMachine.ts` — this call can fail and
    /// the UI must not optimistically assume success beyond the response.
    public func transition(bookingId: String, to status: BookingStatus) async throws {
        let req = try await makeRequest(
            method: "POST",
            path: "day-of-service/\(bookingId)/transition",
            jsonBody: ["transition": status.rawValue]
        )
        _ = try await session.data(for: req)
    }

    // MARK: - Smart Entry (Seam-backed access, per CLAUDE.md "Smart Entry")

    public struct AccessReveal: Sendable {
        public let code: String?
        public let instructions: String?
        public let expiresInSeconds: Int

        public init(code: String?, instructions: String?, expiresInSeconds: Int) {
            self.code = code
            self.instructions = instructions
            self.expiresInSeconds = expiresInSeconds
        }
    }

    /// GET /cleaner/bookings/:id/access — reveal the access code/instructions.
    /// Only callable once the cleaner is checked in; the server re-validates
    /// this server-side regardless of client-side gating.
    public func revealAccess(bookingId: String) async throws -> AccessReveal {
        let req = try await makeRequest(method: "GET", path: "cleaner/bookings/\(bookingId)/access")
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                                       body: String(data: data, encoding: .utf8) ?? "")
        }
        struct Wire: Decodable { let code: String?; let instructions: String?; let expiresInSeconds: Int? }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let wire = try decoder.decode(Wire.self, from: data)
        return AccessReveal(code: wire.code, instructions: wire.instructions,
                             expiresInSeconds: wire.expiresInSeconds ?? 45)
    }

    /// POST /cleaner/bookings/:id/access/unlock — momentary remote unlock via
    /// Seam. `lock: false` unlocks, `lock: true` re-secures on checkout.
    public func setLock(bookingId: String, locked: Bool) async throws {
        let req = try await makeRequest(
            method: "POST",
            path: "cleaner/bookings/\(bookingId)/access/unlock",
            jsonBody: ["lock": locked]
        )
        _ = try await session.data(for: req)
    }

    // MARK: - Smart Entry v2 (backend-driven, matches routes/cleanerAccess.ts)
    //
    // The real backend (`app.route("/cleaner", cleanerAccessRouter)`) exposes
    // THREE POST endpoints, each guarded by the full `authorizeHomeAccess`
    // decision and each requiring a location proof-of-presence body
    // (`locationSchema`):
    //   POST /cleaner/bookings/:id/access/reveal → { credentialType, credential,
    //                                                expiresAt, displaySeconds,
    //                                                remainingRevealCount }
    //   POST /cleaner/bookings/:id/access/unlock → { status, eventId?, message }
    //   POST /cleaner/bookings/:id/access/lock   → { status, eventId?, message }
    // Credentials are returned no-store; never persist or log them. These are
    // ONLY usable once the cleaner is checked in — the client gates the UI, and
    // the server re-validates regardless.

    /// Location proof-of-presence sent with every Smart Entry access call
    /// (mirrors `locationSchema` in `cleanerAccess.ts`). `capturedAt` /
    /// `reauthenticatedAt` are ISO-8601 strings.
    public struct SmartEntryLocation: Sendable {
        public var latitude: Double
        public var longitude: Double
        public var accuracyMeters: Double
        public var capturedAt: String
        public var reauthenticatedAt: String?
        public var sessionId: String
        public var deviceReference: String?

        public init(
            latitude: Double,
            longitude: Double,
            accuracyMeters: Double,
            capturedAt: String,
            reauthenticatedAt: String? = nil,
            sessionId: String,
            deviceReference: String? = nil
        ) {
            self.latitude = latitude
            self.longitude = longitude
            self.accuracyMeters = accuracyMeters
            self.capturedAt = capturedAt
            self.reauthenticatedAt = reauthenticatedAt
            self.sessionId = sessionId
            self.deviceReference = deviceReference
        }

        var jsonObject: [String: Any] {
            var d: [String: Any] = [
                "latitude": latitude,
                "longitude": longitude,
                "accuracyMeters": accuracyMeters,
                "capturedAt": capturedAt,
                "sessionId": sessionId,
            ]
            if let reauthenticatedAt { d["reauthenticatedAt"] = reauthenticatedAt }
            if let deviceReference { d["deviceReference"] = deviceReference }
            return d
        }
    }

    /// The short-lived working credential returned by `/access/reveal`.
    public struct AccessCredential: Sendable {
        public let credentialType: String
        public let credential: String
        /// ISO-8601 expiry as returned by the server (may be nil).
        public let expiresAtRaw: String?
        /// Seconds the client should keep the credential on screen (spec §11).
        public let displaySeconds: Int
        public let remainingRevealCount: Int

        public var expiresAt: Date? {
            guard let expiresAtRaw else { return nil }
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f.date(from: expiresAtRaw) ?? ISO8601DateFormatter().date(from: expiresAtRaw)
        }

        public init(credentialType: String, credential: String, expiresAtRaw: String?, displaySeconds: Int, remainingRevealCount: Int) {
            self.credentialType = credentialType
            self.credential = credential
            self.expiresAtRaw = expiresAtRaw
            self.displaySeconds = displaySeconds
            self.remainingRevealCount = remainingRevealCount
        }
    }

    /// Result of an unlock / lock action (`{ status, eventId?, message }`).
    public struct AccessActionResult: Sendable {
        public enum Status: String, Sendable { case success = "SUCCESS", failed = "FAILED", unknown = "UNKNOWN" }
        public let status: Status
        public let message: String?
        public let eventId: String?
        public var succeeded: Bool { status == .success }

        public init(status: Status, message: String?, eventId: String?) {
            self.status = status
            self.message = message
            self.eventId = eventId
        }
    }

    private func decodeAccessAction(_ data: Data) -> AccessActionResult {
        struct Wire: Decodable { let status: String?; let message: String?; let eventId: String? }
        let wire = try? JSONDecoder().decode(Wire.self, from: data)
        let status = AccessActionResult.Status(rawValue: wire?.status ?? "") ?? .unknown
        return AccessActionResult(status: status, message: wire?.message, eventId: wire?.eventId)
    }

    /// POST /cleaner/bookings/:id/access/reveal — reveal the working credential.
    /// Callable only once checked in; the server re-validates and returns the
    /// credential no-store. Throws on a non-2xx (e.g. 403 denied, 404/409 not
    /// ready) so the caller can surface the reason.
    public func revealAccessCredential(bookingId: String, location: SmartEntryLocation) async throws -> AccessCredential {
        let req = try await makeRequest(
            method: "POST",
            path: "cleaner/bookings/\(bookingId)/access/reveal",
            jsonBody: location.jsonObject
        )
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                                       body: String(data: data, encoding: .utf8) ?? "")
        }
        struct Wire: Decodable {
            let credentialType: String?
            let credential: String
            let expiresAt: String?
            let displaySeconds: Int?
            let remainingRevealCount: Int?
        }
        let wire = try JSONDecoder().decode(Wire.self, from: data)
        return AccessCredential(
            credentialType: wire.credentialType ?? "code",
            credential: wire.credential,
            expiresAtRaw: wire.expiresAt,
            displaySeconds: wire.displaySeconds ?? 45,
            remainingRevealCount: wire.remainingRevealCount ?? 0
        )
    }

    /// POST /cleaner/bookings/:id/access/unlock — server-triggered remote unlock
    /// (Seam). Returns the action result; never throws on a provider FAILED so
    /// the UI can distinguish denial (throws) from a soft provider failure.
    public func unlockDoor(bookingId: String, location: SmartEntryLocation) async throws -> AccessActionResult {
        let req = try await makeRequest(
            method: "POST",
            path: "cleaner/bookings/\(bookingId)/access/unlock",
            jsonBody: location.jsonObject
        )
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw SweeprAPIError.transport("Non-HTTP response")
        }
        // 403 = authorization denied (not checked in / out of window); surface it.
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SweeprAPIError.unauthorized
        }
        // 200 SUCCESS or 502 FAILED both carry a { status, message } body.
        return decodeAccessAction(data)
    }

    /// POST /cleaner/bookings/:id/access/lock — re-secure the lock at checkout.
    public func lockDoor(bookingId: String, location: SmartEntryLocation) async throws -> AccessActionResult {
        let req = try await makeRequest(
            method: "POST",
            path: "cleaner/bookings/\(bookingId)/access/lock",
            jsonBody: location.jsonObject
        )
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw SweeprAPIError.transport("Non-HTTP response")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SweeprAPIError.unauthorized
        }
        return decodeAccessAction(data)
    }

    // MARK: - Checklist (STUB — no confirmed backend contract yet; UI always
    // falls back to `CleanerMock.checklist` on any failure).

    public func checklist(bookingId: String) async throws -> [RoomChecklist] {
        let req = try await makeRequest(method: "GET", path: "day-of-service/\(bookingId)/checklist")
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? -1, body: "")
        }
        struct WireItem: Decodable { let id: String; let label: String; let done: Bool }
        struct WireRoom: Decodable { let id: String; let room: String; let items: [WireItem] }
        let decoder = JSONDecoder()
        let rooms = try decoder.decode([WireRoom].self, from: data)
        return rooms.map { r in
            RoomChecklist(id: r.id, room: r.room, items: r.items.map {
                ChecklistItem(id: $0.id, label: $0.label, done: $0.done)
            })
        }
    }

    // MARK: - Payouts (STUB)

    public func payouts() async throws -> [PayoutRecord] {
        let req = try await makeRequest(method: "GET", path: "cleaner-dashboard/payouts")
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? -1, body: "")
        }
        struct Wire: Decodable { let id: String; let paidAt: Date; let amountCents: Int; let jobsCount: Int; let includesTips: Bool }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        let wire = try decoder.decode([Wire].self, from: data)
        return wire.map { PayoutRecord(id: $0.id, paidAt: $0.paidAt, amount: Money(cents: $0.amountCents),
                                        jobsCount: $0.jobsCount, includesTips: $0.includesTips) }
    }

    // MARK: - Availability & service area (STUB — shape divergence documented)
    //
    // NOTE: the real `routes/cleanerDashboard.ts` uses `PUT /availability`
    // (`{ slots: [{ day_of_week, start_time, end_time, active }] }`) and
    // `PUT /service-area` (`{ centerLat, centerLng, radiusMiles, label? }`) —
    // richer than the simple availability toggle / ZIP field the current cleaner
    // AccountScreen exposes. Wiring these to the real schemas requires the
    // corresponding UI (an availability-slots editor + a lat/lng/radius picker);
    // until then these calls stay best-effort and fail soft. Do NOT assume the
    // simple bodies below validate server-side.

    /// STUB: simplified availability toggle (see note above).
    public func setAvailability(_ available: Bool) async throws {
        let req = try await makeRequest(method: "PATCH", path: "cleaner-dashboard/availability",
                                         jsonBody: ["available": available])
        _ = try await session.data(for: req)
    }

    /// PATCH /cleaner-dashboard/service-area { zip }
    public func setServiceAreaZip(_ zip: String) async throws {
        let req = try await makeRequest(method: "PATCH", path: "cleaner-dashboard/service-area",
                                         jsonBody: ["zip": zip])
        _ = try await session.data(for: req)
    }

    // MARK: - Verification status (STUB — Didit + Yardstik)

    public func verificationStatus() async throws -> VerificationStatus {
        let req = try await makeRequest(method: "GET", path: "cleaner-dashboard/verification")
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? -1, body: "")
        }
        struct Wire: Decodable { let didit: String; let yardstik: String }
        let wire = try JSONDecoder().decode(Wire.self, from: data)
        return VerificationStatus(
            didit: .init(rawValue: wire.didit) ?? .notStarted,
            yardstik: .init(rawValue: wire.yardstik) ?? .notStarted
        )
    }

    // MARK: - Photo uploads (STUB — real capture/upload to R2 not implemented;
    // this only marks a photo as captured client-side for the checklist gate).

    /// POST /day-of-service/:bookingId/photos { phase: "before"|"after" }
    public func recordPhotoCaptured(bookingId: String, phase: String) async throws {
        let req = try await makeRequest(
            method: "POST",
            path: "day-of-service/\(bookingId)/photos",
            jsonBody: ["phase": phase]
        )
        _ = try await session.data(for: req)
    }
}
