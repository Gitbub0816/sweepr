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

// Root of the cleaner app. The auth wall gates everything: a persisted broker
// session (Keychain) opens the tabs instantly and refreshes the profile in the
// background; without one, the native sign-in/sign-up flow renders. A broker
// revocation flips the phase and lands back here automatically.
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
                AuthFlowView(engine: env.authEngine, branding: .cleaner) {
                    await env.session.didSignIn()
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
            }
        }
    }

    private var tabs: some View {
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
