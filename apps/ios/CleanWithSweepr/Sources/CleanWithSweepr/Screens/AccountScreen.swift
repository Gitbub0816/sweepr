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
#if os(iOS)
import UIKit
#endif

// Cleaner account: profile, availability, service area, Didit/Yardstik
// verification, support & privacy links, sign out, and — per App Store
// Guideline 5.1.1(v) — an in-app account-deletion flow that hard-deletes the
// account server-side after an email-confirmation check.
public struct AccountScreen: View {
    @EnvironmentObject private var env: AppEnvironment

    @State private var user: CurrentUser?
    @State private var verification: VerificationStatus = CleanerMock.verification
    @State private var isAvailable = true
    @State private var serviceAreaZip = "80202"
    @State private var isSavingZip = false
    @State private var showSignOutConfirm = false

    // Delete-account flow
    @State private var showDeleteFlow = false
    @State private var deleteConfirmEmail = ""
    @State private var isDeleting = false

    private let privacyURL = "https://legal.getsweepr.com/privacy"
    private let supportURL = "mailto:support@getsweepr.com"

    public init() {}

    private var accountEmail: String { user?.email ?? "" }
    private var canDelete: Bool {
        !accountEmail.isEmpty
            && deleteConfirmEmail.trimmingCharacters(in: .whitespaces).lowercased() == accountEmail.lowercased()
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    profileHeader
                    availabilityCard
                    serviceAreaCard
                    verificationCard
                    supportCard
                    accountCard
                    dangerZone
                    Text("Clean with Sweepr")
                        .font(SweeprFont.footnote())
                        .foregroundColor(SweeprColor.textSecondary)
                        .padding(.top, SweeprSpacing.sm)
                }
                .padding(SweeprSpacing.md)
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Account")
            .confirmationDialog("Sign out of Clean with Sweepr?", isPresented: $showSignOutConfirm) {
                Button("Sign out", role: .destructive) { signOut() }
                Button("Cancel", role: .cancel) {}
            }
            .task { await load() }
        }
    }

    // MARK: - Profile

    private var profileHeader: some View {
        SweeprCard(elevation: .medium) {
            HStack(spacing: SweeprSpacing.md) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [SweeprColor.seafoam500, SweeprColor.seafoam700],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 60, height: 60)
                    Text(initials)
                        .font(SweeprFont.heading())
                        .foregroundColor(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(displayName)
                        .font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    if !accountEmail.isEmpty {
                        Text(accountEmail)
                            .font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary)
                            .lineLimit(1)
                    }
                    SweeprBadge("Cleaner", tone: .brand)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var displayName: String {
        let f = user?.firstName ?? ""
        let l = user?.lastName ?? ""
        let name = "\(f) \(l)".trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? "Your profile" : name
    }
    private var initials: String {
        let f = user?.firstName?.first.map(String.init) ?? ""
        let l = user?.lastName?.first.map(String.init) ?? ""
        let s = "\(f)\(l)"
        return s.isEmpty ? "S" : s.uppercased()
    }

    // MARK: - Availability

    private var availabilityCard: some View {
        SweeprCard {
            Toggle(isOn: $isAvailable) {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.brand.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Available for jobs")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text(isAvailable ? "You're visible for new offers." : "You won't receive new offers.")
                            .font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                }
            }
            .onChange(of: isAvailable) { _, newValue in
                SweeprHaptics.selection()
                Task { try? await env.cleanerAPI.setAvailability(newValue) }
            }
        }
    }

    // MARK: - Service area

    private var serviceAreaCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.brand.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Text("Service area")
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    TextField("ZIP", text: $serviceAreaZip)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                }
                SweeprButton(isSavingZip ? "Saving…" : "Save service area", style: .secondary, isLoading: isSavingZip) {
                    saveServiceArea()
                }
                .disabled(isSavingZip)
            }
        }
    }

    // MARK: - Verification

    private var verificationCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                SweeprSectionTitle("Trust & verification")
                verificationRow("Identity (Didit)", systemIcon: "person.badge.shield.checkmark.fill",
                                 label: verification.diditLabel, state: verification.didit)
                SweeprDivider()
                verificationRow("Background check (Yardstik)", systemIcon: "checkmark.shield.fill",
                                 label: verification.yardstikLabel, state: verification.yardstik)
                SweeprDivider()
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: "banknote.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.brand.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Text("Payout method (Stripe Connect)")
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    SweeprBadge("Connected", tone: .success)
                }
            }
        }
    }

    private func verificationRow(_ title: String, systemIcon: String, label: String, state: VerificationStatus.State) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            Image(systemName: systemIcon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(SweeprColor.brand)
                .frame(width: 36, height: 36)
                .background(SweeprColor.brand.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            Text(title)
                .font(SweeprFont.body().weight(.semibold))
                .foregroundColor(SweeprColor.textPrimary)
            Spacer(minLength: SweeprSpacing.sm)
            SweeprBadge(label, tone: tone(for: state))
        }
    }

    // MARK: - Support

    private var supportCard: some View {
        SweeprCard {
            VStack(spacing: 0) {
                SweeprListRow(title: "Help & support", subtitle: "Reach the Sweepr team",
                              systemIcon: "questionmark.circle.fill") {
                    openURL(supportURL)
                }
                SweeprDivider(inset: 52)
                SweeprListRow(title: "Privacy policy", systemIcon: "hand.raised.fill") {
                    openURL(privacyURL)
                }
            }
        }
    }

    // MARK: - Account

    private var accountCard: some View {
        SweeprCard {
            SweeprListRow(title: "Sign out", systemIcon: "arrow.right.square.fill",
                          tint: SweeprColor.textSecondary, showsChevron: false) {
                showSignOutConfirm = true
            }
        }
    }

    // MARK: - Danger zone (account deletion)

    private var dangerZone: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                if !showDeleteFlow {
                    Button {
                        SweeprHaptics.impact(.light)
                        withAnimation(SweeprMotion.snappy) {
                            deleteConfirmEmail = ""
                            showDeleteFlow = true
                        }
                    } label: {
                        HStack(spacing: SweeprSpacing.md) {
                            Image(systemName: "trash.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(Color(hex: 0xdc2626))
                                .frame(width: 36, height: 36)
                                .background(Color(hex: 0xdc2626).opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Delete account")
                                    .font(SweeprFont.body().weight(.semibold))
                                    .foregroundColor(Color(hex: 0xdc2626))
                                Text("Permanently remove your account and data")
                                    .font(SweeprFont.caption())
                                    .foregroundColor(SweeprColor.textSecondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SweeprPressableButtonStyle())
                } else {
                    deleteFlow
                }
            }
        }
    }

    private var deleteFlow: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Color(hex: 0xdc2626))
                Text("Delete your account")
                    .font(SweeprFont.heading())
                    .foregroundColor(SweeprColor.textPrimary)
            }
            Text("This permanently deletes your account and all associated data (jobs, payouts history, and profile). This cannot be undone.")
                .font(SweeprFont.caption())
                .foregroundColor(SweeprColor.textSecondary)
            Text(accountEmail.isEmpty
                 ? "Type your account email to confirm."
                 : "Type \(accountEmail) to confirm.")
                .font(SweeprFont.footnote())
                .foregroundColor(SweeprColor.textSecondary)
            TextField("Confirm email", text: $deleteConfirmEmail)
                #if os(iOS)
                .keyboardType(.emailAddress)
                #endif
                .padding(SweeprSpacing.sm)
                .background(SweeprColor.background)
                .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                        .stroke(SweeprColor.separator, lineWidth: 1)
                )
            HStack(spacing: SweeprSpacing.sm) {
                SweeprButton("Cancel", style: .secondary) {
                    withAnimation(SweeprMotion.snappy) {
                        showDeleteFlow = false
                        deleteConfirmEmail = ""
                    }
                }
                SweeprButton(isDeleting ? "Deleting…" : "Delete forever", style: .destructive, isLoading: isDeleting) {
                    deleteAccount()
                }
                .disabled(!canDelete || isDeleting)
            }
        }
    }

    // MARK: - Actions

    private func tone(for state: VerificationStatus.State) -> SweeprBadge.Tone {
        switch state {
        case .cleared: return .success
        case .pending: return .warning
        case .actionNeeded: return .danger
        case .notStarted: return .neutral
        }
    }

    private func saveServiceArea() {
        isSavingZip = true
        Task {
            do {
                try await env.cleanerAPI.setServiceAreaZip(serviceAreaZip)
                env.toasts.show("Service area saved", kind: .success)
            } catch {
                env.toasts.show("Couldn't save service area", kind: .error)
            }
            isSavingZip = false
        }
    }

    private func signOut() {
        // TODO(Clerk): sign out via the injected AuthTokenProvider / Clerk iOS
        // SDK session teardown.
        env.toasts.show("Signed out", kind: .info)
    }

    private func deleteAccount() {
        guard canDelete else { return }
        isDeleting = true
        SweeprHaptics.impact(.heavy)
        Task {
            do {
                try await env.cleanerAPI.requestAccountDeletion(confirmEmail: deleteConfirmEmail.trimmingCharacters(in: .whitespaces))
                env.toasts.show("Your account has been deleted.", kind: .success)
                showDeleteFlow = false
                // TODO(Clerk): tear down the local session after deletion.
                signOut()
            } catch {
                env.toasts.show("We couldn't delete your account. Please try again or contact support.", kind: .error)
            }
            isDeleting = false
        }
    }

    private func openURL(_ string: String) {
        SweeprHaptics.selection()
        #if os(iOS)
        if let url = URL(string: string) { UIApplication.shared.open(url) }
        #endif
    }

    private func load() async {
        user = try? await env.api.currentUser()
        verification = (try? await env.cleanerAPI.verificationStatus()) ?? CleanerMock.verification
    }
}

#if DEBUG
struct AccountScreen_Previews: PreviewProvider {
    static var previews: some View {
        AccountScreen().environmentObject(AppEnvironment.preview)
    }
}
#endif
