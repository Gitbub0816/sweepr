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

// Cleaner account: profile, background check status, payout method, availability.
public struct AccountScreen: View {
    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section("Profile") {
                    Label("Edit profile", systemImage: "person.text.rectangle")
                    Label("Availability", systemImage: "calendar.badge.clock")
                }
                Section("Trust & payouts") {
                    HStack {
                        Label("Background check", systemImage: "checkmark.shield.fill")
                        Spacer()
                        SweeprBadge("Cleared", tone: .success)
                    }
                    Label("Payout method (Stripe Connect)", systemImage: "banknote")
                }
                Section {
                    // TODO(Clerk): sign out via injected token provider.
                    Label("Sign out", systemImage: "arrow.right.square")
                        .foregroundColor(Color(hex: 0xdc2626))
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Account")
        }
    }
}
