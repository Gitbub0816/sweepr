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
#if canImport(Security)
import Security
#endif

// TokenVault — durable, private storage for the two credentials the app holds:
// the broker app-session token (what keeps you signed in across launches) and
// the Clerk client token (device identity during the sign-in ceremony).
//
// On Apple platforms this is the Keychain (kSecClassGenericPassword,
// AfterFirstUnlockThisDeviceOnly: survives relaunch/reboot, never leaves the
// device, excluded from backups-to-other-devices). On platforms without
// Security.framework (Linux verify build; Android via SKIP, where UserDefaults
// transpiles to SharedPreferences inside the app sandbox) it falls back to
// UserDefaults. Values are opaque random tokens — revocable server-side at any
// time via broker logout, which bounds the damage of any local disclosure.

public protocol TokenVault: Sendable {
    func get(_ key: TokenVaultKey) -> String?
    func set(_ key: TokenVaultKey, _ value: String)
    func remove(_ key: TokenVaultKey)
}

public enum TokenVaultKey: String, CaseIterable, Sendable {
    case brokerSessionToken = "com.getsweepr.broker_session"
    case clerkClientToken = "com.getsweepr.clerk_client"
}

public enum TokenVaults {
    /// The strongest storage available on this platform.
    public static func platformDefault() -> TokenVault {
        #if canImport(Security)
        return KeychainTokenVault()
        #else
        return UserDefaultsTokenVault()
        #endif
    }

    /// iOS Keychain items SURVIVE app deletion, so a broker session from a
    /// previous install (or an old test account) silently signs back in after
    /// a delete-and-reinstall — no login wall, and everything saves to that
    /// stale account. Call once at startup, before any sign-in phase decision:
    /// UserDefaults IS erased on uninstall, so a missing marker means this is
    /// the first run of a fresh install — wipe any leftover credentials so a
    /// reinstall lands on the auth wall like people expect. Normal launches
    /// and app updates keep the marker, so sessions persist as designed.
    public static func wipeOnFreshInstall(_ vault: TokenVault, defaults: UserDefaults = .standard) {
        let marker = "com.getsweepr.install_marker"
        guard defaults.object(forKey: marker) == nil else { return }
        for key in TokenVaultKey.allCases { vault.remove(key) }
        defaults.set(true, forKey: marker)
    }
}

#if canImport(Security)
/// Keychain-backed vault. Errors degrade to nil/no-op: a keychain hiccup must
/// never crash sign-in — the worst case is re-authenticating.
public struct KeychainTokenVault: TokenVault {
    private let service = "com.getsweepr.auth"
    public init() {}

    private func baseQuery(_ key: TokenVaultKey) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
    }

    public func get(_ key: TokenVaultKey) -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func set(_ key: TokenVaultKey, _ value: String) {
        let data = Data(value.utf8)
        var add = baseQuery(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update: [String: Any] = [kSecValueData as String: data]
            SecItemUpdate(baseQuery(key) as CFDictionary, update as CFDictionary)
        }
    }

    public func remove(_ key: TokenVaultKey) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }
}
#endif

/// UserDefaults-backed vault — Linux verify builds and Android (SKIP maps
/// UserDefaults to app-sandboxed SharedPreferences). @unchecked because
/// UserDefaults is documented thread-safe but corelibs-foundation hasn't
/// annotated it Sendable yet.
public final class UserDefaultsTokenVault: TokenVault, @unchecked Sendable {
    private let defaults: UserDefaults
    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public func get(_ key: TokenVaultKey) -> String? {
        defaults.string(forKey: key.rawValue)
    }
    public func set(_ key: TokenVaultKey, _ value: String) {
        defaults.set(value, forKey: key.rawValue)
    }
    public func remove(_ key: TokenVaultKey) {
        defaults.removeObject(forKey: key.rawValue)
    }
}

/// In-memory vault for unit tests and previews.
public final class MemoryTokenVault: TokenVault, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [TokenVaultKey: String] = [:]
    public init() {}

    public func get(_ key: TokenVaultKey) -> String? {
        lock.lock(); defer { lock.unlock() }
        return store[key]
    }
    public func set(_ key: TokenVaultKey, _ value: String) {
        lock.lock(); defer { lock.unlock() }
        store[key] = value
    }
    public func remove(_ key: TokenVaultKey) {
        lock.lock(); defer { lock.unlock() }
        store[key] = nil
    }
}
