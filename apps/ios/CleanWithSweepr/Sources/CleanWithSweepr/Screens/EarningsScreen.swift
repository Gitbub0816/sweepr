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

// Earnings summary — week-to-date, pending payout, lifetime. Tips are 100% to the
// cleaner and become visible at payout (booking_tips.visible_to_cleaner).
public struct EarningsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var summary: EarningsSummary?

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    if let s = summary {
                        bigStat("This week", s.weekToDate, subtitle: "\(s.jobsThisWeek) jobs")
                        HStack(spacing: SweeprSpacing.md) {
                            smallStat("Pending payout", s.pendingPayout)
                            smallStat("Lifetime", s.lifetime)
                        }
                    } else {
                        SkeletonBlock(height: 140)
                        SkeletonBlock(height: 90)
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
    }
}
