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

// Account — profile header, Sweepr+ card, coupons, grouped settings, a privacy &
// legal section (Privacy Policy, Terms, Support), and a danger zone with sign-out
// and an in-app account-deletion flow (App Store Guideline 5.1.1(v)). Reads the
// shared SessionStore; membership + coupons load on appear.
public struct AccountScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.openURL) private var openURL
    @State private var membership: MembershipInfo?
    @State private var coupons: [Coupon] = []
    @State private var isLoading = true

    private let privacyURL = URL(string: "https://legal.getsweepr.com/privacy")
    private let termsURL = URL(string: "https://legal.getsweepr.com/terms")
    private let supportURL = URL(string: "https://getsweepr.com/help")

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    profileHeader
                    membershipCard
                    couponsSection
                    settingsSection
                    legalSection
                    dangerZone
                    versionFooter
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
                Circle().fill(SweeprColor.seafoam100).frame(width: 64, height: 64)
                Text(initials).font(SweeprFont.heading()).foregroundColor(SweeprColor.seafoam700)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(env.session.user?.displayName ?? "Guest")
                    .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                if let email = env.session.user?.email {
                    Text(email).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private var initials: String {
        let u = env.session.user
        let f = u?.firstName?.first.map(String.init) ?? "?"
        let l = u?.lastName?.first.map(String.init) ?? ""
        return (f + l).uppercased()
    }

    private var membershipCard: some View {
        NavigationLink(destination: MembershipScreen()) {
            SweeprCard(elevation: .low) {
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
                    Spacer(minLength: 0)
                    if membership?.isActive == true {
                        SweeprBadge("Active", tone: .success)
                    }
                    Image(systemName: "chevron.right").foregroundColor(SweeprColor.separator)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var couponsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Coupons")
            if isLoading {
                SweeprCard(elevation: .low) { SkeletonBlock(height: 44) }
            } else if coupons.isEmpty {
                SweeprCard(elevation: .low) {
                    HStack(spacing: SweeprSpacing.md) {
                        Image(systemName: "tag").foregroundColor(SweeprColor.textSecondary)
                        Text("No coupons yet. We'll drop offers here.")
                            .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                        Spacer(minLength: 0)
                    }
                }
            } else {
                ForEach(coupons) { coupon in
                    couponRow(coupon)
                }
            }
        }
    }

    private func couponRow(_ coupon: Coupon) -> some View {
        SweeprCard(elevation: .low) {
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
                Spacer(minLength: 0)
                SweeprBadge(coupon.displayValue, tone: .warning)
            }
        }
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Settings")
            SweeprCard(elevation: .low) {
                VStack(spacing: SweeprSpacing.xs) {
                    SweeprListRow(title: "Addresses", systemIcon: "mappin.and.ellipse") {
                        env.toast.show("Manage addresses during booking", kind: .info)
                    }
                    SweeprDivider(inset: 52)
                    SweeprListRow(title: "Payment methods", systemIcon: "creditcard") {
                        env.toast.show("Payment methods are managed at checkout", kind: .info)
                    }
                    SweeprDivider(inset: 52)
                    SweeprListRow(title: "Notifications", systemIcon: "bell") {
                        env.toast.show("Notification settings coming soon", kind: .info)
                    }
                }
            }
        }
    }

    private var legalSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Privacy & support")
            SweeprCard(elevation: .low) {
                VStack(spacing: SweeprSpacing.xs) {
                    SweeprListRow(title: "Help & support", systemIcon: "questionmark.circle") {
                        if let u = supportURL { openURL(u) }
                    }
                    SweeprDivider(inset: 52)
                    SweeprListRow(title: "Privacy Policy", systemIcon: "hand.raised") {
                        if let u = privacyURL { openURL(u) }
                    }
                    SweeprDivider(inset: 52)
                    SweeprListRow(title: "Terms of Service", systemIcon: "doc.text") {
                        if let u = termsURL { openURL(u) }
                    }
                }
            }
        }
    }

    private var dangerZone: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Account")
            SweeprButton("Sign out", style: .secondary, systemIcon: "rectangle.portrait.and.arrow.right") {
                SweeprHaptics.impact(.medium)
                // TODO(Clerk): call the app's ClerkTokenProvider sign-out, then:
                env.session.clearLocalSession()
                env.toast.show("Signed out", kind: .info)
            }
            NavigationLink(destination: DeleteAccountView()) {
                HStack(spacing: SweeprSpacing.sm) {
                    Image(systemName: "trash")
                    Text("Delete account").font(SweeprFont.body().weight(.semibold))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold))
                }
                .foregroundColor(Color(hex: 0xdc2626))
                .padding(.vertical, 14)
                .padding(.horizontal, SweeprSpacing.md)
                .frame(maxWidth: .infinity)
                .background(Color(hex: 0xfee2e2))
                .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
            }
            .buttonStyle(SweeprPressableButtonStyle())
            .accessibilityLabel("Delete account")
        }
    }

    private var versionFooter: some View {
        Text("Sweepr for iOS")
            .font(SweeprFont.footnote())
            .foregroundColor(SweeprColor.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.top, SweeprSpacing.sm)
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

// MARK: - Delete account flow (App Store Guideline 5.1.1(v))

/// A deliberate, confirm-by-typing account deletion flow. Calls
/// `POST /account/delete` (`SweeprAPI.requestAccountDeletion`), which HARD-deletes
/// the account and all associated data and removes the Clerk identity. The user
/// must type their exact account email to enable the destructive action — the
/// backend re-verifies the same, so a client bypass still fails server-side.
struct DeleteAccountView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var confirmEmail = ""
    @State private var isWorking = false
    @State private var showConfirm = false

    private var accountEmail: String? { env.session.user?.email }

    private var emailMatches: Bool {
        guard let email = accountEmail else { return false }
        return confirmEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == email.lowercased()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                warningCard
                consequences
                confirmField
                deleteButton
            }
            .padding(SweeprSpacing.md)
        }
        .scrollIndicators(.hidden)
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Permanently delete your account?",
            isPresented: $showConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete everything", role: .destructive) {
                Task { await performDelete() }
            }
            Button("Keep my account", role: .cancel) {}
        } message: {
            Text("This cannot be undone. Your account, bookings, and personal data will be permanently erased.")
        }
    }

    private var warningCard: some View {
        SweeprCard(elevation: .low) {
            HStack(alignment: .top, spacing: SweeprSpacing.md) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 22)).foregroundColor(SweeprColor.amber)
                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                    Text("This is permanent").font(SweeprFont.subheading())
                        .foregroundColor(SweeprColor.textPrimary)
                    Text("Deleting your account erases your profile, bookings, addresses, and "
                         + "history. It can't be recovered.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
    }

    private var consequences: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                consequenceRow("person.crop.circle.badge.xmark", "Your sign-in and profile are removed")
                consequenceRow("calendar.badge.minus", "Upcoming and past bookings are deleted")
                consequenceRow("mappin.slash", "Saved addresses and preferences are erased")
                consequenceRow("star.slash", "Any active Sweepr+ membership ends")
            }
        }
    }

    private func consequenceRow(_ icon: String, _ text: String) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            Image(systemName: icon).foregroundColor(SweeprColor.textSecondary).frame(width: 26)
            Text(text).font(SweeprFont.caption()).foregroundColor(SweeprColor.textPrimary)
            Spacer(minLength: 0)
        }
    }

    private var confirmField: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
            Text("Type your account email to confirm")
                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            if let email = accountEmail {
                Text(email).font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
            }
            TextField("you@example.com", text: $confirmEmail)
                .padding(SweeprSpacing.md)
                .background(SweeprColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                        .stroke(emailMatches ? SweeprColor.brand : SweeprColor.separator,
                                lineWidth: emailMatches ? 2 : 1)
                )
        }
    }

    private var deleteButton: some View {
        SweeprButton(isWorking ? "Deleting…" : "Delete my account", style: .destructive, isLoading: isWorking) {
            SweeprHaptics.notify(.warning)
            showConfirm = true
        }
        .disabled(isWorking || !emailMatches)
    }

    private func performDelete() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let resp = try await env.api.requestAccountDeletion(confirmEmail: confirmEmail
                .trimmingCharacters(in: .whitespacesAndNewlines))
            if resp.ok {
                SweeprHaptics.notify(.success)
                env.session.clearLocalSession()
                env.toast.show("Your account has been deleted", kind: .success)
                dismiss()
            } else {
                env.toast.show("Couldn't delete account — try again", kind: .error)
            }
        } catch {
            SweeprHaptics.notify(.error)
            env.toast.show("Couldn't delete account — check your connection", kind: .error)
        }
    }
}
