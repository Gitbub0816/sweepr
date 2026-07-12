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

// Account: membership summary, addresses, payment methods, sign out. Stub rows
// mark where each web feature ports in.
public struct AccountScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var membership: Membership?

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section {
                    if let m = membership, m.active {
                        HStack {
                            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                                Text(m.planName ?? "Sweepr+").font(SweeprFont.body().weight(.semibold))
                                if let credits = m.creditsCents {
                                    Text("\(Money(cents: credits).dollarsString) in credits")
                                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                                }
                            }
                            Spacer()
                            SweeprBadge("Active", tone: .success)
                        }
                    } else {
                        Text("Join Sweepr+ for member pricing").font(SweeprFont.body())
                    }
                }
                Section("Settings") {
                    Label("Addresses", systemImage: "mappin.and.ellipse")
                    Label("Payment methods", systemImage: "creditcard")
                    Label("Notifications", systemImage: "bell")
                }
                Section {
                    // TODO(Clerk): call the injected token provider's sign-out.
                    Label("Sign out", systemImage: "arrow.right.square")
                        .foregroundColor(Color(hex: 0xdc2626))
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Account")
        }
        .task {
            membership = (try? await env.api.membership()) ?? SweeprMock.membership
        }
    }
}
