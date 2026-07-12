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

// Sweepr+ membership: status, benefits, join (Stripe Checkout), and
// cancel/resume. Checkout returns a hosted URL we open in the browser.
public struct MembershipScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.openURL) private var openURL

    @State private var info: MembershipInfo?
    @State private var isLoading = true
    @State private var isWorking = false
    @State private var interval: MembershipPlanInterval = .monthly

    public init() {}

    private let benefits: [(icon: String, text: String)] = [
        ("percent", "Member pricing on every cleaning"),
        ("lock.open.rotation", "Free Smart Entry remote unlock"),
        ("bolt.fill", "Priority booking windows"),
        ("gift.fill", "Monthly credits toward cleanings"),
    ]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                if isLoading {
                    SkeletonBlock(height: 160)
                    SkeletonBlock(height: 100)
                } else {
                    membershipCard
                    benefitsCard
                    if info?.isActive != true {
                        planPicker
                        joinButton
                    } else {
                        manageSection
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
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            HStack {
                Image(systemName: "star.circle.fill").font(.system(size: 34)).foregroundColor(.white)
                Text("Sweepr+").font(SweeprFont.title()).foregroundColor(.white)
                Spacer()
                if info?.isActive == true {
                    SweeprBadge(info?.cancelAtPeriodEnd == true ? "Ending soon" : "Active",
                                tone: info?.cancelAtPeriodEnd == true ? .warning : .success)
                }
            }
            if let end = info?.currentPeriodEnd {
                Text(info?.cancelAtPeriodEnd == true
                     ? "Benefits end \(end.formatted(date: .abbreviated, time: .omitted))"
                     : "Renews \(end.formatted(date: .abbreviated, time: .omitted))")
                    .font(SweeprFont.caption()).foregroundColor(.white.opacity(0.9))
            } else if let d = info?.pricing.discountPercent {
                Text("Save \(d)% on every cleaning.")
                    .font(SweeprFont.body()).foregroundColor(.white.opacity(0.95))
            }
        }
        .padding(SweeprSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [SweeprColor.seafoam600, SweeprColor.seafoam700],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
    }

    private var benefitsCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                SweeprSectionTitle("Benefits")
                ForEach(benefits, id: \.text) { b in
                    HStack(spacing: SweeprSpacing.md) {
                        Image(systemName: b.icon).foregroundColor(SweeprColor.brand).frame(width: 26)
                        Text(b.text).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                        Spacer()
                    }
                }
            }
        }
    }

    private var planPicker: some View {
        VStack(spacing: SweeprSpacing.sm) {
            if let p = info?.pricing {
                SweeprChoiceRow(
                    title: "Monthly",
                    subtitle: p.monthly.map { "\($0.dollarsString)/mo" },
                    trailing: nil, isSelected: interval == .monthly
                ) { interval = .monthly }
                SweeprChoiceRow(
                    title: "Annual",
                    subtitle: p.annual.map { "\($0.dollarsString)/yr · best value" },
                    trailing: "Save", isSelected: interval == .annual
                ) { interval = .annual }
            }
        }
    }

    private var joinButton: some View {
        SweeprButton(isWorking ? "Opening checkout…" : "Join Sweepr+", systemIcon: "star.fill") {
            Task { await join() }
        }
        .disabled(isWorking)
    }

    private var manageSection: some View {
        VStack(spacing: SweeprSpacing.sm) {
            if info?.cancelAtPeriodEnd == true {
                SweeprButton("Resume membership", systemIcon: "arrow.clockwise") {
                    Task { await resume() }
                }
                .disabled(isWorking)
            } else {
                SweeprButton("Cancel membership", style: .destructive) {
                    Task { await cancel() }
                }
                .disabled(isWorking)
            }
        }
    }

    // MARK: - Actions

    private func load() async {
        info = (try? await env.api.membershipInfo()) ?? SweeprMock.membershipInfo
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
