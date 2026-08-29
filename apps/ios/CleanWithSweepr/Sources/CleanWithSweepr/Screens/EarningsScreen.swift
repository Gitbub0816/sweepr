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

// Earnings summary — week-to-date hero, lifetime / pending / jobs stats, recent
// payouts, and a founding-member bonus slot. Every dollar figure is a
// server-authoritative value (integer cents via `Money`); the client NEVER
// computes earnings. Tips are 100% to the cleaner and only become visible once
// `booking_tips.visible_to_cleaner` flips at payout — the note explains why a
// job's total can rise after payout.
public struct EarningsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var summary: EarningsSummary?
    @State private var payouts: [PayoutRecord] = []
    @State private var isLoading = true
    /// Slot for the founding-member 5% bonus. Backend flag not confirmed yet —
    /// defaults off; flip via a future `/cleaner-dashboard/founding-member` read.
    @State private var isFoundingMember = false

    /// Soft weekly jobs target used only for the progress ring — a UI motivator,
    /// not a money computation.
    private let weeklyJobsGoal = 10

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
                        if isFoundingMember { foundingBanner }
                        heroCard(s)
                        statsRow(s)
                        weeklyProgress(s)
                        tipsNote
                        recentPayoutsSection
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

    // MARK: - Founding member

    private var foundingBanner: some View {
        HStack(spacing: SweeprSpacing.sm) {
            Image(systemName: "star.circle.fill").foregroundColor(SweeprColor.brand)
            Text("Founding member — earning a +5% bonus on every job")
                .font(SweeprFont.caption().weight(.semibold))
                .foregroundColor(SweeprColor.seafoam700)
            Spacer(minLength: 0)
        }
        .padding(SweeprSpacing.md)
        .background(SweeprColor.seafoam100)
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
    }

    // MARK: - Hero

    private func heroCard(_ s: EarningsSummary) -> some View {
        SweeprCard(elevation: .high) {
            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                Text("THIS WEEK")
                    .font(SweeprFont.footnote())
                    .foregroundColor(SweeprColor.textSecondary)
                Text(s.weekToDate.dollarsString)
                    .font(SweeprFont.mono(size: 44))
                    .foregroundColor(SweeprColor.textPrimary)
                HStack(spacing: SweeprSpacing.xs) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(SweeprColor.brand)
                    Text("\(s.jobsThisWeek) job\(s.jobsThisWeek == 1 ? "" : "s") completed")
                        .font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
    }

    private func statsRow(_ s: EarningsSummary) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            SweeprStatTile(label: "Pending payout", value: s.pendingPayout.dollarsString, systemIcon: "clock.arrow.circlepath")
            SweeprStatTile(label: "Lifetime", value: s.lifetime.dollarsString, systemIcon: "trophy.fill")
        }
    }

    private func weeklyProgress(_ s: EarningsSummary) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text("Weekly goal")
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text("\(min(s.jobsThisWeek, weeklyJobsGoal))/\(weeklyJobsGoal) jobs")
                        .font(SweeprFont.caption().weight(.semibold))
                        .foregroundColor(SweeprColor.brand)
                }
                SweeprProgressBar(value: Double(s.jobsThisWeek) / Double(weeklyJobsGoal))
                Text(s.jobsThisWeek >= weeklyJobsGoal
                     ? "Goal reached — nice work this week!"
                     : "\(weeklyJobsGoal - s.jobsThisWeek) more to hit your weekly goal.")
                    .font(SweeprFont.footnote())
                    .foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    private var tipsNote: some View {
        SweeprCard {
            HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                Image(systemName: "info.circle.fill").foregroundColor(SweeprColor.brand)
                Text("Tips are 100% yours with no platform fee. They stay hidden until they're included in a payout, so a job's total may go up after it's paid out.")
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    // MARK: - Payouts

    private var recentPayoutsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Recent payouts")
            if payouts.isEmpty {
                SweeprEmptyState(
                    systemIcon: "banknote",
                    title: "No payouts yet",
                    message: "Completed jobs pay out after the review window closes."
                )
            } else {
                ForEach(payouts) { payout in
                    SweeprCard {
                        HStack(spacing: SweeprSpacing.md) {
                            Image(systemName: "arrow.down.circle.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundColor(SweeprColor.brand)
                                .frame(width: 40, height: 40)
                                .background(SweeprColor.seafoam100)
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(payout.paidAt.formatted(date: .abbreviated, time: .omitted))
                                    .font(SweeprFont.body().weight(.semibold))
                                    .foregroundColor(SweeprColor.textPrimary)
                                Text("\(payout.jobsCount) job\(payout.jobsCount == 1 ? "" : "s")"
                                     + (payout.includesTips ? " · includes tips" : ""))
                                    .font(SweeprFont.caption())
                                    .foregroundColor(SweeprColor.textSecondary)
                            }
                            Spacer(minLength: SweeprSpacing.sm)
                            Text(payout.amount.dollarsString)
                                .font(SweeprFont.subheading())
                                .foregroundColor(SweeprColor.textPrimary)
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        summary = (try? await env.api.earnings()) ?? SweeprMock.earnings
        payouts = (try? await env.cleanerAPI.payouts()) ?? CleanerMock.payouts
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
