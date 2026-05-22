import SwiftUI

/// Brand color tokens — the SwiftUI mirror of `src/app/globals.css`.
/// Keep these in sync with the web theme so the in-app design stays
/// consistent with the marketing site, widget surfaces, and Live
/// Activity. Anything that draws a UI uses these, never inline hex.
enum LifeOSColor {
    // Surfaces
    static let base       = Color(hex: 0x050507)
    static let card       = Color(hex: 0x0F0F12)
    static let cardHover  = Color(hex: 0x14141A)
    static let elevated   = Color(hex: 0x14141A)
    static let stroke     = Color(hex: 0x1A1A1F)
    static let strokeStrong = Color(hex: 0x26262E)

    // Text
    static let fg   = Color.white
    static let fg2  = Color(hex: 0x8E8E93)
    static let fg3  = Color(hex: 0x48484A)

    // Accent (default violet — matches `--color-accent` web default)
    static let accent       = Color(hex: 0xA78BFA)
    static let accentStrong = Color(hex: 0x8B5CF6)
    static let accentSoft   = Color(hex: 0xA78BFA).opacity(0.16)

    // Semantic
    static let success = Color(hex: 0x10B981)
    static let warning = Color(hex: 0xF59E0B)
    static let danger  = Color(hex: 0xF43F5E)

    // Metric palette — mirrors the web's --mc-* tokens
    enum Metric {
        static let calories = Color(hex: 0xF59E0B)
        static let protein  = Color(hex: 0xA78BFA)
        static let carbs    = Color(hex: 0x38BDF8)
        static let fat      = Color(hex: 0x10B981)
        static let water    = Color(hex: 0x22D3EE)
        static let sleep    = Color(hex: 0x818CF8)
        static let mood     = Color(hex: 0xF43F5E)
        static let energy   = Color(hex: 0xFB923C)
        static let weight   = Color(hex: 0x94A3B8)
        static let steps    = Color(hex: 0x84CC16)
        static let strain   = Color(hex: 0xFDA4AF)
        static let peak     = Color(hex: 0x5EEAD4)
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
