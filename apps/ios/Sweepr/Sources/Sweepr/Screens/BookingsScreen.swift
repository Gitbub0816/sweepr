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

// Bookings — a branded Upcoming/Past segmented control, elevated booking cards
// with status badges and a live "Track" affordance on active jobs, swipe-to-
// cancel with a confirmation dialog, and first-class loading / empty / error
// states. Reads the shared BookingStore so it stays in lockstep with Home.
public struct BookingsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var segment: Segment = .upcoming
    @State private var pendingCancel: Booking?

    enum Segment: String, CaseIterable, Identifiable, Hashable {
        case upcoming = "Upcoming"
        case past = "Past"
        var id: String { rawValue }
    }

    public init() {}

    private var store: BookingStore { env.bookingStore }

    private var rows: [Booking] {
        segment == .upcoming ? store.upcoming : store.past
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SweeprSegmentedControl(
                    selection: $segment,
                    options: Segment.allCases.map { (value: $0, label: $0.rawValue) }
                )
                .padding(.horizontal, SweeprSpacing.md)
                .padding(.top, SweeprSpacing.sm)
                .padding(.bottom, SweeprSpacing.sm)

                content
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Bookings")
            .refreshable { await store.refresh() }
            .confirmationDialog(
                "Cancel this cleaning?",
                isPresented: Binding(get: { pendingCancel != nil }, set: { if !$0 { pendingCancel = nil } }),
                titleVisibility: .visible
            ) {
                Button("Cancel cleaning", role: .destructive) {
                    if let b = pendingCancel { Task { await cancel(b) } }
                    pendingCancel = nil
                }
                Button("Keep it", role: .cancel) { pendingCancel = nil }
            } message: {
                Text("You can rebook anytime. Refunds follow the cancellation policy.")
            }
        }
        .task { await store.load() }
    }

    @ViewBuilder private var content: some View {
        switch store.state {
        case .loading where store.bookings.isEmpty:
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    ForEach(0..<4, id: \.self) { _ in
                        SweeprCard(elevation: .low) {
                            HStack(spacing: SweeprSpacing.md) {
                                SkeletonBlock(height: 44)
                                    .frame(width: 44)
                                VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                                    SkeletonBlock(height: 14)
                                    SkeletonBlock(height: 12)
                                }
                            }
                        }
                    }
                }
                .padding(SweeprSpacing.md)
            }
            .scrollIndicators(.hidden)
        case .failed where store.bookings.isEmpty:
            ScrollView {
                SweeprErrorState(
                    message: "We couldn't load your bookings. Pull to refresh or try again.",
                    onRetry: { Task { await store.refresh() } }
                )
                .padding(.top, SweeprSpacing.xxl)
            }
            .scrollIndicators(.hidden)
        default:
            if rows.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(rows) { booking in
                        row(booking)
                            .listRowBackground(SweeprColor.background)
                            .listRowSeparator(.hidden)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if booking.status.isActive {
                                    Button(role: .destructive) {
                                        SweeprHaptics.impact(.medium)
                                        pendingCancel = booking
                                    } label: {
                                        Label("Cancel", systemImage: "xmark.circle")
                                    }
                                }
                            }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var emptyState: some View {
        ScrollView {
            SweeprEmptyState(
                systemIcon: segment == .upcoming ? "calendar.badge.plus" : "clock.arrow.circlepath",
                title: segment == .upcoming ? "No upcoming cleanings" : "No past cleanings",
                message: segment == .upcoming
                    ? "When you book a cleaning it'll show up here — with live tracking on the day."
                    : "Your completed cleanings will collect here.",
                actionTitle: segment == .upcoming ? "Book a cleaning" : nil,
                action: segment == .upcoming ? {
                    SweeprHaptics.impact(.medium)
                    tabToBook()
                } : nil
            )
            .padding(.top, SweeprSpacing.xxl)
        }
        .scrollIndicators(.hidden)
    }

    private func row(_ booking: Booking) -> some View {
        NavigationLink(destination: BookingDetailScreen(bookingId: booking.id, initial: booking)) {
            SweeprCard(elevation: .low) {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    HStack(spacing: SweeprSpacing.md) {
                        Image(systemName: booking.status.isActive ? "sparkles" : "checkmark.seal.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(SweeprColor.brand)
                            .frame(width: 44, height: 44)
                            .background(SweeprColor.seafoam100)
                            .clipShape(Circle())
                        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                            Text(booking.packageDisplayName)
                                .font(SweeprFont.body().weight(.semibold))
                                .foregroundColor(SweeprColor.textPrimary)
                            if let when = booking.scheduledAt {
                                Text(when.formatted(date: .abbreviated, time: .shortened))
                                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                            } else if let addr = booking.address {
                                Text(addr.oneLine).font(SweeprFont.caption())
                                    .foregroundColor(SweeprColor.textSecondary).lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                        SweeprBadge(status: booking.status)
                    }
                    if booking.status.isTrackable {
                        SweeprDivider()
                        HStack(spacing: SweeprSpacing.sm) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 12, weight: .bold))
                            Text("Live — track your cleaner")
                                .font(SweeprFont.caption().weight(.semibold))
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold))
                        }
                        .foregroundColor(SweeprColor.brand)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(booking.packageDisplayName), \(booking.status.displayLabel)")
    }

    private func cancel(_ booking: Booking) async {
        do {
            try await store.cancel(id: booking.id)
            env.toast.show("Cleaning cancelled", kind: .success)
        } catch {
            env.toast.show("Couldn't cancel — try again", kind: .error)
        }
    }

    /// Jump to the Book tab. The TabView owns navigation, so surface a nudge and
    /// let the customer tap Book — deep tab selection isn't wired in the shim UI.
    private func tabToBook() {
        env.toast.show("Tap Book to start a new cleaning", kind: .info)
    }
}
