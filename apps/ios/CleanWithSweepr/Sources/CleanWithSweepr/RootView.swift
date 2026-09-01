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

// Cleaner tab bar: Jobs, Route (map), Earnings, Account. The shared toast
// center is rendered once here so any screen can surface a transient banner.
public struct RootView: View {
    @EnvironmentObject private var env: AppEnvironment

    public init() {}

    public var body: some View {
        TabView {
            JobsScreen()
                .tabItem { Label("Jobs", systemImage: "list.bullet.clipboard.fill") }
                .badge(env.activeJob != nil ? "•" : "")

            RouteScreen()
                .tabItem { Label("Route", systemImage: "map.fill") }

            EarningsScreen()
                .tabItem { Label("Earnings", systemImage: "dollarsign.circle.fill") }

            AccountScreen()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(SweeprColor.brand)
        .sweeprToast(env.toasts)
    }
}

#if DEBUG
struct RootView_Previews: PreviewProvider {
    static var previews: some View {
        RootView().environmentObject(AppEnvironment.preview)
    }
}
#endif
