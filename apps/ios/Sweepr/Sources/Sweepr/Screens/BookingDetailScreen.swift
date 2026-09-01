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
import MapKit
import SweeprKit

// Booking detail — a status hero with the assigned cleaner, a live-tracking entry
// while active, a vertical progress timeline, a location map card with an
// Open-in-Maps handoff, the Smart Entry access card, add-ons entry, a price
// breakdown, and a tip + review section once completed. Seeded with the list
// snapshot so it renders instantly, then refreshed from GET /bookings/:id.
public struct BookingDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let bookingId: String
    @State private var booking: Booking
    @State private var access: BookingAccessAuthorization?
    @State private var tipSelection: Int?      // cents
    @State private var rating: Int = 0
    @State private var tipSent = false

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
                if let coord = homeCoordinate {
                    locationCard(coord)
                }
                if booking.status.isActive {
                    accessCard
                    addServicesCard
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

    private var homeCoordinate: CLLocationCoordinate2D? {
        guard let a = booking.address, let lat = a.latitude, let lon = a.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    // MARK: - Cards

    private var statusCard: some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                        Text("STATUS").font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                        Text(booking.status.displayLabel).font(SweeprFont.title())
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                    Spacer(minLength: 0)
                    SweeprBadge(status: booking.status)
                }
                if let cleaner = booking.cleaner {
                    SweeprDivider()
                    HStack(spacing: SweeprSpacing.md) {
                        ZStack {
                            Circle().fill(SweeprColor.seafoam100).frame(width: 44, height: 44)
                            Image(systemName: "person.fill").foregroundColor(SweeprColor.seafoam700)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cleaner.displayName).font(SweeprFont.body().weight(.semibold))
                                .foregroundColor(SweeprColor.textPrimary)
                            HStack(spacing: SweeprSpacing.sm) {
                                if let r = cleaner.rating {
                                    Text("★ \(String(format: "%.1f", r))")
                                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.amber)
                                }
                                if let jobs = cleaner.completedJobs {
                                    Text("\(jobs) cleanings")
                                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Your cleaner is \(cleaner.displayName)")
                }
            }
        }
    }

    private var trackButton: some View {
        NavigationLink(destination: LiveTrackingScreen(booking: booking)) {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: "location.fill")
                Text("Track your cleaner").font(SweeprFont.body().weight(.semibold))
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, SweeprSpacing.md)
            .background(
                LinearGradient(colors: [SweeprColor.seafoam500, SweeprColor.seafoam700],
                               startPoint: .leading, endPoint: .trailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
            .sweeprElevation(.low)
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .accessibilityLabel("Track your cleaner on the map")
    }

    private var timelineCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Progress")
                SweeprStatusTimeline(current: booking.status)
            }
        }
    }

    private func locationCard(_ coord: CLLocationCoordinate2D) -> some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Location")
                MapPreview(
                    coordinate: coord,
                    systemIcon: "house.fill",
                    tint: SweeprColor.brand,
                    title: "Home",
                    height: 150,
                    cornerRadius: SweeprRadius.button
                )
                .accessibilityHidden(true)
                if let addr = booking.address {
                    Text(addr.oneLine).font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                Button(action: {
                    SweeprHaptics.impact(.light)
                    SweeprMaps.openInMaps(latitude: coord.latitude, longitude: coord.longitude,
                                          label: booking.address?.street)
                }) {
                    HStack(spacing: SweeprSpacing.sm) {
                        Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                        Text("Open in Maps").font(SweeprFont.body().weight(.semibold))
                    }
                    .foregroundColor(SweeprColor.brand)
                }
                .buttonStyle(SweeprPressableButtonStyle())
                .accessibilityLabel("Open the address in Maps")
            }
        }
    }

    private var addServicesCard: some View {
        SweeprCard(elevation: .low) {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 22, weight: .semibold)).foregroundColor(SweeprColor.brand)
                    .frame(width: 36, height: 36)
                    .background(SweeprColor.seafoam100)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Add services").font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Text("Purchase add-ons up until check-in.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundColor(SweeprColor.separator)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                SweeprHaptics.selection()
                env.toast.show("Add-ons stay open until check-in", kind: .info)
            }
        }
    }

    private var accessCard: some View {
        NavigationLink(destination: SmartEntryScreen(bookingId: bookingId, initialAccess: access)) {
            SweeprCard(elevation: .low) {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: access?.method?.systemIcon ?? "key.fill")
                        .font(.system(size: 17, weight: .semibold)).foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.seafoam100)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Access method").font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text(access?.method?.displayName ?? "Choose how we get in")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer(minLength: 0)
                    if access?.isSmartEntryProvisioned == true {
                        SweeprBadge("Smart Entry", tone: .brand)
                    }
                    Image(systemName: "chevron.right").foregroundColor(SweeprColor.separator)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var detailsCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Details")
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
    }

    private func priceCard(_ quote: Quote) -> some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Price")
                VStack(spacing: SweeprSpacing.sm) {
                    priceRow("Subtotal", quote.subtotal)
                    priceRow("Level surcharge", quote.levelSurcharge)
                    priceRow("Add-ons", quote.addOnsTotal)
                    if quote.discount.cents != 0 { priceRow("Discount", quote.discount) }
                    SweeprDivider()
                    priceRow("Total", quote.total, bold: true)
                }
                Text("Authorized at booking, charged after your cleaning.")
                    .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    // MARK: - Tip & review (completed)

    private var tipCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Add a tip")
                Text("100% of your tip goes to \(booking.cleaner?.firstName ?? "your cleaner").")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                if tipSent {
                    HStack(spacing: SweeprSpacing.sm) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(SweeprColor.brand)
                        Text("Thank you! Your tip is on the way.")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                } else {
                    HStack(spacing: SweeprSpacing.sm) {
                        ForEach([500, 1000, 1500, 2000], id: \.self) { cents in
                            tipChip(cents)
                        }
                    }
                    if tipSelection != nil {
                        SweeprButton("Send tip", systemIcon: "heart.fill") {
                            SweeprHaptics.notify(.success)
                            env.toast.show("Thank you! Tip sent.", kind: .success)
                            withAnimation(SweeprMotion.snappy) { tipSent = true }
                            tipSelection = nil
                        }
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
                        .stroke(selected ? SweeprColor.brand : SweeprColor.separator, lineWidth: selected ? 2 : 1)
                )
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .accessibilityLabel("Tip \(Money(cents: cents).dollarsString)")
    }

    private var reviewCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Rate your cleaning")
                HStack(spacing: SweeprSpacing.sm) {
                    ForEach(1...5, id: \.self) { star in
                        Image(systemName: star <= rating ? "star.fill" : "star")
                            .font(.system(size: 30))
                            .foregroundColor(star <= rating ? SweeprColor.amber : SweeprColor.separator)
                            .onTapGesture {
                                SweeprHaptics.impact(.light)
                                withAnimation(SweeprMotion.snappy) { rating = star }
                            }
                            .accessibilityLabel("\(star) star\(star == 1 ? "" : "s")")
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
            Spacer(minLength: SweeprSpacing.md)
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
