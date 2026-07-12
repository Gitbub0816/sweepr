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

// Design tokens ported from `packages/config/tailwind.ts`. Dark mode is the
// deliberate "warm graphite" neutral (no blue). These are the single source of
// truth for both apps.

public enum SweeprColor {
    // Seafoam brand scale.
    public static let seafoam500 = Color(hex: 0x14b8a6) // primary accent
    public static let seafoam600 = Color(hex: 0x0d9488)
    public static let seafoam700 = Color(hex: 0x0f766e) // brand / pressed
    public static let seafoam100 = Color(hex: 0xccfbf1)
    public static let seafoam50  = Color(hex: 0xf0fdfa)

    // Warm-graphite neutral scale (overrides blue-gray slate).
    public static let charcoal   = Color(hex: 0x1c1a17)
    public static let graphite950 = Color(hex: 0x12100e)
    public static let graphite800 = Color(hex: 0x2a2622)
    public static let graphite700 = Color(hex: 0x44403b)
    public static let graphite500 = Color(hex: 0x78726b)
    public static let graphite300 = Color(hex: 0xd6d3ce)
    public static let graphite100 = Color(hex: 0xf5f4f2)
    public static let offwhite    = Color(hex: 0xf9f8f6)
    public static let amber       = Color(hex: 0xf59e0b)

    // Semantic, theme-aware tokens.
    public static var brand: Color { seafoam700 }
    public static var accent: Color { seafoam500 }

    public static var background: Color {
        Color(light: offwhite, dark: charcoal)
    }
    public static var surface: Color {
        Color(light: .white, dark: graphite800)
    }
    public static var textPrimary: Color {
        Color(light: charcoal, dark: offwhite)
    }
    public static var textSecondary: Color {
        Color(light: graphite500, dark: graphite300)
    }
    public static var separator: Color {
        Color(light: graphite300, dark: graphite700)
    }
}

public enum SweeprRadius {
    public static let card: CGFloat = 20
    public static let button: CGFloat = 14
    public static let badge: CGFloat = 999
}

public enum SweeprSpacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 24
    public static let xl: CGFloat = 32
}

public enum SweeprFont {
    public static func title() -> Font { .system(size: 28, weight: .bold, design: .rounded) }
    public static func heading() -> Font { .system(size: 20, weight: .semibold, design: .rounded) }
    public static func body() -> Font { .system(size: 16, weight: .regular) }
    public static func caption() -> Font { .system(size: 13, weight: .medium) }
}

// MARK: - Color helpers (SKIP-supported subset)

public extension Color {
    /// Hex initializer, e.g. `Color(hex: 0x14b8a6)`.
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xff) / 255.0
        let g = Double((hex >> 8) & 0xff) / 255.0
        let b = Double(hex & 0xff) / 255.0
        self.init(red: r, green: g, blue: b)
    }

    /// Light/dark pair. Uses `UIColor` dynamic provider on Darwin; SKIP maps the
    /// `ColorScheme` branch to Compose's `isSystemInDarkTheme()` at transpile.
    init(light: Color, dark: Color) {
        #if os(iOS)
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #else
        self = light
        #endif
    }
}
