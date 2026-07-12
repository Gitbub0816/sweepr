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

// Account: profile header, Sweepr+ membership card, coupons, addresses, and sign
// out. Reads the shared SessionStore; membership + coupons load on appear.
public struct AccountScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var membership: MembershipInfo?
    @State private var coupons: [Coupon] = []
    @State private var isLoading = true

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    profileHeader
                    membershipCard
                    couponsSection
                    settingsSection
                    signOutButton
                }
                .padding(SweeprSpacing.md)
            }
            .scrollIndicators(.hidden)
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Account")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    // MARK: - Sections

    private var profileHeader: some View {
        HStack(spacing: SweeprSpacing.md) {
            ZStack {
                Circle().fill(SweeprColor.seafoam100).frame(width: 60, height: 60)
                Text(initials).font(SweeprFont.heading()).foregroundColor(SweeprColor.seafoam700)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(env.session.user?.displayName ?? "Guest")
                    .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                if let email = env.session.user?.email {
                    Text(email).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
            }
            Spacer()
        }
    }

    private var initials: String {
        let u = env.session.user
        let f = u?.firstName?.first.map(String.init) ?? "?"
        let l = u?.lastName?.first.map(String.init) ?? ""
        return (f + l).uppercased()
    }

    private var membershipCard: some View {
        NavigationLink(destination: MembershipScreen()) {
            SweeprCard {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: "star.circle.fill")
                        .font(.system(size: 30)).foregroundColor(SweeprColor.seafoam600)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sweepr+").font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text(membership?.isActive == true ? "Member — manage plan"
                             : "Join for member pricing")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer()
                    if membership?.isActive == true {
                        SweeprBadge("Active", tone: .success)
                    }
                    Image(systemName: "chevron.right").foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var couponsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Coupons")
            if isLoading {
                SkeletonBlock(height: 60)
            } else if coupons.isEmpty {
                SweeprCard {
                    Text("No coupons yet. We'll drop offers here.")
                        .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                }
            } else {
                ForEach(coupons) { coupon in
                    couponRow(coupon)
                }
            }
        }
    }

    private func couponRow(_ coupon: Coupon) -> some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "tag.fill")
                    .foregroundColor(SweeprColor.amber)
                    .frame(width: 40, height: 40)
                    .background(Color(hex: 0xfef3c7))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(coupon.title ?? coupon.code).font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    if let d = coupon.description {
                        Text(d).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                }
                Spacer()
                SweeprBadge(coupon.displayValue, tone: .warning)
            }
        }
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Settings")
            settingRow("Addresses", icon: "mappin.and.ellipse")
            settingRow("Payment methods", icon: "creditcard")
            settingRow("Notifications", icon: "bell")
            settingRow("Help & support", icon: "questionmark.circle")
        }
    }

    private func settingRow(_ title: String, icon: String) -> some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: icon).foregroundColor(SweeprColor.brand).frame(width: 26)
                Text(title).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(SweeprColor.textSecondary)
            }
            .contentShape(Rectangle())
            .onTapGesture { SweeprHaptics.selection() }
        }
    }

    private var signOutButton: some View {
        SweeprButton("Sign out", style: .destructive) {
            SweeprHaptics.impact(.medium)
            // TODO(Clerk): call the app's ClerkTokenProvider sign-out, then:
            env.session.clearLocalSession()
            env.toast.show("Signed out", kind: .info)
        }
    }

    private func load() async {
        await env.session.refresh()
        async let m = env.api.membershipInfo()
        async let c = env.api.coupons()
        membership = (try? await m) ?? SweeprMock.membershipInfo
        coupons = (try? await c) ?? SweeprMock.coupons
        isLoading = false
    }
}
