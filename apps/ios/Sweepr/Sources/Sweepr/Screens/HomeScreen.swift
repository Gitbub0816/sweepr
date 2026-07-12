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

// Home: a greeting, the active booking (with a live-tracking entry point), and a
// quick-book call to action. Pull-to-refresh reloads.
public struct HomeScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var bookings: [Booking] = []
    @State private var membership: Membership?
    @State private var isLoading = true

    public init() {}

    private var activeBooking: Booking? {
        bookings.first { $0.status.isActive }
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    header
                    if isLoading {
                        VStack(spacing: SweeprSpacing.sm) {
                            SkeletonBlock(height: 120)
                            SkeletonBlock(height: 80)
                        }
                    } else if let active = activeBooking {
                        activeCard(active)
                    } else {
                        emptyState
                    }
                    quickBook
                }
                .padding(SweeprSpacing.md)
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Sweepr")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
            Text("Welcome back").font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            Text("Your home, handled.").font(SweeprFont.title()).foregroundColor(SweeprColor.textPrimary)
            if let m = membership, m.active, let plan = m.planName {
                SweeprBadge("\(plan) member", tone: .brand)
            }
        }
    }

    private func activeCard(_ booking: Booking) -> some View {
        NavigationLink(destination: BookingDetailScreen(bookingId: booking.id, initial: booking)) {
            SweeprCard {
                VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                    HStack {
                        Text(booking.packageDisplayName).font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.textPrimary)
                        Spacer()
                        SweeprBadge(status: booking.status)
                    }
                    if let addr = booking.address {
                        Text(addr.oneLine).font(SweeprFont.body())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    if booking.status.isTrackable {
                        NavigationLink(destination: LiveTrackingScreen(booking: booking)) {
                            Label("Track your cleaner", systemImage: "location.fill")
                                .font(SweeprFont.caption())
                                .foregroundColor(SweeprColor.brand)
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                Text("No active cleaning").font(SweeprFont.heading())
                    .foregroundColor(SweeprColor.textPrimary)
                Text("Book your next cleaning in under a minute.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    private var quickBook: some View {
        NavigationLink(destination: BookFlowScreen()) {
            SweeprButton("Book a cleaning", systemIcon: "sparkles") {}
                .allowsHitTesting(false)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        isLoading = true
        do {
            async let b = env.api.bookings()
            async let m = env.api.membership()
            bookings = try await b
            membership = try await m
        } catch {
            // Offline / no Clerk session — fall back to mock so the UI is coherent.
            bookings = SweeprMock.bookings
            membership = SweeprMock.membership
        }
        isLoading = false
    }
}
