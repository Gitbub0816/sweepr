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

// Booking detail. Loads full detail from GET /bookings/:id, seeded with the list
// row's snapshot so the screen renders instantly.
public struct BookingDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let bookingId: String
    @State private var booking: Booking
    @State private var isRefreshing = false

    public init(bookingId: String, initial: Booking) {
        self.bookingId = bookingId
        _booking = State(initialValue: initial)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                statusCard
                if booking.status.isTrackable {
                    NavigationLink(destination: LiveTrackingScreen(booking: booking)) {
                        SweeprButton("Track your cleaner", systemIcon: "location.fill") {}
                            .allowsHitTesting(false)
                    }
                    .buttonStyle(.plain)
                }
                detailsCard
                if let quote = booking.quote { priceCard(quote) }
            }
            .padding(SweeprSpacing.md)
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle(booking.packageDisplayName)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private var statusCard: some View {
        SweeprCard {
            HStack {
                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                    Text("Status").font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    Text(booking.status.displayLabel).font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                }
                Spacer()
                SweeprBadge(status: booking.status)
            }
        }
    }

    private var detailsCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                if let cleaner = booking.cleaner {
                    detailRow("Cleaner", cleaner.displayName)
                }
                if let level = booking.cleaningLevel {
                    detailRow("Level", level.displayLabel)
                }
                if let br = booking.bedrooms, let ba = booking.bathrooms {
                    detailRow("Home", "\(br) bd · \(ba.clean) ba")
                }
                if let addr = booking.address {
                    detailRow("Address", addr.oneLine)
                }
                if let addOns = booking.addOns, !addOns.isEmpty {
                    detailRow("Add-ons", addOns.joined(separator: ", "))
                }
            }
        }
    }

    private func priceCard(_ quote: Quote) -> some View {
        SweeprCard {
            VStack(spacing: SweeprSpacing.sm) {
                priceRow("Subtotal", quote.subtotal)
                priceRow("Level surcharge", quote.levelSurcharge)
                priceRow("Add-ons", quote.addOnsTotal)
                priceRow("Discount", quote.discount)
                Divider().background(SweeprColor.separator)
                priceRow("Total", quote.total, bold: true)
            }
        }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            Spacer()
            Text(value).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                .multilineTextAlignment(.trailing)
        }
    }

    private func priceRow(_ label: String, _ money: Money, bold: Bool = false) -> some View {
        HStack {
            Text(label).font(bold ? SweeprFont.body().weight(.semibold) : SweeprFont.body())
                .foregroundColor(SweeprColor.textPrimary)
            Spacer()
            Text(money.dollarsString)
                .font(bold ? SweeprFont.heading() : SweeprFont.body())
                .foregroundColor(SweeprColor.textPrimary)
        }
    }

    private func load() async {
        do { booking = try await env.api.booking(id: bookingId) }
        catch { /* keep the seeded snapshot */ }
    }
}

private extension Double {
    /// Drops a trailing ".0" so 1.5 -> "1.5" but 2.0 -> "2".
    var clean: String {
        self == rounded() ? String(Int(self)) : String(self)
    }
}
