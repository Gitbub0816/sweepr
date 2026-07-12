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

// Bookings: a segmented Upcoming/Past control, status badges, and swipe-to-cancel
// on active bookings. Reads the shared BookingStore.
public struct BookingsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var segment: Segment = .upcoming
    @State private var pendingCancel: Booking?

    enum Segment: String, CaseIterable, Identifiable {
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
                Picker("View", selection: $segment) {
                    ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(SweeprSpacing.md)
                .onChange(of: segment) { _, _ in SweeprHaptics.selection() }

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
        case .loading:
            VStack(spacing: SweeprSpacing.sm) {
                ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 76) }
            }
            .padding(SweeprSpacing.md)
            Spacer()
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
        VStack(spacing: SweeprSpacing.md) {
            Spacer()
            Image(systemName: segment == .upcoming ? "calendar.badge.plus" : "clock.arrow.circlepath")
                .font(.system(size: 40)).foregroundColor(SweeprColor.textSecondary)
            Text(segment == .upcoming ? "No upcoming cleanings" : "No past cleanings")
                .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
            if segment == .upcoming {
                NavigationLink(destination: BookFlowScreen()) {
                    SweeprButton("Book a cleaning", systemIcon: "plus") {}
                        .allowsHitTesting(false)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, SweeprSpacing.xl)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func row(_ booking: Booking) -> some View {
        NavigationLink(destination: BookingDetailScreen(bookingId: booking.id, initial: booking)) {
            SweeprCard {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: "sparkles")
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 40, height: 40)
                        .background(SweeprColor.seafoam100)
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                        Text(booking.packageDisplayName).font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        if let when = booking.scheduledAt {
                            Text(when.formatted(date: .abbreviated, time: .shortened))
                                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        } else if let addr = booking.address {
                            Text(addr.oneLine).font(SweeprFont.caption())
                                .foregroundColor(SweeprColor.textSecondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    SweeprBadge(status: booking.status)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func cancel(_ booking: Booking) async {
        do {
            try await store.cancel(id: booking.id)
            env.toast.show("Cleaning cancelled", kind: .success)
        } catch {
            env.toast.show("Couldn't cancel — try again", kind: .error)
        }
    }
}
