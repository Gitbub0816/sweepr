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

// Cleaner account: profile, Didit/Yardstik verification badges, service-area
// entry, availability toggle, sign out.
public struct AccountScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var verification: VerificationStatus = CleanerMock.verification
    @State private var isAvailable = true
    @State private var serviceAreaZip = "80202"
    @State private var isSavingZip = false
    @State private var showSignOutConfirm = false

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section("Profile") {
                    Label("Edit profile", systemImage: "person.text.rectangle")
                    Toggle(isOn: $isAvailable) {
                        Label("Available for jobs", systemImage: "calendar.badge.clock")
                    }
                    .onChange(of: isAvailable) { _, newValue in
                        Task { try? await env.cleanerAPI.setAvailability(newValue) }
                    }
                }

                Section("Service area") {
                    HStack {
                        Label("ZIP code", systemImage: "mappin.and.ellipse")
                        Spacer()
                        TextField("ZIP", text: $serviceAreaZip)
                            #if os(iOS)
                            .keyboardType(.numberPad)
                            #endif
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                    }
                    SweeprButton(isSavingZip ? "Saving…" : "Save service area", style: .secondary) {
                        saveServiceArea()
                    }
                    .disabled(isSavingZip)
                }

                Section("Trust & verification") {
                    HStack {
                        Label("Identity (Didit)", systemImage: "person.badge.shield.checkmark.fill")
                        Spacer()
                        SweeprBadge(verification.diditLabel, tone: tone(for: verification.didit))
                    }
                    HStack {
                        Label("Background check (Yardstik)", systemImage: "checkmark.shield.fill")
                        Spacer()
                        SweeprBadge(verification.yardstikLabel, tone: tone(for: verification.yardstik))
                    }
                    Label("Payout method (Stripe Connect)", systemImage: "banknote")
                }

                Section {
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        Label("Sign out", systemImage: "arrow.right.square")
                            .foregroundColor(Color(hex: 0xdc2626))
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Account")
            .confirmationDialog("Sign out of Clean with Sweepr?", isPresented: $showSignOutConfirm) {
                Button("Sign out", role: .destructive) {
                    // TODO(Clerk): sign out via the injected AuthTokenProvider /
                    // Clerk iOS SDK session teardown.
                }
                Button("Cancel", role: .cancel) {}
            }
            .task { await load() }
        }
    }

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
            try? await env.cleanerAPI.setServiceAreaZip(serviceAreaZip)
            isSavingZip = false
        }
    }

    private func load() async {
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
