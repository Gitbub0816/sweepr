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

// Booking detail: a status timeline, a live-tracking map entry point while
// active, an add-services entry point, the Smart Entry access-method card, and a
// tip + review section once completed. Seeded with the list snapshot so it
// renders instantly, then refreshed from GET /bookings/:id.
public struct BookingDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let bookingId: String
    @State private var booking: Booking
    @State private var access: BookingAccessAuthorization?
    @State private var tipSelection: Int?      // cents
    @State private var rating: Int = 0

    public init(bookingId: String, initial: Booking) {
        self.bookingId = bookingId
        _booking = State(initialValue: initial)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                statusCard
                if booking.status.isTrackable {
                    trackButton
                }
                timelineCard
                if booking.status.isActive {
                    addServicesCard
                    accessCard
                }
                detailsCard
                if let quote = booking.quote { priceCard(quote) }
                if booking.status == .completed || booking.status == .completed_pending_review {
                    tipCard
                    reviewCard
                }
            }
            .padding(SweeprSpacing.md)
        }
        .scrollIndicators(.hidden)
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle(booking.packageDisplayName)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    // MARK: - Cards

    private var statusCard: some View {
        SweeprCard {
            HStack {
                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                    Text("Status").font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    Text(booking.status.displayLabel).font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    if let cleaner = booking.cleaner {
                        Text(cleaner.displayName + (cleaner.rating.map { " · ★ \(String(format: "%.1f", $0))" } ?? ""))
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                }
                Spacer()
                SweeprBadge(status: booking.status)
            }
        }
    }

    private var trackButton: some View {
        NavigationLink(destination: LiveTrackingScreen(booking: booking)) {
            SweeprButton("Track your cleaner", systemIcon: "location.fill") {}
                .allowsHitTesting(false)
        }
        .buttonStyle(.plain)
    }

    private var timelineCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Progress")
                SweeprStatusTimeline(current: booking.status)
            }
        }
    }

    private var addServicesCard: some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 24)).foregroundColor(SweeprColor.brand)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Add services").font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Text("Purchase add-ons up until check-in.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(SweeprColor.textSecondary)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                SweeprHaptics.selection()
                env.toast.show("Add-ons open until check-in", kind: .info)
            }
        }
    }

    private var accessCard: some View {
        NavigationLink(destination: SmartEntryScreen(bookingId: bookingId, initialAccess: access)) {
            SweeprCard {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: access?.method?.systemIcon ?? "key.fill")
                        .font(.system(size: 22)).foregroundColor(SweeprColor.brand)
                        .frame(width: 30)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Access method").font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text(access?.method?.displayName ?? "Choose how we get in")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer()
                    if access?.isSmartEntryProvisioned == true {
                        SweeprBadge("Smart Entry", tone: .brand)
                    }
                    Image(systemName: "chevron.right").foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var detailsCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
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
                    detailRow("Add-ons", addOns.map { $0.humanized }.joined(separator: ", "))
                }
                if let when = booking.scheduledAt {
                    detailRow("Scheduled", when.formatted(date: .long, time: .shortened))
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

    // MARK: - Tip & review (completed)

    private var tipCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Add a tip")
                Text("100% of your tip goes to \(booking.cleaner?.firstName ?? "your cleaner").")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                HStack(spacing: SweeprSpacing.sm) {
                    ForEach([500, 1000, 1500, 2000], id: \.self) { cents in
                        tipChip(cents)
                    }
                }
                if tipSelection != nil {
                    SweeprButton("Send tip", systemIcon: "heart.fill") {
                        SweeprHaptics.notify(.success)
                        env.toast.show("Thank you! Tip sent.", kind: .success)
                        tipSelection = nil
                    }
                }
            }
        }
    }

    private func tipChip(_ cents: Int) -> some View {
        let selected = tipSelection == cents
        return Button {
            SweeprHaptics.selection()
            tipSelection = selected ? nil : cents
        } label: {
            Text(Money(cents: cents).dollarsString)
                .font(SweeprFont.body().weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundColor(selected ? .white : SweeprColor.textPrimary)
                .background(selected ? SweeprColor.brand : SweeprColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                        .stroke(selected ? SweeprColor.brand : SweeprColor.separator, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private var reviewCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Rate your cleaning")
                HStack(spacing: SweeprSpacing.sm) {
                    ForEach(1...5, id: \.self) { star in
                        Image(systemName: star <= rating ? "star.fill" : "star")
                            .font(.system(size: 28))
                            .foregroundColor(star <= rating ? SweeprColor.amber : SweeprColor.separator)
                            .onTapGesture {
                                SweeprHaptics.impact(.light)
                                rating = star
                            }
                    }
                }
                if rating > 0 {
                    SweeprButton("Submit review") {
                        SweeprHaptics.notify(.success)
                        env.toast.show("Thanks for the feedback!", kind: .success)
                    }
                }
            }
        }
    }

    // MARK: - Rows

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
        if let updated = await env.bookingStore.refreshDetail(id: bookingId) {
            booking = updated
        }
        access = (try? await env.api.bookingAccess(bookingId: bookingId)) ?? nil
    }
}

private extension Double {
    /// Drops a trailing ".0" so 1.5 -> "1.5" but 2.0 -> "2".
    var clean: String {
        self == rounded() ? String(Int(self)) : String(self)
    }
}

private extension String {
    /// "inside_fridge" -> "Inside fridge".
    var humanized: String {
        let s = replacingOccurrences(of: "_", with: " ")
        return s.prefix(1).uppercased() + s.dropFirst()
    }
}
