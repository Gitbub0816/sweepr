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
    public static let xxl: CGFloat = 48
}

public enum SweeprFont {
    // Existing scale (kept verbatim — call sites depend on these).
    public static func title() -> Font { .system(size: 28, weight: .bold, design: .rounded) }
    public static func heading() -> Font { .system(size: 20, weight: .semibold, design: .rounded) }
    public static func body() -> Font { .system(size: 16, weight: .regular) }
    public static func caption() -> Font { .system(size: 13, weight: .medium) }

    // Additive refinements for hero numerals, sub-headings, and fine print.
    public static func largeTitle() -> Font { .system(size: 34, weight: .bold, design: .rounded) }
    public static func subheading() -> Font { .system(size: 17, weight: .semibold, design: .rounded) }
    public static func footnote() -> Font { .system(size: 12, weight: .medium) }
    /// Tabular-ish monospaced numerals for codes, timers, and stat readouts.
    public static func mono(size: CGFloat = 30) -> Font { .system(size: size, weight: .bold, design: .monospaced) }
}

// MARK: - Elevation / shadow tokens (light + warm-graphite dark aware)

/// A small, deliberate ladder of resting elevations. Shadows are theme-aware:
/// soft and cool-neutral in light, deeper and darker under warm graphite so
/// cards still read as lifted without a blue cast.
public enum SweeprElevation: Sendable {
    case none, low, medium, high

    public var radius: CGFloat {
        switch self {
        case .none: return 0
        case .low: return 8
        case .medium: return 16
        case .high: return 28
        }
    }
    public var y: CGFloat {
        switch self {
        case .none: return 0
        case .low: return 2
        case .medium: return 6
        case .high: return 12
        }
    }
    /// Theme-aware shadow colour. Warm graphite deepens the alpha so the lift
    /// survives the dark ground.
    public var color: Color {
        let lightAlpha: Double
        let darkAlpha: Double
        switch self {
        case .none: lightAlpha = 0;    darkAlpha = 0
        case .low: lightAlpha = 0.08;  darkAlpha = 0.40
        case .medium: lightAlpha = 0.12; darkAlpha = 0.50
        case .high: lightAlpha = 0.18;  darkAlpha = 0.60
        }
        return Color(
            light: SweeprColor.charcoal.opacity(lightAlpha),
            dark: Color.black.opacity(darkAlpha)
        )
    }
}

// MARK: - Motion presets (spring + easing)

/// Named animation presets so screens share one motion language. Springs are
/// tuned for a responsive-but-calm feel; `press` is the quick, tight response
/// used for tap/hold affordances.
public enum SweeprMotion {
    public static let snappy = Animation.spring(response: 0.30, dampingFraction: 0.82)
    public static let smooth = Animation.spring(response: 0.45, dampingFraction: 0.90)
    public static let bouncy = Animation.spring(response: 0.50, dampingFraction: 0.62)
    public static let gentle = Animation.easeInOut(duration: 0.25)
    public static let press  = Animation.spring(response: 0.24, dampingFraction: 0.72)
}

public extension View {
    /// A soft, tasteful resting shadow for cards and floating surfaces.
    func sweeprElevation(_ level: SweeprElevation = .medium) -> some View {
        shadow(color: level.color, radius: level.radius, x: 0, y: level.y)
    }
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
