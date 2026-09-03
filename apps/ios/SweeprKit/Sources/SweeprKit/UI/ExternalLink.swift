//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import Foundation
#if os(iOS)
import UIKit
#endif

/// Opens a URL in the system browser/app. No-ops off iOS (Android/SKIP maps
/// this to an Intent through skip.yml divergence when re-enabled).
public enum SweeprExternal {
    @MainActor
    public static func open(_ url: URL) {
        #if os(iOS)
        UIApplication.shared.open(url)
        #endif
    }
}
