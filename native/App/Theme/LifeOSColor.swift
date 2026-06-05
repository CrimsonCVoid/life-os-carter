import SwiftUI
import UIKit

/// Brand color tokens — the SwiftUI mirror of `src/app/globals.css`.
/// Keep these in sync with the web theme so the in-app design stays
/// consistent with the marketing site, widget surfaces, and Live
/// Activity. Anything that draws a UI uses these, never inline hex.
///
/// Every token is adaptive: it resolves to a light or dark value based
/// on the system `userInterfaceStyle`, so the whole app follows system
/// appearance. The dark values are the original dark-only theme; the
/// light values are authored to mirror that structure on a clean,
/// premium light surface.
enum LifeOSColor {
    // Surfaces
    static let base         = dyn(light: 0xF5F5F7, dark: 0x050507)
    static let card         = dyn(light: 0xFFFFFF, dark: 0x0F0F12)
    static let cardHover    = dyn(light: 0xF0F0F3, dark: 0x14141A)
    static let elevated     = dyn(light: 0xEDEDF0, dark: 0x14141A)
    static let stroke       = dyn(light: 0xE2E2E8, dark: 0x1A1A1F)
    static let strokeStrong = dyn(light: 0xCFCFD6, dark: 0x26262E)

    // Text
    static let fg   = dyn(light: 0x0B0B0F, dark: 0xFFFFFF)
    static let fg2  = dyn(light: 0x4A4A52, dark: 0x8E8E93)
    static let fg3  = dyn(light: 0x8A8A92, dark: 0x48484A)

    // Accent (default violet — matches `--color-accent` web default).
    // The light accent is nudged slightly deeper than the dark one so
    // accent-on-white text/icons keep adequate contrast.
    static let accent       = dyn(light: 0x7C5CFA, dark: 0xA78BFA)
    static let accentStrong = dyn(light: 0x6D3FF0, dark: 0x8B5CF6)
    static let accentSoft   = Color(UIColor { trait in
        let hex: UInt = trait.userInterfaceStyle == .dark ? 0xA78BFA : 0x7C5CFA
        return UIColor(hexU: hex, alpha: trait.userInterfaceStyle == .dark ? 0.16 : 0.12)
    })

    // Semantic — hues preserved; light variants deepened where the dark
    // hue would be too pale to read on a white card.
    static let success = dyn(light: 0x059669, dark: 0x10B981)
    static let warning = dyn(light: 0xD97706, dark: 0xF59E0B)
    static let danger  = dyn(light: 0xE11D48, dark: 0xF43F5E)

    // Metric palette — mirrors the web's --mc-* tokens. Hues preserved.
    // Pale hues (amber/lime/cyan/slate/teal) are deepened for light so
    // they stay legible when used as text or thin strokes on white.
    enum Metric {
        static let calories = dyn(light: 0xD97706, dark: 0xF59E0B)
        static let protein  = dyn(light: 0x7C5CFA, dark: 0xA78BFA)
        static let carbs    = dyn(light: 0x0284C7, dark: 0x38BDF8)
        static let fat      = dyn(light: 0x059669, dark: 0x10B981)
        static let water    = dyn(light: 0x0891B2, dark: 0x22D3EE)
        static let sleep    = dyn(light: 0x6366F1, dark: 0x818CF8)
        static let mood     = dyn(light: 0xE11D48, dark: 0xF43F5E)
        static let energy   = dyn(light: 0xEA580C, dark: 0xFB923C)
        static let weight   = dyn(light: 0x64748B, dark: 0x94A3B8)
        static let steps    = dyn(light: 0x65A30D, dark: 0x84CC16)
        static let strain   = dyn(light: 0xF43F5E, dark: 0xFDA4AF)
        static let peak     = dyn(light: 0x0D9488, dark: 0x5EEAD4)
        static let hrv      = dyn(light: 0x6366F1, dark: 0x818CF8)
        static let rhr      = dyn(light: 0xDC2626, dark: 0xF87171)
        static let spo2     = dyn(light: 0x0D9488, dark: 0x2DD4BF)
        static let respiratory = dyn(light: 0x2563EB, dark: 0x60A5FA)
    }

    /// Sleep-stage palette — shared by SleepCard, the Analysis sleep
    /// architecture chart, and the night-timeline hypnogram so the four
    /// stages read identically everywhere. Deep is the deepest indigo,
    /// REM violet, light a mid blue, awake rose.
    enum SleepStage {
        static let deep  = dyn(light: 0x4338CA, dark: 0x4F46E5)
        static let rem   = dyn(light: 0x7C5CFA, dark: 0xA78BFA)
        static let light = dyn(light: 0x2563EB, dark: 0x60A5FA)
        static let awake = dyn(light: 0xE11D48, dark: 0xFB7185)
    }

    /// Recovery band color — green (high) / amber (medium) / red (low),
    /// keyed off a 0...100 recovery percentage. Centralizes the mapping
    /// so the hero ring, detail sheet, and any ambient tint agree.
    static func recovery(_ pct: Int) -> Color {
        switch pct {
        case ..<34:  return danger
        case 34..<67: return warning
        default:     return success
        }
    }

    /// Resolve a Color per the current `userInterfaceStyle`. Light/dark
    /// are 0xRRGGBB literals, matching the CSS hex format.
    static func dyn(light: UInt, dark: UInt) -> Color {
        Color(UIColor { trait in
            UIColor(hexU: trait.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension Color {
    /// Build a Color from a 0xRRGGBB literal. Cleaner than hand-typing
    /// red/green/blue floats and matches the format we use in CSS.
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >>  8) & 0xFF) / 255
        let b = Double( hex        & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

extension UIColor {
    /// UIKit twin of `Color(hex:)`, used inside the dynamic-provider
    /// closures where we need a `UIColor` to resolve per trait.
    convenience init(hexU hex: UInt, alpha: CGFloat = 1) {
        let r = CGFloat((hex >> 16) & 0xFF) / 255
        let g = CGFloat((hex >>  8) & 0xFF) / 255
        let b = CGFloat( hex        & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: alpha)
    }
}
