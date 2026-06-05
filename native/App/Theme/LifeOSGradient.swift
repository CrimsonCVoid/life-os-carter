import SwiftUI

/// Reusable, token-derived gradients. Reach for one of these instead of
/// building a LinearGradient/AngularGradient inline so the accent ramp and
/// per-metric fills stay identical app-wide. Every color resolves from
/// `LifeOSColor`, so each gradient is automatically light/dark adaptive.
enum LifeOSGradient {

    /// Primary CTA / active-pill fill. Top-leading → bottom-trailing.
    static let accent = LinearGradient(
        colors: [LifeOSColor.accent, LifeOSColor.accentStrong],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Subtle accent wash for soft-filled chips / selected states.
    static let accentSoft = LinearGradient(
        colors: [LifeOSColor.accent.opacity(0.22), LifeOSColor.accentStrong.opacity(0.10)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Conic ring sweep for ScoreRing / ProgressRing. Pass the metric tint.
    static func ring(_ tint: Color) -> AngularGradient {
        AngularGradient(
            colors: [tint.opacity(0.55), tint, tint.opacity(0.95)],
            center: .center,
            startAngle: .degrees(-90), endAngle: .degrees(270)
        )
    }

    /// Vertical area-fill for sparklines / charts: tint → transparent.
    static func metricFill(_ tint: Color, top: Double = 0.42, bottom: Double = 0.0) -> LinearGradient {
        LinearGradient(
            colors: [tint.opacity(top), tint.opacity(bottom)],
            startPoint: .top, endPoint: .bottom
        )
    }

    /// Diagonal solid-ish pill fill for metric chips / pill buttons.
    static func metricPill(_ tint: Color) -> LinearGradient {
        LinearGradient(
            colors: [tint, tint.opacity(0.72)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
}
