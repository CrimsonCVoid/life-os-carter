import SwiftUI

/// Liquid Glass surfaces — use these on every translucent card, sheet,
/// or floating chrome instead of rolling your own backdrop blur.
///
/// On iOS 26+ this routes to Apple's native `.glassEffect()` API which
/// participates in the system's depth + light-aware rendering. On iOS
/// 17–25 it falls back to `.ultraThinMaterial`, which still looks
/// great and supports backdrop blur out of the box.
struct GlassBackground: ViewModifier {
    var shape: AnyShape

    init<S: Shape>(shape: S) {
        self.shape = AnyShape(shape)
    }

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular, in: shape)
        } else {
            content
                .background(.ultraThinMaterial, in: shape)
                .overlay(
                    shape
                        .stroke(Color.white.opacity(0.06), lineWidth: 0.5)
                )
        }
    }
}

extension View {
    /// `.glass(in: RoundedRectangle(cornerRadius: 20))`
    func glass<S: Shape>(in shape: S) -> some View {
        modifier(GlassBackground(shape: shape))
    }

    /// Shorthand for the standard card chrome — rounded 20pt + glass.
    func glassCard(cornerRadius: CGFloat = 20) -> some View {
        modifier(GlassBackground(shape: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)))
    }
}
