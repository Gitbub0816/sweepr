//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import SweeprKit

// Auth stack tests — a scripted HTTPTransport plays both Clerk's Frontend API
// (envelopes captured from the live production instance) and the mobile BFF,
// so the full ceremony (sign-in → broker session → persisted vault → API
// token refresh) runs hermetically on Linux and macOS alike.

/// Scripted transport: match by URL substring, in order of registration.
final class ScriptedTransport: HTTPTransport, @unchecked Sendable {
    struct Rule {
        let match: String
        let status: Int
        let body: String
        let headers: [String: String]
    }
    private let lock = NSLock()
    private var rules: [Rule] = []
    private(set) var requests: [URLRequest] = []

    func on(_ match: String, status: Int = 200, body: String, headers: [String: String] = [:]) {
        lock.lock(); defer { lock.unlock() }
        rules.append(Rule(match: match, status: status, body: body, headers: headers))
    }

    /// Synchronous core so the async entry point never touches NSLock
    /// directly (unavailable from async contexts under Swift 6 checking).
    private func consumeRule(for request: URLRequest) -> Rule? {
        lock.lock(); defer { lock.unlock() }
        requests.append(request)
        let url = request.url?.absoluteString ?? ""
        guard let idx = rules.firstIndex(where: { url.contains($0.match) }) else { return nil }
        // One-shot rules: later registrations for the same match take over.
        return rules.remove(at: idx)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard let rule = consumeRule(for: request) else {
            throw URLError(.unsupportedURL)
        }
        let response = HTTPURLResponse(
            url: request.url ?? URL(fileURLWithPath: "/"),
            statusCode: rule.status,
            httpVersion: "HTTP/1.1",
            headerFields: rule.headers
        )!
        return (Data(rule.body.utf8), response)
    }

    var recordedBodies: [String] {
        lock.lock(); defer { lock.unlock() }
        return requests.map { String(data: $0.httpBody ?? Data(), encoding: .utf8) ?? "" }
    }
}

final class AuthEngineTests: XCTestCase {
    private func makeStack(
        transport: ScriptedTransport,
        vault: MemoryTokenVault = MemoryTokenVault()
    ) -> (AuthEngine, BrokerTokenProvider, MemoryTokenVault) {
        let clerk = ClerkAPI(transport: transport, vault: vault)
        let mobile = MobileAuthAPI(transport: transport)
        let provider = BrokerTokenProvider(app: .customer, vault: vault, mobileAuth: mobile)
        let engine = AuthEngine(app: .customer, clerk: clerk, mobileAuth: mobile, tokenProvider: provider)
        return (engine, provider, vault)
    }

    // Native-mode envelopes as captured from clerk.getsweepr.com.
    private let completeSignIn = """
    {"response":{"object":"sign_in_attempt","id":"sia_1","status":"complete",
     "created_session_id":"sess_1","supported_first_factors":null},
     "client":{"object":"client","sessions":[{"id":"sess_1","status":"active"}],
     "last_active_session_id":"sess_1"}}
    """
    private let sessionTokenReply = #"{"object":"token","jwt":"eyJ.clerk.jwt"}"#
    private let brokerGrantReply = """
    {"sessionToken":"broker-opaque-token","sessionExpiresAt":"2026-11-02T00:00:00+00",
     "apiToken":"eyJ.api.token","apiTokenExpiresAt":\(Date().timeIntervalSince1970 * 1000 + 600_000)}
    """

