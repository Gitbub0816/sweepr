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

// Earnings — fed by GET /cleaner-dashboard/earnings (audited shape: thisWeek /
// thisMonth / lastMonth / allTime / pendingPayout / nextPayoutDate /
// stripeConnected / onboardingUrl / recent / tips). Every dollar figure is a
// server-authoritative value in integer cents; the client NEVER computes
// earnings. If Stripe Connect isn't set up yet, the payout-setup card takes
// over the top of the screen — without it nothing can be paid out.
public struct EarningsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var summary: EarningsSummary?
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var isOpeningStripe = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    if isLoading {
                        SkeletonBlock(height: 150)
                        SkeletonBlock(height: 90)
                        SkeletonBlock(height: 120)
                    } else if let s = summary {
                        if !s.stripeConnected {
                            payoutSetupCard(s)
                        }
                        heroCard(s)
                        statsRow(s)
                        if let next = s.nextPayoutDate {
                            nextPayoutNote(next)
                        }
                        tipsCard(s)
                        recentPayoutsSection(s)
                    } else {
                        SweeprErrorState(
                            message: "We couldn't load your earnings. Pull down to try again.",
                            onRetry: { Task { await load() } }
                        )
                    }
                }
                .padding(SweeprSpacing.md)
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Earnings")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    // MARK: - Stripe Connect onboarding (payouts can't flow without it)

    private func payoutSetupCard(_ s: EarningsSummary) -> some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(spacing: SweeprSpacing.sm) {
                    Image(systemName: "banknote.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(SweeprColor.amber)
                    Text("Set up payouts").font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                }
                Text("Connect your bank through Stripe to receive your earnings. Takes about two minutes.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton("Connect with Stripe", systemIcon: "arrow.up.right.square", isLoading: isOpeningStripe) {
                    Task { await openStripeOnboarding() }
                }
            }
        }
    }

    private func openStripeOnboarding() async {
        isOpeningStripe = true
        defer { isOpeningStripe = false }
        do {
            if let url = try await env.cleanerAPI.stripeConnectOnboardingURL() {
                SweeprExternal.open(url)
            } else {
                env.toasts.show("Couldn't open Stripe setup — try again.", kind: .error)
            }
        } catch {
            env.toasts.show("Couldn't open Stripe setup — try again.", kind: .error)
        }
    }

    // MARK: - Hero

    private func heroCard(_ s: EarningsSummary) -> some View {
        SweeprCard(elevation: .high) {
            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                Text("THIS WEEK")
                    .font(SweeprFont.footnote())
                    .foregroundColor(SweeprColor.textSecondary)
                Text(s.thisWeekMoney.dollarsString)
                    .font(SweeprFont.mono(size: 44))
                    .foregroundColor(SweeprColor.textPrimary)
                HStack(spacing: SweeprSpacing.xs) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(SweeprColor.brand)
                    Text("This month: \(Money(cents: s.thisMonth).dollarsString) · Last month: \(Money(cents: s.lastMonth).dollarsString)")
                        .font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
    }

    private func statsRow(_ s: EarningsSummary) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            SweeprStatTile(label: "Pending payout", value: s.pendingMoney.dollarsString, systemIcon: "clock.arrow.circlepath")
            SweeprStatTile(label: "Lifetime", value: s.allTimeMoney.dollarsString, systemIcon: "trophy.fill")
        }
    }

    private func nextPayoutNote(_ next: Date) -> some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: "calendar.badge.clock").foregroundColor(SweeprColor.brand)
                Text("Next payout scheduled \(next.formatted(date: .abbreviated, time: .omitted)).")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                Spacer(minLength: 0)
            }
        }
    }

    private func tipsCard(_ s: EarningsSummary) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Label("Tips", systemImage: "heart.fill")
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text("This month: \(Money(cents: s.tipsThisMonth ?? 0).dollarsString)")
                        .font(SweeprFont.caption().weight(.semibold))
                        .foregroundColor(SweeprColor.brand)
                }
                Text("Tips are 100% yours with no platform fee. They stay hidden until they're included in a payout, so a job's total may go up after it's paid out.")
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    // MARK: - Payouts

    private func recentPayoutsSection(_ s: EarningsSummary) -> some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Recent payouts")
            if s.recent.isEmpty {
                SweeprEmptyState(
                    systemIcon: "banknote",
                    title: "No payouts yet",
                    message: "Completed jobs pay out after the review window closes."
                )
            } else {
                ForEach(Array(s.recent.enumerated()), id: \.offset) { _, payout in
                    SweeprCard {
                        HStack(spacing: SweeprSpacing.md) {
                            Image(systemName: "arrow.down.circle.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundColor(SweeprColor.brand)
                                .frame(width: 40, height: 40)
                                .background(SweeprColor.seafoam100)
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(payout.date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? "Processing")
                                    .font(SweeprFont.body().weight(.semibold))
                                    .foregroundColor(SweeprColor.textPrimary)
                                if let status = payout.status {
                                    Text(status.capitalized)
                                        .font(SweeprFont.caption())
                                        .foregroundColor(SweeprColor.textSecondary)
                                }
                            }
                            Spacer(minLength: SweeprSpacing.sm)
                            Text(Money(cents: payout.amount ?? 0).dollarsString)
                                .font(SweeprFont.subheading())
                                .foregroundColor(SweeprColor.textPrimary)
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = summary == nil
        do {
            summary = try await env.cleanerAPI.earnings()
            loadFailed = false
        } catch {
            // Keep the last real summary if any; empty + failed shows the
            // retryable error state. Never fabricate money figures.
            loadFailed = true
        }
        isLoading = false
    }
}

#if DEBUG
struct EarningsScreen_Previews: PreviewProvider {
    static var previews: some View {
        EarningsScreen().environmentObject(AppEnvironment.preview)
    }
}
#endif
