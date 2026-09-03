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

// Root of the customer app. The auth wall gates the tabs: a persisted broker
// session (Keychain) opens the app instantly — the profile and bookings load
// in the background — while a fresh install lands on the native welcome /
// sign-in flow. Broker revocation flips the phase back here automatically.
public struct RootView: View {
    @EnvironmentObject private var env: AppEnvironment

    public init() {}

    public var body: some View {
        Group {
            switch env.session.phase {
            case .unknown:
                // One frame at most: bootstrap() decides from local state.
                SweeprColor.background.ignoresSafeArea()
            case .signedOut:
                AuthFlowView(engine: env.authEngine, branding: .customer) {
                    await env.session.didSignIn()
                    await env.bookingStore.load()
                }
            case .signedIn:
                tabs
            }
        }
        .animation(SweeprMotion.smooth, value: env.session.phase)
        .task {
            env.session.bootstrap()
            if env.session.phase == .signedIn {
                await env.session.refresh()
                await env.bookingStore.load()
            }
        }
    }

    private var tabs: some View {
        TabView(selection: $env.selectedTab) {
            HomeScreen()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(CustomerTab.home)

            BookFlowScreen()
                .tabItem { Label("Book", systemImage: "plus.circle.fill") }
                .tag(CustomerTab.book)

            BookingsScreen()
                .tabItem { Label("Bookings", systemImage: "calendar") }
                .tag(CustomerTab.bookings)

            AccountScreen()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(CustomerTab.account)
        }
        .sweeprToast(env.toast)
    }
}

#if DEBUG
struct RootView_Previews: PreviewProvider {
    static var previews: some View {
        RootView().environmentObject(AppEnvironment.preview)
    }
}
#endif
