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
    @State private var progress: OnboardingProgress?
    @State private var slots: [AvailabilitySlot] = []
    @State private var isSavingSlots = false
    @State private var area: ServiceArea?
    @State private var radiusMiles = 15
    @State private var isSavingArea = false
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

    // MARK: - Weekly availability (PUT /cleaner-dashboard/availability)

    private static let dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private var availabilityCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(spacing: SweeprSpacing.md) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.brand.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Weekly availability")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text("Days you're open to offers (\(activeDaysLabel)).")
                            .font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer(minLength: 0)
                }
                HStack(spacing: SweeprSpacing.sm) {
                    ForEach(0..<7, id: \.self) { day in
                        dayChip(day)
                    }
                }
                SweeprButton(isSavingSlots ? "Saving…" : "Save availability", style: .secondary, isLoading: isSavingSlots) {
                    saveAvailability()
                }
                .disabled(isSavingSlots)
            }
        }
    }

    private var activeDaysLabel: String {
        let active = slots.filter(\.active).map { Self.dayNames[$0.dayOfWeek % 7] }
        return active.isEmpty ? "none yet" : active.joined(separator: " ")
    }

    private func dayChip(_ day: Int) -> some View {
        let isOn = slots.first(where: { $0.dayOfWeek == day })?.active ?? false
        return Button {
            SweeprHaptics.selection()
            toggleDay(day)
        } label: {
            Text(Self.dayNames[day])
                .font(SweeprFont.footnote().weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .foregroundColor(isOn ? .white : SweeprColor.textSecondary)
                .background(isOn ? SweeprColor.brand : SweeprColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(isOn ? SweeprColor.brand : SweeprColor.separator, lineWidth: 1)
                )
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .accessibilityLabel("\(Self.dayNames[day]) \(isOn ? "available" : "unavailable")")
    }

    private func toggleDay(_ day: Int) {
        if let idx = slots.firstIndex(where: { $0.dayOfWeek == day }) {
            slots[idx].active.toggle()
        } else {
            slots.append(AvailabilitySlot(dayOfWeek: day, startTime: "08:00", endTime: "18:00", active: true))
        }
    }

    // MARK: - Service area (PUT /cleaner-dashboard/service-area)

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
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Service area")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text(area?.label ?? (area == nil ? "Not set — jobs match to your area" : "Centered on your saved location"))
                            .font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer(minLength: 0)
                }
                HStack {
                    Text("Radius").font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Stepper("\(radiusMiles) mi", value: $radiusMiles, in: 1...100, step: 5)
                        .fixedSize()
                }
                SweeprButton(
                    isSavingArea ? "Saving…" : "Center on my location & save",
                    style: .secondary, systemIcon: "location.fill", isLoading: isSavingArea
                ) {
                    saveServiceArea()
                }
                .disabled(isSavingArea)
            }
        }
    }

    // MARK: - Onboarding / verification (GET /cleaners/onboarding-progress)

    private var verificationCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    SweeprSectionTitle("Trust & verification")
                    Spacer()
                    if let p = progress {
                        SweeprBadge(
                            p.status == "approved" ? "Approved"
                                : p.status == "pending_review" ? "Under review" : "In progress",
                            tone: p.status == "approved" ? .success
                                : p.status == "pending_review" ? .warning : .neutral
                        )
                    }
                }
                if let steps = progress?.steps {
                    verificationRow("Profile", systemIcon: "person.crop.circle.fill", done: steps.profile)
                    SweeprDivider()
                    verificationRow("Identity check", systemIcon: "person.badge.shield.checkmark.fill", done: steps.identity)
                    SweeprDivider()
                    verificationRow("Background check", systemIcon: "checkmark.shield.fill", done: steps.background)
                    SweeprDivider()
                    verificationRow("Training", systemIcon: "graduationcap.fill", done: steps.training)
                    SweeprDivider()
                    verificationRow("Insurance on file", systemIcon: "cross.case.fill", done: steps.insurance)
                } else {
                    Text("Verification status loads when you're online.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
    }

    private func verificationRow(_ title: String, systemIcon: String, done: Bool) -> some View {
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
            SweeprBadge(done ? "Done" : "Needed", tone: done ? .success : .warning)
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

    private func saveAvailability() {
        isSavingSlots = true
        Task {
            do {
                try await env.cleanerAPI.setAvailability(slots)
                env.toasts.show("Availability saved", kind: .success)
            } catch {
                env.toasts.show("Couldn't save availability", kind: .error)
            }
            isSavingSlots = false
        }
    }

    private func saveServiceArea() {
        isSavingArea = true
        Task {
            // Center on the device's position (the natural "my area" anchor);
            // fall back to the previously saved center.
            let fix = await currentDeviceFix()
            let lat = fix?.latitude ?? area?.centerLat
            let lng = fix?.longitude ?? area?.centerLng
            guard let lat, let lng else {
                env.toasts.show("Turn on location access so we can center your area.", kind: .warning)
                isSavingArea = false
                return
            }
            do {
                try await env.cleanerAPI.setServiceArea(centerLat: lat, centerLng: lng, radiusMiles: radiusMiles)
                env.toasts.show("Service area saved", kind: .success)
                area = ServiceArea(centerLat: lat, centerLng: lng, radiusMiles: Double(radiusMiles), label: area?.label)
            } catch {
                env.toasts.show("Couldn't save service area", kind: .error)
            }
            isSavingArea = false
        }
    }

    private func signOut() {
        Task {
            // Revokes the broker session and wipes the keychain; the root
            // view flips to the auth wall on the phase change.
            await env.session.signOut()
            env.toasts.show("Signed out", kind: .info)
        }
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
                // The server removed the Clerk identity; clear the broker
                // session + keychain so the device forgets too.
                await env.session.signOut()
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
        progress = try? await env.cleanerAPI.onboardingProgress()
        slots = (try? await env.cleanerAPI.availability()) ?? slots
        if let loaded = try? await env.cleanerAPI.serviceArea() {
            area = loaded
            radiusMiles = Int(loaded.radiusMiles.rounded())
        }
    }
}

#if DEBUG
struct AccountScreen_Previews: PreviewProvider {
    static var previews: some View {
        AccountScreen().environmentObject(AppEnvironment.preview)
    }
}
#endif
