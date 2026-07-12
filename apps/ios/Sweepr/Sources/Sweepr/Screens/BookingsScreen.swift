//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import SwiftUI
import SweeprKit

// Bookings list, split into upcoming/active vs past. Tap through to detail.
public struct BookingsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var bookings: [Booking] = []
    @State private var isLoading = true

    public init() {}

    private var active: [Booking] { bookings.filter { $0.status.isActive } }
    private var past: [Booking] { bookings.filter { !$0.status.isActive } }

    public var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: SweeprSpacing.sm) {
                        ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 76) }
                    }
                    .padding(SweeprSpacing.md)
                } else {
                    List {
                        if !active.isEmpty {
                            Section("Upcoming") {
                                ForEach(active) { row($0) }
                            }
                        }
                        if !past.isEmpty {
                            Section("Past") {
                                ForEach(past) { row($0) }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Bookings")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func row(_ booking: Booking) -> some View {
        NavigationLink(destination: BookingDetailScreen(bookingId: booking.id, initial: booking)) {
            HStack(spacing: SweeprSpacing.md) {
                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                    Text(booking.packageDisplayName).font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    if let addr = booking.address {
                        Text(addr.oneLine).font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary).lineLimit(1)
                    }
                }
                Spacer()
                SweeprBadge(status: booking.status)
            }
            .padding(.vertical, 4)
        }
    }

    private func load() async {
        isLoading = true
        do { bookings = try await env.api.bookings() }
        catch { bookings = SweeprMock.bookings }
        isLoading = false
    }
}
