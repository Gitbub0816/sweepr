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

// Booking detail — status hero with the privacy-gated cleaner summary, live
// tracking while active, a progress timeline, the Smart Entry access card, a
// server-priced breakdown, and tip + review once completed. Seeded with the
// list snapshot so it renders instantly, then refreshed from GET /bookings/:id
// (which is what carries the address join + add-on keys).
//
// Tips run through the real money path: POST /tips mints the immediate-capture
// intent, the hosted pay page confirms it, and this screen polls
// GET /tips/booking/:id until the webhook settles — nothing is faked.
public struct BookingDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let bookingId: String

    @State private var booking: Booking
    @State private var cleaner: BookingCleanerSummary?
    @State private var access: BookingAccessAuthorization?
    @State private var loadFailed = false

    // Tip flow
    @State private var tipSelection: Int?          // cents
    @State private var tip: TipRecord?
    @State private var isStartingTip = false
    @State private var tipPollTask: Task<Void, Never>?

    // Review flow
    @State private var rating = 0
    @State private var reviewSubmitted = false
    @State private var isSubmittingReview = false

    // Cancel flow
    @State private var showCancelConfirm = false
    @State private var isCancelling = false

    public init(bookingId: String, initial: Booking) {
        self.bookingId = bookingId
        _booking = State(initialValue: initial)
    }

    private var isCompleted: Bool {
        booking.status == .completed || booking.status == .completed_pending_review
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                statusCard
                if loadFailed {
                    offlineBanner
                }
                if booking.status.isTrackable {
                    trackButton
                }
                timelineCard
                if booking.status.isActive && !isCompleted {
                    accessCard
                }
                detailsCard
                if booking.totalPrice != nil {
                    priceCard
                }
                if isCompleted {
                    tipCard
                    reviewCard
                }
                if booking.status.isCustomerCancellable {
                    cancelSection
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
        .onDisappear { tipPollTask?.cancel() }
        .confirmationDialog(
            "Cancel this cleaning?",
            isPresented: $showCancelConfirm,
            titleVisibility: .visible
        ) {
            Button("Cancel cleaning", role: .destructive) {
                Task { await cancelBooking() }
            }
            Button("Keep booking", role: .cancel) {}
        }
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
                if let cleaner {
                    SweeprDivider()
                    HStack(spacing: SweeprSpacing.md) {
                        ZStack {
                            Circle().fill(SweeprColor.seafoam100).frame(width: 44, height: 44)
                            Image(systemName: "person.fill").foregroundColor(SweeprColor.seafoam700)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cleaner.displayName).font(SweeprFont.body().weight(.semibold))
                                .foregroundColor(SweeprColor.textPrimary)
                            Text("Your Sweepr professional")
                                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        }
                        Spacer(minLength: 0)
                        if cleaner.foundingMember == true {
                            SweeprBadge("Founding", tone: .brand)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Your cleaner is \(cleaner.displayName)")
                }
            }
        }
    }

    private var offlineBanner: some View {
        HStack(spacing: SweeprSpacing.sm) {
            Image(systemName: "wifi.slash").foregroundColor(SweeprColor.amber)
            Text("Showing the last loaded details — pull to refresh.")
                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
        }
        .padding(SweeprSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SweeprColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
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
                    if let when = booking.scheduledAt {
                        detailRow("Scheduled", when.formatted(date: .long, time: .shortened))
                    }
                    if let level = booking.cleaningLevel {
                        detailRow("Level", level.displayLabel)
                    }
                    if let home = booking.homeSummary {
                        detailRow("Home", home)
                    }
                    if let addr = booking.addressOneLine {
                        detailRow("Address", addr)
                    }
                    if let addOns = booking.addonKeys, !addOns.isEmpty {
                        detailRow("Add-ons", addOns.map { $0.humanized }.joined(separator: ", "))
                    }
                }
                if let addr = booking.addressOneLine {
                    Button(action: {
                        SweeprHaptics.impact(.light)
                        SweeprMaps.openInMaps(address: addr)
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
    }

    /// Price breakdown from the booking row's server-computed columns.
    private var priceCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Price")
                VStack(spacing: SweeprSpacing.sm) {
                    if let base = booking.basePrice { priceRow("Cleaning", Money(cents: base)) }
                    if let surcharge = booking.cleaningLevelSurchargeCents, surcharge > 0 {
                        priceRow("Level surcharge", Money(cents: surcharge))
                    }
                    if let addOns = booking.addonsTotal, addOns > 0 {
                        priceRow("Add-ons", Money(cents: addOns))
                    }
                    if let fee = booking.serviceFee, fee > 0 { priceRow("Service fee", Money(cents: fee)) }
                    if let smartEntry = booking.smartEntryFeeCents, smartEntry > 0 {
                        priceRow("Smart Entry", Money(cents: smartEntry))
                    }
                    if let discount = booking.sweeprPlusDiscountCents, discount > 0 {
                        priceRow("Sweepr+ discount", Money(cents: -discount))
                    }
                    if let tax = booking.tax, tax > 0 { priceRow("Tax", Money(cents: tax)) }
                    SweeprDivider()
                    if let total = booking.totalMoney { priceRow("Total", total, bold: true) }
                }
                if booking.status.isActive && !isCompleted {
                    Text("Authorized at booking, charged after your cleaning.")
                        .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
    }

    // MARK: - Tip (real money — POST /tips + hosted pay page + webhook poll)

    @ViewBuilder private var tipCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Add a tip")
                if tip?.status == "succeeded" {
                    HStack(spacing: SweeprSpacing.sm) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(SweeprColor.brand)
                        Text("Thank you! 100% of your tip goes to your cleaner.")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                } else if tip?.status == "pending" {
                    HStack(spacing: SweeprSpacing.sm) {
                        ProgressView()
                        Text("Finishing your tip payment…")
                            .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                    }
                } else {
                    Text("100% goes to your cleaner — Sweepr takes nothing.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    HStack(spacing: SweeprSpacing.sm) {
                        ForEach([500, 1000, 1500, 2000], id: \.self) { cents in
                            tipChip(cents)
                        }
                    }
                    if tipSelection != nil {
                        SweeprButton("Continue to payment", systemIcon: "heart.fill", isLoading: isStartingTip) {
                            Task { await startTip() }
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

    private func startTip() async {
        guard let cents = tipSelection else { return }
        isStartingTip = true
        defer { isStartingTip = false }
        do {
            let grant = try await env.api.createTip(bookingId: bookingId, amountCents: cents)
            guard let secret = grant.clientSecret,
                  let url = PayPage.url(clientSecret: secret, kind: .tip, amountCents: cents) else {
                env.toast.show("Couldn't start the tip — try again.", kind: .error)
                return
            }
            SweeprHaptics.impact(.medium)
            SweeprExternal.open(url)
            tip = TipRecord(id: grant.id ?? "pending", amountCents: cents, status: "pending", createdAt: Date())
            startTipPolling()
        } catch {
            let code = (error as? SweeprAPIError)?.serverCode
            if code == "tip_window_closed" {
                env.toast.show("Tips close 3 days after a cleaning.", kind: .warning)
            } else {
                env.toast.show("Couldn't start the tip — try again.", kind: .error)
            }
        }
    }

    /// Poll the tip status while the person pays in the browser; the webhook
    /// settles the row.
    private func startTipPolling() {
        tipPollTask?.cancel()
        tipPollTask = Task {
            for _ in 0..<40 {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if Task.isCancelled { return }
                if let latest = try? await env.api.tipStatus(bookingId: bookingId) {
                    tip = latest
                    if latest.status == "succeeded" {
                        SweeprHaptics.notify(.success)
                        env.toast.show("Tip sent — thank you!", kind: .success)
                        return
                    }
                }
            }
        }
    }

    // MARK: - Review (real POST /reviews)

    private var reviewCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Rate your cleaning")
                if reviewSubmitted {
                    HStack(spacing: SweeprSpacing.sm) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(SweeprColor.brand)
                        Text("Thanks for the feedback!")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                } else {
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
                        SweeprButton("Submit review", isLoading: isSubmittingReview) {
                            Task { await submitReview() }
                        }
                    }
                }
            }
        }
    }

    private func submitReview() async {
        guard let cleanerId = booking.cleanerId else {
            env.toast.show("This booking can't be reviewed yet.", kind: .warning)
            return
        }
        isSubmittingReview = true
        defer { isSubmittingReview = false }
        do {
            try await env.api.submitReview(bookingId: bookingId, cleanerId: cleanerId, rating: rating)
            SweeprHaptics.notify(.success)
            withAnimation(SweeprMotion.snappy) { reviewSubmitted = true }
        } catch {
            if let apiError = error as? SweeprAPIError,
               case let .http(status, _) = apiError, status == 409 {
                // Already reviewed (or not reviewable) — treat as done.
                withAnimation { reviewSubmitted = true }
            } else {
                SweeprHaptics.notify(.error)
                env.toast.show("Couldn't submit your review — try again.", kind: .error)
            }
        }
    }

    // MARK: - Cancel

    private var cancelSection: some View {
        SweeprButton("Cancel cleaning", style: .destructive, systemIcon: "xmark.circle", isLoading: isCancelling) {
            showCancelConfirm = true
        }
    }

    private func cancelBooking() async {
        isCancelling = true
        defer { isCancelling = false }
        do {
            try await env.bookingStore.cancel(id: bookingId)
            if let updated = env.bookingStore.booking(id: bookingId) { booking = updated }
            SweeprHaptics.notify(.success)
            env.toast.show("Cleaning cancelled", kind: .info)
        } catch {
            SweeprHaptics.notify(.error)
            env.toast.show("This booking can no longer be cancelled in-app — contact support.", kind: .error)
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
        do {
            let detail = try await env.api.bookingDetail(id: bookingId)
            booking = detail.booking
            cleaner = detail.cleaner
            loadFailed = false
        } catch {
            loadFailed = true
        }
        access = try? await env.api.bookingAccess(bookingId: bookingId)
        if isCompleted {
            tip = try? await env.api.tipStatus(bookingId: bookingId)
        }
    }
}

private extension String {
    /// "inside_fridge" -> "Inside fridge".
    var humanized: String {
        let s = replacingOccurrences(of: "_", with: " ")
        return s.prefix(1).uppercased() + s.dropFirst()
    }
}