    func testPasswordSignInEstablishesPersistedBrokerSession() async throws {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ins?", body: completeSignIn,
                     headers: ["Authorization": "rotated.client.jwt"])
        transport.on("/sessions/sess_1/tokens", body: sessionTokenReply)
        transport.on("/mobile-auth/session", body: brokerGrantReply)
        transport.on("/sessions/sess_1/remove", body: #"{"response":{"id":"sess_1","status":"removed"}}"#)

        let (engine, provider, vault) = makeStack(transport: transport)
        let step = try await engine.signIn(identifier: "user@example.com", password: "pw")

        XCTAssertEqual(step, .complete)
        // The broker session is the persisted credential…
        XCTAssertEqual(vault.get(.brokerSessionToken), "broker-opaque-token")
        XCTAssertTrue(provider.hasPersistedSession)
        // …the API token is served from cache without another network call…
        let token = await provider.currentToken()
        XCTAssertEqual(token, "eyJ.api.token")
        // …and the rotated Clerk client JWT was captured for future ceremonies.
        XCTAssertEqual(vault.get(.clerkClientToken), "rotated.client.jwt")
        // The ceremony sent the BFF exactly the minted Clerk JWT.
        XCTAssertTrue(transport.recordedBodies.contains { $0.contains(#""clerkToken":"eyJ.clerk.jwt""#) })
    }

    func testWrongPasswordSurfacesFriendlyError() async {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ins?", status: 422, body: """
        {"errors":[{"message":"Password is incorrect.","long_message":"Password is incorrect. Try again.",
          "code":"form_password_incorrect","meta":{"param_name":"password"}}]}
        """)
        let (engine, _, vault) = makeStack(transport: transport)
        do {
            _ = try await engine.signIn(identifier: "user@example.com", password: "bad")
            XCTFail("expected error")
        } catch let error as AuthEngineError {
            XCTAssertEqual(error.code, "form_password_incorrect")
            XCTAssertTrue(error.message.contains("password isn't right"))
        } catch {
            XCTFail("unexpected \(error)")
        }
        XCTAssertNil(vault.get(.brokerSessionToken))
    }

    func testEmailCodeFlowPreparesFactorThenCompletes() async throws {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ins?", body: """
        {"response":{"object":"sign_in_attempt","id":"sia_2","status":"needs_first_factor",
         "supported_first_factors":[
           {"strategy":"password"},
           {"strategy":"email_code","email_address_id":"idn_1","safe_identifier":"u***@example.com"}]},
         "client":{}}
        """)
        transport.on("/sign_ins/sia_2/prepare_first_factor", body: """
        {"response":{"object":"sign_in_attempt","id":"sia_2","status":"needs_first_factor",
         "first_factor_verification":{"status":"unverified","strategy":"email_code"}},"client":{}}
        """)
        transport.on("/sign_ins/sia_2/attempt_first_factor", body: completeSignIn.replacingOccurrences(of: "sia_1", with: "sia_2"))
        transport.on("/sessions/sess_1/tokens", body: sessionTokenReply)
        transport.on("/mobile-auth/session", body: brokerGrantReply)
        transport.on("/sessions/sess_1/remove", body: #"{"response":{"id":"sess_1"}}"#)

        let (engine, _, vault) = makeStack(transport: transport)
        let step = try await engine.signInWithCode(identifier: "user@example.com")
        XCTAssertEqual(step, .needsCode(channel: .email, hint: "u***@example.com"))

        let done = try await engine.submitSignInCode("424242")
        XCTAssertEqual(done, .complete)
        XCTAssertEqual(vault.get(.brokerSessionToken), "broker-opaque-token")
        // prepare carried the factor's email_address_id.
        XCTAssertTrue(transport.recordedBodies.contains { $0.contains("email_address_id=idn_1") })
    }

    func testDeniedAppAdmissionIsExplicit() async {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ins?", body: completeSignIn)
        transport.on("/sessions/sess_1/tokens", body: sessionTokenReply)
        transport.on("/mobile-auth/session", status: 403, body: #"{"error":"not_authorized_for_application"}"#)
        transport.on("/sessions/sess_1/remove", body: #"{"response":{"id":"sess_1"}}"#)

        let (engine, provider, _) = makeStack(transport: transport)
        do {
            _ = try await engine.signIn(identifier: "user@example.com", password: "pw")
            XCTFail("expected denial")
        } catch let error as AuthEngineError {
            XCTAssertEqual(error.code, "not_authorized_for_application")
        } catch {
            XCTFail("unexpected \(error)")
        }
        XCTAssertFalse(provider.hasPersistedSession)
    }

    func testTokenProviderRefreshesFromPersistedSessionAcrossLaunch() async throws {
        // "Second launch": vault already holds a broker session, nothing cached.
        let vault = MemoryTokenVault()
        vault.set(.brokerSessionToken, "broker-opaque-token")
        let transport = ScriptedTransport()
        transport.on("/mobile-auth/token", body: """
        {"apiToken":"fresh.api.token",
         "apiTokenExpiresAt":\(Date().timeIntervalSince1970 * 1000 + 600_000),
         "sessionExpiresAt":"2026-12-01T00:00:00+00"}
        """)
        let provider = BrokerTokenProvider(
            app: .customer, vault: vault, mobileAuth: MobileAuthAPI(transport: transport)
        )
        XCTAssertTrue(provider.hasPersistedSession)
        let token = await provider.currentToken()
        XCTAssertEqual(token, "fresh.api.token")
        // Cached: a second call needs no new transport rule.
        let again = await provider.currentToken()
        XCTAssertEqual(again, "fresh.api.token")
        XCTAssertTrue(transport.recordedBodies[0].contains(#""sessionToken":"broker-opaque-token""#))
    }

    func testRevokedSessionWipesVaultAndNotifies() async {
        let vault = MemoryTokenVault()
        vault.set(.brokerSessionToken, "revoked-token")
        vault.set(.clerkClientToken, "client.jwt")
        let transport = ScriptedTransport()
        transport.on("/mobile-auth/token", status: 401, body: #"{"error":"session_inactive"}"#)

        let fired = expectation(description: "invalidation relay fired")
        let provider = BrokerTokenProvider(
            app: .customer, vault: vault, mobileAuth: MobileAuthAPI(transport: transport),
            onSessionInvalid: { fired.fulfill() }
        )
        let token = await provider.currentToken()
        XCTAssertNil(token)
        XCTAssertNil(vault.get(.brokerSessionToken))
        XCTAssertNil(vault.get(.clerkClientToken))
        await fulfillment(of: [fired], timeout: 2)
    }

    func testBrokerOutageDoesNotSignOut() async {
        let vault = MemoryTokenVault()
        vault.set(.brokerSessionToken, "broker-opaque-token")
        let transport = ScriptedTransport()
        transport.on("/mobile-auth/token", status: 502, body: #"{"error":"broker_unavailable"}"#)

        let provider = BrokerTokenProvider(
            app: .customer, vault: vault, mobileAuth: MobileAuthAPI(transport: transport)
        )
        let token = await provider.currentToken()
        XCTAssertNil(token) // this call is unauthenticated…
        XCTAssertTrue(provider.hasPersistedSession) // …but the session survives.
    }

    func testSignOutRevokesAtBrokerAndWipes() async {
        let vault = MemoryTokenVault()
        vault.set(.brokerSessionToken, "broker-opaque-token")
        vault.set(.clerkClientToken, "client.jwt")
        let transport = ScriptedTransport()
        transport.on("/mobile-auth/logout", body: #"{"ok":true}"#)

        let provider = BrokerTokenProvider(
            app: .customer, vault: vault, mobileAuth: MobileAuthAPI(transport: transport)
        )
        await provider.signOut()
        XCTAssertNil(vault.get(.brokerSessionToken))
        XCTAssertNil(vault.get(.clerkClientToken))
        XCTAssertTrue(transport.requests.contains { ($0.url?.absoluteString ?? "").contains("/mobile-auth/logout") })
    }

    func testSignUpFlowVerifiesEmailThenEstablishesSession() async throws {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ups?", body: """
        {"response":{"object":"sign_up_attempt","id":"sua_1","status":"missing_requirements",
         "missing_fields":[],"unverified_fields":["email_address"],
         "email_address":"new@example.com"},"client":{}}
        """)
        transport.on("/sign_ups/sua_1/prepare_verification", body: """
        {"response":{"object":"sign_up_attempt","id":"sua_1","status":"missing_requirements",
         "unverified_fields":["email_address"],"email_address":"new@example.com"},"client":{}}
        """)
        transport.on("/sign_ups/sua_1/attempt_verification", body: """
        {"response":{"object":"sign_up_attempt","id":"sua_1","status":"complete",
         "created_session_id":"sess_9","created_user_id":"user_9"},"client":{}}
        """)
        transport.on("/sessions/sess_9/tokens", body: sessionTokenReply)
        transport.on("/mobile-auth/session", body: brokerGrantReply)
        transport.on("/sessions/sess_9/remove", body: #"{"response":{"id":"sess_9"}}"#)

        let (engine, _, vault) = makeStack(transport: transport)
        let step = try await engine.signUp(
            email: "new@example.com", password: "str0ng-pw!", firstName: "New", lastName: "Person"
        )
        XCTAssertEqual(step, .needsCode(channel: .email, hint: "new@example.com"))
        let done = try await engine.submitSignUpCode("424242")
        XCTAssertEqual(done, .complete)
        XCTAssertEqual(vault.get(.brokerSessionToken), "broker-opaque-token")
        // Sign-up carried all four required fields, form-encoded.
        XCTAssertTrue(transport.recordedBodies.contains {
            $0.contains("email_address=new%40example.com") && $0.contains("first_name=New")
                && $0.contains("last_name=Person") && $0.contains("password=str0ng-pw%21")
        })
    }

    // A session left on the device's Clerk client (e.g. the broker hand-off
    // failed after Clerk sign-in succeeded) must be cleared and the ceremony
    // retried — not dead-end the auth wall with "you're already signed in".
    private let sessionExistsError = """
    {"errors":[{"message":"Session already exists.",
     "long_message":"You're currently in single session mode. You can only be signed into one account at a time.",
     "code":"session_exists"}]}
    """
    private let staleClientState = """
    {"response":{"object":"client","sessions":[{"id":"sess_stale","status":"active"}],
     "last_active_session_id":"sess_stale"}}
    """

    func testStaleClerkSessionIsClearedThenSignInRetries() async throws {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ins?", status: 403, body: sessionExistsError)
        transport.on("/v1/client?", body: staleClientState)
        transport.on("/sessions/sess_stale/remove", body: #"{"response":{"id":"sess_stale","status":"removed"}}"#)
        transport.on("/v1/client/sign_ins?", body: completeSignIn)
        transport.on("/sessions/sess_1/tokens", body: sessionTokenReply)
        transport.on("/mobile-auth/session", body: brokerGrantReply)
        transport.on("/sessions/sess_1/remove", body: #"{"response":{"id":"sess_1"}}"#)

        let (engine, provider, vault) = makeStack(transport: transport)
        let step = try await engine.signIn(identifier: "user@example.com", password: "pw")

        XCTAssertEqual(step, .complete)
        XCTAssertEqual(vault.get(.brokerSessionToken), "broker-opaque-token")
        XCTAssertTrue(provider.hasPersistedSession)
        // The stale session was explicitly removed before the retry.
        XCTAssertTrue(transport.requests.contains {
            ($0.url?.absoluteString ?? "").contains("/sessions/sess_stale/remove")
        })
    }

    func testStaleClerkSessionIsClearedThenSignUpRetries() async throws {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ups?", status: 403, body: sessionExistsError)
        transport.on("/v1/client?", body: staleClientState)
        transport.on("/sessions/sess_stale/remove", body: #"{"response":{"id":"sess_stale","status":"removed"}}"#)
        transport.on("/v1/client/sign_ups?", body: """
        {"response":{"object":"sign_up_attempt","id":"sua_1","status":"missing_requirements",
         "missing_fields":[],"unverified_fields":["email_address"],
         "email_address":"new@example.com"},"client":{}}
        """)
        transport.on("/sign_ups/sua_1/prepare_verification", body: """
        {"response":{"object":"sign_up_attempt","id":"sua_1","status":"missing_requirements",
         "unverified_fields":["email_address"],"email_address":"new@example.com"},"client":{}}
        """)

        let (engine, _, _) = makeStack(transport: transport)
        let step = try await engine.signUp(
            email: "new@example.com", password: "str0ng-pw!", firstName: "New", lastName: "Person"
        )
        XCTAssertEqual(step, .needsCode(channel: .email, hint: "new@example.com"))
        XCTAssertTrue(transport.requests.contains {
            ($0.url?.absoluteString ?? "").contains("/sessions/sess_stale/remove")
        })
    }

    func testFailedBrokerHandOffRemovesClerkSessionAndNamesConfigError() async {
        let transport = ScriptedTransport()
        transport.on("/v1/client/sign_ins?", body: completeSignIn)
        transport.on("/sessions/sess_1/tokens", body: sessionTokenReply)
        transport.on("/mobile-auth/session", status: 503, body: #"{"error":"auth_unconfigured"}"#)
        transport.on("/sessions/sess_1/remove", body: #"{"response":{"id":"sess_1"}}"#)

        let (engine, provider, _) = makeStack(transport: transport)
        do {
            _ = try await engine.signIn(identifier: "user@example.com", password: "pw")
            XCTFail("expected failure")
        } catch let error as AuthEngineError {
            XCTAssertEqual(error.code, "auth_unconfigured")
        } catch {
            XCTFail("unexpected \(error)")
        }
        XCTAssertFalse(provider.hasPersistedSession)
        // No residue: the Clerk session was removed so the next attempt
        // starts a clean ceremony instead of hitting session_exists.
        XCTAssertTrue(transport.requests.contains {
            ($0.url?.absoluteString ?? "").contains("/sessions/sess_1/remove")
        })
    }

    func testFormEncodingEscapesReservedCharacters() {
        let encoded = ClerkAPI.formEncode([("password", "a&b=c d+e😀")])
        XCTAssertEqual(encoded, "password=a%26b%3Dc%20d%2Be%F0%9F%98%80")
    }
}
