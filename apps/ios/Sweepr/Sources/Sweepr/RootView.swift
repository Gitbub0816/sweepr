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

// Root DoorDash-style tab bar. Four tabs: Home, Book, Bookings, Account.
public struct RootView: View {
    @EnvironmentObject private var env: AppEnvironment

    public init() {}

    public var body: some View {
        TabView {
            HomeScreen()
                .tabItem { Label("Home", systemImage: "house.fill") }

            BookFlowScreen()
                .tabItem { Label("Book", systemImage: "plus.circle.fill") }

            BookingsScreen()
                .tabItem { Label("Bookings", systemImage: "calendar") }

            AccountScreen()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
    }
}

#if DEBUG
struct RootView_Previews: PreviewProvider {
    static var previews: some View {
        RootView().environmentObject(AppEnvironment.preview)
    }
}
#endif
