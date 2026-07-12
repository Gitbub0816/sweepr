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

// Earnings summary — today / week-to-date / lifetime, recent payouts, and a
// founding-member bonus badge slot. Tips are 100% to the cleaner and only
// become visible once `booking_tips.visible_to_cleaner` flips at payout — the
// note below exists so cleaners aren't surprised mid-shift by an invisible tip.
public struct EarningsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var summary: EarningsSummary?
    @State private var payouts: [PayoutRecord] = []
    @State private var todayTotal: Money = Money(cents: 0)
    /// Slot for the founding-member 5% bonus. Backend flag not confirmed yet —
    /// defaults off; flip via a future `/cleaner-dashboard/founding-member` read.
    @State private var isFoundingMember = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    if isFoundingMember {
                        HStack {
                            SweeprBadge("Founding member · +5% bonus", tone: .brand)
                            Spacer()
                        }
                    }
                    if let s = summary {
                        bigStat("Today", todayTotal, subtitle: "Updates as jobs complete")
                        HStack(spacing: SweeprSpacing.md) {
                            smallStat("This week", s.weekToDate)
                            smallStat("Lifetime", s.lifetime)
                        }
                        HStack(spacing: SweeprSpacing.md) {
                            smallStat("Pending payout", s.pendingPayout)
                            SweeprCard {
                                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                                    Text("This week").font(SweeprFont.caption())
                                        .foregroundColor(SweeprColor.textSecondary)
                                    Text("\(s.jobsThisWeek) jobs").font(SweeprFont.heading())
                                        .foregroundColor(SweeprColor.textPrimary)
                                }
                            }
                        }
                    } else {
                        SkeletonBlock(height: 140)
                        SkeletonBlock(height: 90)
                    }

                    tipsNote

                    recentPayoutsSection
                }
                .padding(SweeprSpacing.md)
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Earnings")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private var tipsNote: some View {
        SweeprCard {
            HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                Image(systemName: "info.circle.fill").foregroundColor(SweeprColor.brand)
                Text("Tips are 100% yours with no platform fee. They stay hidden until they're included in a payout, so a job's total may go up after it's paid out.")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    private var recentPayoutsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            Text("Recent payouts").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
            if payouts.isEmpty {
                ContentUnavailableView {
                    Label("No payouts yet", systemImage: "banknote")
                } description: {
                    Text("Completed jobs pay out after the review window.")
                }
            } else {
                ForEach(payouts) { payout in
                    SweeprCard {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(payout.paidAt.formatted(date: .abbreviated, time: .omitted))
                                    .font(SweeprFont.body().weight(.semibold))
                                    .foregroundColor(SweeprColor.textPrimary)
                                Text("\(payout.jobsCount) job\(payout.jobsCount == 1 ? "" : "s")"
                                     + (payout.includesTips ? " · includes tips" : ""))
                                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                            }
                            Spacer()
                            Text(payout.amount.dollarsString).font(SweeprFont.heading())
                                .foregroundColor(SweeprColor.brand)
                        }
                    }
                }
            }
        }
    }

    private func bigStat(_ label: String, _ money: Money, subtitle: String) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                Text(label).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                Text(money.dollarsString)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundColor(SweeprColor.textPrimary)
                Text(subtitle).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    private func smallStat(_ label: String, _ money: Money) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                Text(label).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                Text(money.dollarsString).font(SweeprFont.heading())
                    .foregroundColor(SweeprColor.textPrimary)
            }
        }
    }

    private func load() async {
        summary = (try? await env.api.earnings()) ?? SweeprMock.earnings
        payouts = (try? await env.cleanerAPI.payouts()) ?? CleanerMock.payouts

        let jobs = (try? await env.api.cleanerJobs()) ?? SweeprMock.jobs
        let completedToday = jobs.filter {
            $0.booking.status == .completed
            && $0.booking.scheduledAt.map { Calendar.current.isDateInToday($0) } == true
        }
        let cents = completedToday.reduce(0) { $0 + ($1.payoutEstimate?.cents ?? 0) }
        todayTotal = Money(cents: cents)
    }
}
