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

// Home: personalized greeting, the next-cleaning hero card with live status +
// track button, quick actions, and a promo strip. Pull-to-refresh reloads both
// the session and bookings. Everything reads from the shared @Observable stores.
public struct HomeScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var membership: MembershipInfo?
    @State private var showBookFlow = false

    public init() {}

    private var store: BookingStore { env.bookingStore }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    header
                    heroSection
                    quickActions
                    promoStrip
                }
                .padding(SweeprSpacing.md)
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
        .task { await loadMembership() }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
            Text(greeting).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            Text("Hi \(env.session.greetingName) 👋")
                .font(SweeprFont.title()).foregroundColor(SweeprColor.textPrimary)
            if let m = membership, m.isActive {
                SweeprBadge("Sweepr+ member", tone: .brand)
            }
        }
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
                SkeletonBlock(height: 150)
                SkeletonBlock(height: 60)
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
            SweeprCard {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Next cleaning").font(SweeprFont.caption())
                                .foregroundColor(SweeprColor.textSecondary)
                            Text(booking.packageDisplayName).font(SweeprFont.heading())
                                .foregroundColor(SweeprColor.textPrimary)
                        }
                        Spacer()
                        SweeprBadge(status: booking.status)
                    }
                    if let when = booking.scheduledAt {
                        Label(when.formatted(date: .abbreviated, time: .shortened),
                              systemImage: "calendar")
                            .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                    }
                    if let addr = booking.address {
                        Label(addr.oneLine, systemImage: "mappin.and.ellipse")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                            .lineLimit(1)
                    }
                    if booking.status.isTrackable {
                        NavigationLink(destination: LiveTrackingScreen(booking: booking)) {
                            HStack {
                                Image(systemName: "location.fill")
                                Text("Track your cleaner").font(SweeprFont.body().weight(.semibold))
                                Spacer()
                                Image(systemName: "chevron.right")
                            }
                            .foregroundColor(.white)
                            .padding(.vertical, 12).padding(.horizontal, SweeprSpacing.md)
                            .background(SweeprColor.brand)
                            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var emptyHero: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Image(systemName: "sparkles")
                    .font(.system(size: 30)).foregroundColor(SweeprColor.brand)
                Text("No cleaning scheduled").font(SweeprFont.heading())
                    .foregroundColor(SweeprColor.textPrimary)
                Text("Book your next cleaning in under a minute.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton("Book a cleaning", systemIcon: "plus.circle.fill") {
                    SweeprHaptics.impact(.medium)
                    showBookFlow = true
                }
            }
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
                    .font(.system(size: 32)).foregroundColor(.white)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Join Sweepr+").font(SweeprFont.body().weight(.bold)).foregroundColor(.white)
                    Text("Member pricing, free Smart Entry, priority booking.")
                        .font(SweeprFont.caption()).foregroundColor(.white.opacity(0.9))
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(.white)
            }
            .padding(SweeprSpacing.md)
            .background(
                LinearGradient(
                    colors: [SweeprColor.seafoam600, SweeprColor.seafoam700],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func loadMembership() async {
        membership = (try? await env.api.membershipInfo()) ?? SweeprMock.membershipInfo
    }
}
