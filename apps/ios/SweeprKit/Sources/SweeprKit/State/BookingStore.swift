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
import Observation

// BookingStore — the customer's bookings with explicit loading/error states.
// `@Observable` (iOS 26 / SKIP SkipModel). Every screen that shows bookings reads
// from one shared store so Home, Bookings, and Detail stay consistent, and every
// network failure degrades to `SweeprMock` so the UI is never blank.

@MainActor
@Observable
public final class BookingStore {
    public enum LoadState: Equatable, Sendable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    public private(set) var bookings: [Booking] = []
    public private(set) var state: LoadState = .idle
    /// True while a background refresh runs but stale data is already on screen.
    public private(set) var isRefreshing = false

    private let api: SweeprAPI

    public init(api: SweeprAPI) {
        self.api = api
    }

    // MARK: - Derived slices

    public var upcoming: [Booking] {
        bookings.filter { $0.status.isActive }
            .sorted { ($0.scheduledAt ?? .distantFuture) < ($1.scheduledAt ?? .distantFuture) }
    }

    public var past: [Booking] {
        bookings.filter { !$0.status.isActive }
            .sorted { ($0.scheduledAt ?? .distantPast) > ($1.scheduledAt ?? .distantPast) }
    }

    /// The soonest active booking — drives the Home hero card.
    public var nextBooking: Booking? { upcoming.first }

    public func booking(id: String) -> Booking? {
        bookings.first { $0.id == id }
    }

    // MARK: - Loading

    /// Full load with a skeleton (used on first appearance).
    public func load() async {
        if bookings.isEmpty { state = .loading }
        await fetch()
    }

    /// Pull-to-refresh: keep current rows visible while refetching.
    public func refresh() async {
        isRefreshing = true
        await fetch()
        isRefreshing = false
    }

    private func fetch() async {
        do {
            bookings = try await api.bookings()
            state = .loaded
        } catch {
            if bookings.isEmpty { bookings = SweeprMock.bookings }
            state = .failed(String(describing: error))
        }
    }

    /// Refresh a single booking's detail (merges into the list).
    @discardableResult
    public func refreshDetail(id: String) async -> Booking? {
        do {
            let updated = try await api.booking(id: id)
            upsert(updated)
            return updated
        } catch {
            return booking(id: id)
        }
    }

    /// Cancel a booking, then reflect the returned status locally.
    public func cancel(id: String) async throws {
        let updated = try await api.cancelBooking(id: id)
        upsert(updated)
    }

    private func upsert(_ booking: Booking) {
        if let idx = bookings.firstIndex(where: { $0.id == booking.id }) {
            bookings[idx] = booking
        } else {
            bookings.append(booking)
        }
    }
}
