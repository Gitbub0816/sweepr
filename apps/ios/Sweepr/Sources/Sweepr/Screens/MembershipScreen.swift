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

// Sweepr+ membership — a real-world Stripe subscription that discounts a physical
// cleaning service (NOT an in-app purchase, per App Review 3.1.1). Join opens
// Stripe Checkout in the browser; manage/cancel/resume call the membership API.
// Prices are server-provided integer cents; the client never computes charges.
public struct MembershipScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.openURL) private var openURL

    @State private var info: MembershipInfo?
    @State private var isLoading = true
    @State private var isWorking = false
    @State private var interval: MembershipPlanInterval = .monthly

    public init() {}

    private let benefits: [(icon: String, title: String, detail: String)] = [
        ("percent", "Member pricing", "A standing discount on every cleaning."),
        ("lock.open.rotation", "Free Smart Entry", "Remote unlock is included, every time."),
        ("bolt.fill", "Priority booking", "First pick of the best time windows."),
        ("gift.fill", "Monthly credits", "Credit toward your cleanings each month."),
    ]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                if isLoading {
                    SkeletonBlock(height: 180)
                    SkeletonBlock(height: 220)
                } else {
                    membershipCard
                    benefitsCard
                    if info?.isActive != true {
                        planPicker
                        joinButton
                        billingNote
                    } else {
                        manageSection
                        billingNote
                    }
                }
            }
            .padding(SweeprSpacing.md)
        }
        .scrollIndicators(.hidden)
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Sweepr+")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Cards

    private var membershipCard: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            HStack(alignment: .top) {
                Image(systemName: "star.circle.fill").font(.system(size: 40)).foregroundColor(.white)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sweepr+").font(SweeprFont.title()).foregroundColor(.white)
                    if let d = info?.pricing.discountPercent {
                        Text("Save \(d)% on every cleaning")
                            .font(SweeprFont.body()).foregroundColor(.white.opacity(0.95))
                    }
                }
                Spacer(minLength: 0)
                if info?.isActive == true {
                    SweeprBadge(info?.cancelAtPeriodEnd == true ? "Ending soon" : "Active",
                                tone: info?.cancelAtPeriodEnd == true ? .warning : .success)
                }
            }
            if let end = info?.currentPeriodEnd {
                HStack(spacing: SweeprSpacing.sm) {
                    Image(systemName: "calendar").foregroundColor(.white.opacity(0.9))
                    Text(info?.cancelAtPeriodEnd == true
                         ? "Benefits end \(end.formatted(date: .abbreviated, time: .omitted))"
                         : "Renews \(end.formatted(date: .abbreviated, time: .omitted))")
                        .font(SweeprFont.caption()).foregroundColor(.white.opacity(0.9))
                }
            }
        }
        .padding(SweeprSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [SweeprColor.seafoam600, SweeprColor.seafoam700],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
        .sweeprElevation(.medium)
        .accessibilityElement(children: .combine)
    }

    private var benefitsCard: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("What you get")
                ForEach(benefits, id: \.title) { b in
                    HStack(spacing: SweeprSpacing.md) {
                        Image(systemName: b.icon)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(SweeprColor.brand)
                            .frame(width: 36, height: 36)
                            .background(SweeprColor.seafoam100)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(b.title).font(SweeprFont.body().weight(.semibold))
                                .foregroundColor(SweeprColor.textPrimary)
                            Text(b.detail).font(SweeprFont.caption())
                                .foregroundColor(SweeprColor.textSecondary)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private var planPicker: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Choose a plan")
            if let p = info?.pricing {
                SweeprChoiceRow(
                    title: "Monthly",
                    subtitle: p.monthly.map { "\($0.dollarsString) billed monthly" },
                    isSelected: interval == .monthly
                ) { interval = .monthly }
                SweeprChoiceRow(
                    title: "Annual",
                    subtitle: p.annual.map { "\($0.dollarsString) billed yearly" },
                    trailing: "Best value", isSelected: interval == .annual
                ) { interval = .annual }
            }
        }
    }

    private var joinButton: some View {
        SweeprButton(isWorking ? "Opening checkout…" : "Join Sweepr+", systemIcon: "star.fill", isLoading: isWorking) {
            Task { await join() }
        }
        .disabled(isWorking)
    }

    private var manageSection: some View {
        VStack(spacing: SweeprSpacing.sm) {
            if info?.cancelAtPeriodEnd == true {
                SweeprButton("Resume membership", systemIcon: "arrow.clockwise", isLoading: isWorking) {
                    Task { await resume() }
                }
                .disabled(isWorking)
            } else {
                SweeprButton("Cancel membership", style: .destructive, isLoading: isWorking) {
                    Task { await cancel() }
                }
                .disabled(isWorking)
            }
        }
    }

    private var billingNote: some View {
        HStack(alignment: .top, spacing: SweeprSpacing.sm) {
            Image(systemName: "info.circle").foregroundColor(SweeprColor.textSecondary)
            Text("Sweepr+ is a subscription to a real-world cleaning service, billed securely "
                 + "through Stripe. Manage or cancel anytime here or on getsweepr.com.")
                .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
        }
        .padding(.top, SweeprSpacing.xs)
    }

    // MARK: - Actions

    private func load() async {
        info = try? await env.api.membershipInfo()
        isLoading = false
    }

    private func join() async {
        isWorking = true
        defer { isWorking = false }
        do {
            if let url = try await env.api.startMembershipCheckout(interval: interval) {
                openURL(url)
            } else {
                env.toast.show("Checkout unavailable right now", kind: .error)
            }
        } catch {
            env.toast.show("Couldn't start checkout", kind: .error)
        }
    }

    private func cancel() async {
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await env.api.cancelMembership()
            env.toast.show("Membership will end at period close", kind: .info)
            await load()
        } catch { env.toast.show("Couldn't cancel", kind: .error) }
    }

    private func resume() async {
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await env.api.resumeMembership()
            env.toast.show("Membership resumed", kind: .success)
            await load()
        } catch { env.toast.show("Couldn't resume", kind: .error) }
    }
}
