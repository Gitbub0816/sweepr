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
#if os(iOS)
import CoreLocation
#endif

// One-shot device position for day-of-service location pings and Smart Entry
// proof-of-presence. The SERVER owns arrival verification (within 150 m it
// flips day_status to arrived) — this only supplies coordinates. iOS-only;
// on other platforms `current()` returns nil and callers degrade gracefully.

public struct DeviceFix: Sendable {
    public let latitude: Double
    public let longitude: Double
    public let accuracyMeters: Double
}

#if os(iOS)
public final class LocationOnce: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    public static let shared = LocationOnce()

    private let manager = CLLocationManager()
    private var continuations: [CheckedContinuation<DeviceFix?, Never>] = []
    private let lock = NSLock()

    override private init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// Requests when-in-use permission if needed and resolves one fix (or nil
    /// on denial/timeout — callers must handle nil, never block the flow).
    public func current() async -> DeviceFix? {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        if status == .denied || status == .restricted { return nil }
        return await withCheckedContinuation { continuation in
            lock.lock()
            continuations.append(continuation)
            lock.unlock()
            manager.requestLocation()
            // Belt-and-braces timeout so a stuck fix never hangs the flow.
            DispatchQueue.global().asyncAfter(deadline: .now() + 12) { [weak self] in
                self?.drain(with: nil)
            }
        }
    }

    private func drain(with fix: DeviceFix?) {
        lock.lock()
        let waiting = continuations
        continuations = []
        lock.unlock()
        for c in waiting { c.resume(returning: fix) }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return drain(with: nil) }
        drain(with: DeviceFix(
            latitude: loc.coordinate.latitude,
            longitude: loc.coordinate.longitude,
            accuracyMeters: max(loc.horizontalAccuracy, 0)
        ))
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        drain(with: nil)
    }
}

public func currentDeviceFix() async -> DeviceFix? {
    await LocationOnce.shared.current()
}
#else
/// Non-iOS (Linux verify; Android until the SKIP location divergence is
/// declared): no fix available.
public func currentDeviceFix() async -> DeviceFix? { nil }
#endif
