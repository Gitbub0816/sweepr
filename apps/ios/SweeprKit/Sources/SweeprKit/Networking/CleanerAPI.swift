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

// Cleaner network surface, field-audited against the real routes:
//
//  - `cleanerDashboard.ts` (mounted /cleaner-dashboard): jobs, offers,
//    accept/decline, earnings, availability, service-area, settings, Stripe
//    Connect onboarding.
//  - `dayOfService.ts` (mounted /jobs): the day-of-service machine. There is
//    NO generic transition endpoint — each step is its own POST with its own
//    guards, and arrival is GPS-verified server-side via /location pings.
//  - `cleanerAccess.ts` (mounted /cleaner): Smart Entry reveal/unlock/lock,
//    each carrying a proof-of-presence body.
//  - `cleaners.ts`: onboarding progress. `storage.ts`: photo upload signing.
//
// Bodies for /jobs/* use snake_case keys (the dayOfService zod schemas);
// bodies for /cleaner/* and /storage use camelCase — each call site says so.

public actor CleanerAPI {
    private let baseURL: URL
    private let tokenProvider: AuthTokenProvider
    private let session: URLSession
    private let decoder: JSONDecoder = SweeprJSON.decoder

    public init(
        baseURL: URL = SweeprAPIConfig.production.baseURL,
        tokenProvider: AuthTokenProvider,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
    }

    // MARK: - Core request

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [String: String] = [:],
        jsonBody: [String: Any]? = nil,
        as type: T.Type
    ) async throws -> T {
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        ) else { throw SweeprAPIError.badURL }
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw SweeprAPIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await tokenProvider.currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let jsonBody {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
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

    private struct JobsEnvelope: Decodable { let jobs: [CleanerJob] }
    private struct OKEnvelope: Decodable { let ok: Bool }

    // MARK: - Jobs & offers

    /// GET /cleaner-dashboard/my-jobs — accepted/active jobs (flat rows).
    public func myJobs(limit: Int = 50) async throws -> [CleanerJob] {
        try await send(
            "GET", "cleaner-dashboard/my-jobs",
            query: ["limit": String(limit)], as: JobsEnvelope.self
        ).jobs
    }

    /// GET /cleaner-dashboard/available-offers — the offer inbox. Envelope key
    /// is also `jobs`; rows carry no status. Stamped isOffer client-side.
    public func availableOffers() async throws -> [CleanerJob] {
        let jobs = try await send("GET", "cleaner-dashboard/available-offers", as: JobsEnvelope.self).jobs
        return jobs.map { job in
            var offer = job
            offer.isOffer = true
            return offer
        }
    }

    /// POST /cleaner-dashboard/jobs/:id/accept — no body.
    public func acceptOffer(bookingId: String) async throws {
        _ = try await send("POST", "cleaner-dashboard/jobs/\(bookingId)/accept", as: OKEnvelope.self)
    }

    /// POST /cleaner-dashboard/jobs/:id/decline — no body.
    public func declineOffer(bookingId: String) async throws {
        _ = try await send("POST", "cleaner-dashboard/jobs/\(bookingId)/decline", as: OKEnvelope.self)
    }

    // MARK: - Day-of-service machine (/jobs/bookings/:id/*, snake_case bodies)
    //
    // en_route → arrived (server-flipped by GPS) → in_progress →
    // awaiting_checkout → completed. Every response is authoritative — the UI
    // must NEVER advance locally when one of these throws.

    /// POST start-route — reveals the service address (time-windowed
    /// server-side) and flips day_status to en_route.
    public func startRoute(bookingId: String, lat: Double? = nil, lng: Double? = nil) async throws -> StartRouteResponse {
        var body: [String: Any] = [:]
        if let lat { body["lat"] = lat }
        if let lng { body["lng"] = lng }
        return try await send(
            "POST", "jobs/bookings/\(bookingId)/start-route",
            jsonBody: body, as: StartRouteResponse.self
        )
    }

    /// POST location — live position ping while en route. Within 150 m the
    /// SERVER verifies arrival and flips day_status to arrived.
    public func sendLocation(
        bookingId: String, lat: Double, lng: Double, accuracyMeters: Double? = nil
    ) async throws -> LocationPingResponse {
        var body: [String: Any] = ["lat": lat, "lng": lng]
        if let accuracyMeters { body["accuracy_m"] = accuracyMeters }
        return try await send(
            "POST", "jobs/bookings/\(bookingId)/location",
            jsonBody: body, as: LocationPingResponse.self
        )
    }

    /// POST start-clean — requires verified arrival; returns any legacy access
    /// codes (keypad/lockbox notes) and flips to in_progress.
    public func startClean(bookingId: String) async throws -> StartCleanResponse {
        try await send("POST", "jobs/bookings/\(bookingId)/start-clean", jsonBody: [:], as: StartCleanResponse.self)
    }

    /// POST finish-clean — flips to awaiting_checkout (lead-only on crews).
    public func finishClean(bookingId: String) async throws -> FinishCleanResponse {
        try await send("POST", "jobs/bookings/\(bookingId)/finish-clean", jsonBody: [:], as: FinishCleanResponse.self)
    }

    /// POST complete — requires the before/after photo minimums already
    /// recorded and a checkout photo storage key under `bookings/{id}/`.
    public func completeJob(bookingId: String, checkoutPhotoKey: String) async throws -> CompleteJobResponse {
        try await send(
            "POST", "jobs/bookings/\(bookingId)/complete",
            jsonBody: ["checkout_photo_key": checkoutPhotoKey],
            as: CompleteJobResponse.self
        )
    }

    /// GET live — the authoritative day-of-service snapshot (status, photos,
    /// revealed address, access codes, last location).
    public func liveStatus(bookingId: String) async throws -> LiveJobStatus {
        try await send("GET", "jobs/bookings/\(bookingId)/live", as: LiveJobStatus.self)
    }

    // MARK: - Photos

    /// POST /storage/sign-upload (camelCase body) — presigned R2 PUT for a
    /// booking photo. The returned storageKey is `bookings/{bookingId}/…`,
    /// which is exactly the prefix the day-of-service endpoints enforce.
    public func signPhotoUpload(
        bookingId: String, fileName: String, contentType: String, sizeBytes: Int
    ) async throws -> SignedUpload {
        try await send("POST", "storage/sign-upload", jsonBody: [
            "fileName": fileName,
            "contentType": contentType,
            "sizeBytes": sizeBytes,
            "purpose": "booking_photo",
            "scope": "booking",
            "refId": bookingId,
        ], as: SignedUpload.self)
    }

    /// PUT the bytes to R2 using the presigned URL. The Content-Type MUST be
    /// exactly the one bound into the signature.
    public func uploadPhotoData(_ data: Data, to upload: SignedUpload) async throws {
        guard let url = URL(string: upload.uploadUrl) else { throw SweeprAPIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        for (k, v) in upload.requiredHeaders ?? [:] {
            req.setValue(v, forHTTPHeaderField: k)
        }
        req.httpBody = data
        let (respData, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(
                status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                body: String(data: respData, encoding: .utf8) ?? ""
            )
        }
    }

    /// POST /jobs/bookings/:id/photos (snake_case) — record an uploaded photo
    /// against the job. photoType: before | after | checkout | damage.
    public func recordPhoto(
        bookingId: String, photoType: String, storageKey: String, roomLabel: String? = nil
    ) async throws {
        var body: [String: Any] = ["photo_type": photoType, "storage_key": storageKey]
        if let roomLabel { body["room_label"] = roomLabel }
        _ = try await send("POST", "jobs/bookings/\(bookingId)/photos", jsonBody: body, as: OKEnvelope.self)
    }

    // MARK: - Smart Entry (backend-driven, matches routes/cleanerAccess.ts)
    //
    // POST /cleaner/bookings/:id/access/{reveal|unlock|lock} — camelCase
    // proof-of-presence body; credential responses are no-store. Only usable
    // once checked in; the server re-validates every call regardless.

    /// Location proof-of-presence sent with every Smart Entry access call
    /// (mirrors `locationSchema` in `cleanerAccess.ts`).
    public struct SmartEntryLocation: Sendable {
        public var latitude: Double
        public var longitude: Double
        public var accuracyMeters: Double
        public var capturedAt: String
        public var reauthenticatedAt: String?
        public var sessionId: String
        public var deviceReference: String?

        public init(
            latitude: Double, longitude: Double, accuracyMeters: Double,
            capturedAt: String, reauthenticatedAt: String? = nil,
            sessionId: String, deviceReference: String? = nil
        ) {
            self.latitude = latitude
            self.longitude = longitude
            self.accuracyMeters = accuracyMeters
            self.capturedAt = capturedAt
            self.reauthenticatedAt = reauthenticatedAt
            self.sessionId = sessionId
            self.deviceReference = deviceReference
        }

        /// Builds a proof-of-presence body stamped with the current time.
        public static func now(
            latitude: Double, longitude: Double, accuracyMeters: Double,
            sessionId: String, reauthenticated: Bool = false, deviceReference: String? = nil
        ) -> SmartEntryLocation {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let stamp = f.string(from: Date())
            return SmartEntryLocation(
                latitude: latitude, longitude: longitude, accuracyMeters: accuracyMeters,
                capturedAt: stamp, reauthenticatedAt: reauthenticated ? stamp : nil,
                sessionId: sessionId, deviceReference: deviceReference
            )
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
        public let expiresAtRaw: String?
        /// Seconds the client should keep the credential on screen.
        public let displaySeconds: Int
        public let remainingRevealCount: Int

        public var expiresAt: Date? {
            expiresAtRaw.flatMap { SweeprJSON.parseDate($0) }
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
    /// `eventId` is present only on a successful unlock.
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

    private func accessRequest(_ path: String, location: SmartEntryLocation) async throws -> (Data, HTTPURLResponse) {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await tokenProvider.currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: location.jsonObject)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw SweeprAPIError.transport("Non-HTTP response")
        }
        return (data, http)
    }

    /// POST /cleaner/bookings/:id/access/reveal — reveal the working
    /// credential. Throws on denial (403 with a reason) so the caller can
    /// surface it; the credential is no-store — never persist or log it.
    public func revealAccessCredential(bookingId: String, location: SmartEntryLocation) async throws -> AccessCredential {
        let (data, http) = try await accessRequest("cleaner/bookings/\(bookingId)/access/reveal", location: location)
        guard (200..<300).contains(http.statusCode) else {
            throw SweeprAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
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

    /// POST /cleaner/bookings/:id/access/unlock — server-triggered remote
    /// unlock (Seam). 403 = authorization denied (throws); a 502 provider
    /// failure returns `{status: FAILED}` so the UI can offer a retry.
    public func unlockDoor(bookingId: String, location: SmartEntryLocation) async throws -> AccessActionResult {
        let (data, http) = try await accessRequest("cleaner/bookings/\(bookingId)/access/unlock", location: location)
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SweeprAPIError.unauthorized
        }
        return decodeAccessAction(data)
    }

    /// POST /cleaner/bookings/:id/access/lock — re-secure the lock at checkout.
    public func lockDoor(bookingId: String, location: SmartEntryLocation) async throws -> AccessActionResult {
        let (data, http) = try await accessRequest("cleaner/bookings/\(bookingId)/access/lock", location: location)
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SweeprAPIError.unauthorized
        }
        return decodeAccessAction(data)
    }

    // MARK: - Earnings

    /// GET /cleaner-dashboard/earnings — cents everywhere; recent payout rows
    /// have a null date until actually paid.
    public func earnings() async throws -> EarningsSummary {
        try await send("GET", "cleaner-dashboard/earnings", as: EarningsSummary.self)
    }

    /// POST /cleaner-dashboard/stripe-connect/onboard → { url } for payout setup.
    public func stripeConnectOnboardingURL() async throws -> URL? {
        struct Wire: Decodable { let url: String? }
        let wire = try await send("POST", "cleaner-dashboard/stripe-connect/onboard", jsonBody: [:], as: Wire.self)
        return wire.url.flatMap { URL(string: $0) }
    }

    // MARK: - Onboarding / verification

    /// GET /cleaners/onboarding-progress — the checklist the dashboard shows.
    public func onboardingProgress() async throws -> OnboardingProgress {
        try await send("GET", "cleaners/onboarding-progress", as: OnboardingProgress.self)
    }

    // MARK: - Availability & service area

    /// GET /cleaner-dashboard/availability → { slots }.
    public func availability() async throws -> [AvailabilitySlot] {
        struct Wire: Decodable { let slots: [AvailabilitySlot] }
        return try await send("GET", "cleaner-dashboard/availability", as: Wire.self).slots
    }

    /// PUT /cleaner-dashboard/availability { slots } — snake_case slot keys.
    public func setAvailability(_ slots: [AvailabilitySlot]) async throws {
        _ = try await send(
            "PUT", "cleaner-dashboard/availability",
            jsonBody: ["slots": slots.map(\.putJSON)],
            as: OKEnvelope.self
        )
    }

    /// GET /cleaner-dashboard/service-area → { area } (camelCase, nullable).
    public func serviceArea() async throws -> ServiceArea? {
        struct Wire: Decodable { let area: ServiceArea? }
        return try await send("GET", "cleaner-dashboard/service-area", as: Wire.self).area
    }

    /// PUT /cleaner-dashboard/service-area (camelCase body).
    public func setServiceArea(centerLat: Double, centerLng: Double, radiusMiles: Int, label: String? = nil) async throws {
        var body: [String: Any] = [
            "centerLat": centerLat, "centerLng": centerLng, "radiusMiles": radiusMiles,
        ]
        if let label { body["label"] = label }
        _ = try await send("PUT", "cleaner-dashboard/service-area", jsonBody: body, as: OKEnvelope.self)
    }

    // MARK: - Settings (real, server-backed — GET/PUT /cleaner-dashboard/settings)

    /// GET /cleaner-dashboard/settings — job-matching criteria, notification
    /// toggles, and preferred language. The server returns sane defaults even
    /// before a `cleaners` row exists, so this never fails onboarding.
    public func settings() async throws -> CleanerSettings {
        try await send("GET", "cleaner-dashboard/settings", as: CleanerSettings.self)
    }

    /// PUT /cleaner-dashboard/settings — partial update; only the fields you
    /// pass change server-side (mirrors `settingsSchema`'s all-optional shape).
    public func updateSettings(
        maxJobsPerDay: Int? = nil,
        maxDistanceMiles: Double? = nil,
        acceptsLastMinute: Bool? = nil,
        notificationJobOffer: Bool? = nil,
        notificationReminder: Bool? = nil,
        notificationPayout: Bool? = nil,
        notificationMarketing: Bool? = nil,
        acceptedJobTypes: [String]? = nil,
        preferredLanguage: SweeprLanguage? = nil
    ) async throws {
        var body: [String: Any] = [:]
        if let maxJobsPerDay { body["max_jobs_per_day"] = maxJobsPerDay }
        if let maxDistanceMiles { body["max_distance_miles"] = maxDistanceMiles }
        if let acceptsLastMinute { body["accepts_last_minute"] = acceptsLastMinute }
        if let notificationJobOffer { body["notification_job_offer"] = notificationJobOffer }
        if let notificationReminder { body["notification_reminder"] = notificationReminder }
        if let notificationPayout { body["notification_payout"] = notificationPayout }
        if let notificationMarketing { body["notification_marketing"] = notificationMarketing }
        if let acceptedJobTypes { body["accepted_job_types"] = acceptedJobTypes }
        if let preferredLanguage { body["preferred_language"] = preferredLanguage.rawValue }
        _ = try await send("PUT", "cleaner-dashboard/settings", jsonBody: body, as: OKEnvelope.self)
    }

    // MARK: - Account deletion (App Store Guideline 5.1.1(v))

    /// POST /account/delete — HARD-deletes the account (see routes/account.ts).
    public func requestAccountDeletion(confirmEmail: String, scope: String = "account_and_data") async throws {
        _ = try await send("POST", "account/delete", jsonBody: [
            "confirmEmail": confirmEmail, "scope": scope,
        ], as: OKEnvelope.self)
    }
}

/// POST /storage/sign-upload response.
public struct SignedUpload: Codable, Sendable {
    public let uploadUrl: String
    public let storageKey: String
    public let publicUrl: String?
    public let requiredHeaders: [String: String]?
}
