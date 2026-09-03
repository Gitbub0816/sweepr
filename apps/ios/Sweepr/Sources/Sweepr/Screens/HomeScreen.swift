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

// Home — the customer's launchpad. A warm personalized greeting, a next-cleaning
// hero that reads like a live status card (with a prominent Track affordance), a
// row of quick actions, a Sweepr+ upsell, and a peek at recent cleanings.
// Everything reads from the shared @Observable stores; pull-to-refresh reloads
// session + bookings + membership. Empty, loading, and error states are all
// first-class. Money is never computed here — the server owns totals.
public struct HomeScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var membership: MembershipInfo?
    @State private var showBookFlow = false
    @State private var appeared = false

    public init() {}

    private var store: BookingStore { env.bookingStore }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    header
                    heroSection
                    quickActions
                    if let m = membership, m.isActive != true {
                        promoStrip
                    } else if membership == nil {
                        promoStrip
                    }
                    recentSection
                }
                .padding(SweeprSpacing.md)
                .opacity(appeared ? 1 : 0)
                .scaleEffect(appeared ? 1 : 0.98)
                .animation(SweeprMotion.smooth, value: appeared)
            }
            .scrollIndicators(.hidden)
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Sweepr")
            .refreshable {
                await env.session.refresh()
                await store.refresh()
                await loadMembership()
            }
            .navigationDestination(isPresented: $showBookFlow) { BookFlowScreen() }
        }
        .task {
            await loadMembership()
            appeared = true
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top, spacing: SweeprSpacing.md) {
            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                Text(greeting)
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                Text("Hi \(env.session.greetingName) 👋")
                    .font(SweeprFont.largeTitle())
                    .foregroundColor(SweeprColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if let m = membership, m.isActive {
                    SweeprBadge("Sweepr+ member", tone: .brand)
                }
            }
            Spacer(minLength: 0)
            NavigationLink(destination: AccountScreen()) {
                avatar
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Account")
        }
    }

    private var avatar: some View {
        ZStack {
            Circle().fill(SweeprColor.seafoam100).frame(width: 44, height: 44)
            Text(initials)
                .font(SweeprFont.body().weight(.bold))
                .foregroundColor(SweeprColor.seafoam700)
        }
    }

    private var initials: String {
        let u = env.session.user
        let f = u?.firstName?.first.map(String.init) ?? "?"
        let l = u?.lastName?.first.map(String.init) ?? ""
        return (f + l).uppercased()
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        default: return "Good evening"
        }
    }

    // MARK: - Hero

    @ViewBuilder private var heroSection: some View {
        switch store.state {
        case .loading:
            VStack(spacing: SweeprSpacing.sm) {
                SkeletonBlock(height: 168)
                HStack(spacing: SweeprSpacing.sm) {
                    SkeletonBlock(height: 84)
                    SkeletonBlock(height: 84)
                    SkeletonBlock(height: 84)
                }
            }
            .accessibilityLabel("Loading your next cleaning")
        case .failed where store.bookings.isEmpty:
            SweeprCard(elevation: .low) {
                SweeprErrorState(
                    message: "We couldn't reach Sweepr. Check your connection and try again.",
                    onRetry: { Task { await store.refresh() } }
                )
            }
        default:
            if let next = store.nextBooking {
                heroCard(next)
            } else {
                emptyHero
            }
        }
    }

    private func heroCard(_ booking: Booking) -> some View {
        NavigationLink(destination: BookingDetailScreen(bookingId: booking.id, initial: booking)) {
            SweeprCard(elevation: .medium) {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("NEXT CLEANING")
                                .font(SweeprFont.footnote())
                                .foregroundColor(SweeprColor.textSecondary)
                            Text(booking.packageDisplayName)
                                .font(SweeprFont.heading())
                                .foregroundColor(SweeprColor.textPrimary)
                        }
                        Spacer(minLength: SweeprSpacing.sm)
                        SweeprBadge(status: booking.status)
                    }

                    VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                        if let when = booking.scheduledAt {
                            infoRow("calendar", when.formatted(date: .abbreviated, time: .shortened))
                        }
                        if let home = booking.homeSummary {
                            infoRow("house.fill", home)
                        }
                        if let level = booking.cleaningLevel {
                            infoRow("sparkles", level.displayLabel)
                        }
                    }

                    if booking.status.isTrackable {
                        trackPill(booking)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Next cleaning, \(booking.packageDisplayName), \(booking.status.displayLabel)")
    }

    private func infoRow(_ icon: String, _ text: String) -> some View {
        HStack(spacing: SweeprSpacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(SweeprColor.brand)
                .frame(width: 18)
            Text(text)
                .font(SweeprFont.body())
                .foregroundColor(SweeprColor.textSecondary)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
    }

    private func trackPill(_ booking: Booking) -> some View {
        NavigationLink(destination: LiveTrackingScreen(booking: booking)) {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: "location.fill")
                Text("Track your cleaner").font(SweeprFont.body().weight(.semibold))
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold))
            }
            .foregroundColor(.white)
            .padding(.vertical, 12)
            .padding(.horizontal, SweeprSpacing.md)
            .background(
                LinearGradient(colors: [SweeprColor.seafoam500, SweeprColor.seafoam700],
                               startPoint: .leading, endPoint: .trailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .accessibilityLabel("Track your cleaner")
    }

    private var emptyHero: some View {
        SweeprCard(elevation: .low) {
            SweeprEmptyState(
                systemIcon: "sparkles",
                title: "No cleaning scheduled",
                message: "Book your next cleaning in under a minute — pick a time, we handle the rest.",
                actionTitle: "Book a cleaning",
                action: {
                    SweeprHaptics.impact(.medium)
                    showBookFlow = true
                }
            )
        }
    }

    // MARK: - Quick actions

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Quick actions")
            HStack(spacing: SweeprSpacing.md) {
                SweeprQuickAction("Book again", systemIcon: "arrow.clockwise") {
                    showBookFlow = true
                }
                NavigationLink(destination: AccountScreen()) {
                    SweeprQuickAction("Coupons", systemIcon: "tag.fill", tint: SweeprColor.amber) {}
                        .allowsHitTesting(false)
                }
                .buttonStyle(.plain)
                NavigationLink(destination: MembershipScreen()) {
                    SweeprQuickAction("Sweepr+", systemIcon: "star.fill", tint: SweeprColor.seafoam600) {}
                        .allowsHitTesting(false)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Promo strip

    private var promoStrip: some View {
        NavigationLink(destination: MembershipScreen()) {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "star.circle.fill")
                    .font(.system(size: 34)).foregroundColor(.white)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Join Sweepr+").font(SweeprFont.subheading()).foregroundColor(.white)
                    Text("Member pricing, free Smart Entry, priority booking.")
                        .font(SweeprFont.caption()).foregroundColor(.white.opacity(0.92))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundColor(.white.opacity(0.9))
            }
            .padding(SweeprSpacing.md)
            .background(
                LinearGradient(
                    colors: [SweeprColor.seafoam600, SweeprColor.seafoam700],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
            .sweeprElevation(.low)
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .accessibilityLabel("Join Sweepr plus for member pricing and free Smart Entry")
    }

    // MARK: - Recent

    @ViewBuilder private var recentSection: some View {
        let recent = Array(store.past.prefix(2))
        if !recent.isEmpty {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                SweeprSectionTitle("Recent cleanings")
                ForEach(recent) { booking in
                    NavigationLink(destination: BookingDetailScreen(bookingId: booking.id, initial: booking)) {
                        SweeprCard(elevation: .low) {
                            HStack(spacing: SweeprSpacing.md) {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundColor(SweeprColor.brand)
                                    .frame(width: 40, height: 40)
                                    .background(SweeprColor.seafoam100)
                                    .clipShape(Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(booking.packageDisplayName)
                                        .font(SweeprFont.body().weight(.semibold))
                                        .foregroundColor(SweeprColor.textPrimary)
                                    if let when = booking.scheduledAt {
                                        Text(when.formatted(date: .abbreviated, time: .omitted))
                                            .font(SweeprFont.caption())
                                            .foregroundColor(SweeprColor.textSecondary)
                                    }
                                }
                                Spacer(minLength: 0)
                                SweeprBadge(status: booking.status)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func loadMembership() async {
        // nil (unknown) keeps the Sweepr+ upsell visible; never a mock state.
        membership = try? await env.api.membershipInfo()
    }
}
