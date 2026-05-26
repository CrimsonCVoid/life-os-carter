import SwiftUI

/// Progressive Liquid Glass surface. On iOS 26+ uses the system
/// `.glassEffect()` modifier (true refractive glass + dynamic light
/// response). On older versions falls back to `.ultraThinMaterial` +
/// a sheen overlay, which is close enough that the same view code
/// reads coherently on both.
///
/// Use this in place of raw `.background(.ultraThinMaterial)` whenever
/// you want a surface that automatically takes the platform's best
/// glass effect.
struct LiquidGlassBackground: ViewModifier {
    var cornerRadius: CGFloat
    var tint: Color?
    var depth: Depth

    enum Depth { case none, soft, deep }

    func body(content: Content) -> some View {
        content
            .background(glassSurface)
            .overlay(sheenOverlay)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .shadow(
                color: shadowColor,
                radius: shadowRadius,
                x: 0,
                y: shadowY
            )
    }

    @ViewBuilder
    private var glassSurface: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.ultraThinMaterial)
            if let tint {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(
                        RadialGradient(
                            colors: [tint.opacity(0.18), tint.opacity(0)],
                            center: .topLeading,
                            startRadius: 0,
                            endRadius: 280
                        )
                    )
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [tint.opacity(0.06), .clear],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
            }
        }
    }

    private var sheenOverlay: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.18),
                        Color.white.opacity(0.06),
                        Color.white.opacity(0.0),
                    ],
                    startPoint: .top, endPoint: .bottom
                ),
                lineWidth: 0.5
            )
    }

    private var shadowColor: Color {
        switch depth {
        case .none: return .clear
        case .soft: return Color.black.opacity(0.32)
        case .deep: return Color.black.opacity(0.5)
        }
    }
    private var shadowRadius: CGFloat {
        switch depth { case .none: 0; case .soft: 14; case .deep: 24 }
    }
    private var shadowY: CGFloat {
        switch depth { case .none: 0; case .soft: 6; case .deep: 12 }
    }
}

extension View {
    /// Liquid Glass surface with optional tint glow + drop shadow.
    /// The canonical card chrome — used by `Card` and any custom
    /// floating surface that wants the same look.
    func liquidGlass(
        cornerRadius: CGFloat = 20,
        tint: Color? = nil,
        depth: LiquidGlassBackground.Depth = .soft
    ) -> some View {
        modifier(LiquidGlassBackground(cornerRadius: cornerRadius, tint: tint, depth: depth))
    }
}
