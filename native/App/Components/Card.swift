import SwiftUI

/// Standard card chrome — dark Liquid Glass with a subtle white sheen
/// on the top edge so it doesn't read as flat. Use this on every
/// grouped surface so the visual rhythm stays consistent.
struct Card<Content: View>: View {
    let content: Content
    var tint: Color?

    init(tint: Color? = nil, @ViewBuilder content: () -> Content) {
        self.tint = tint
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                ZStack {
                    // Base glass
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.ultraThinMaterial)
                    // Optional accent wash
                    if let tint {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [tint.opacity(0.08), tint.opacity(0.0)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                    }
                }
            )
            .overlay(
                // Sheen: brighter at the top, fading to invisible. Sells
                // the "glass" treatment without resorting to a hard border.
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.14),
                                Color.white.opacity(0.04),
                                Color.white.opacity(0.0),
                            ],
                            startPoint: .top, endPoint: .bottom
                        ),
                        lineWidth: 0.5
                    )
            )
            .shadow(color: Color.black.opacity(0.4), radius: 16, x: 0, y: 8)
    }
}

/// Section title + optional trailing action, used above grouped content.
struct SectionLabel: View {
    let text: String
    var trailing: AnyView?

    init(_ text: String, @ViewBuilder trailing: () -> some View = { EmptyView() }) {
        self.text = text
        self.trailing = AnyView(trailing())
    }

    var body: some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            trailing
        }
        .padding(.horizontal, 4)
    }
}

/// Vertical pillar for the Today hero — three of these side-by-side
/// (Recovery, Strain, Sleep) like the dashboard hero on the web.
struct PillarTile: View {
    let label: String
    let value: String
    let unit: String
    let tint: Color

    var body: some View {
        VStack(spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(tint.opacity(0.7))
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(tint.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(tint.opacity(0.22), lineWidth: 0.5)
                )
        )
    }
}

// MARK: - Animation modifiers

/// Cascading reveal — used across screens to make initial load feel
/// alive. Pair with `.cascadeReveal(index: …)` on each child in a stack.
struct CascadeReveal: ViewModifier {
    let index: Int
    let visible: Bool
    var stagger: Double = 0.045
    var initialOffset: CGFloat = 14

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : initialOffset)
            .animation(
                .spring(response: 0.55, dampingFraction: 0.84)
                    .delay(stagger * Double(index)),
                value: visible
            )
    }
}

extension View {
    func cascadeReveal(index: Int, visible: Bool) -> some View {
        modifier(CascadeReveal(index: index, visible: visible))
    }
}

/// Press-and-spring scale — wrap any tappable card in this and the
/// whole surface gives a tiny haptic-quality squeeze on touch.
struct PressableScale: ViewModifier {
    @State private var pressed = false
    var scale: CGFloat = 0.98

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed ? scale : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.65), value: pressed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in if !pressed { pressed = true } }
                    .onEnded   { _ in pressed = false }
            )
    }
}

extension View {
    /// `.pressable()` — adds a subtle spring scale on touch. Apply to
    /// cards that are also tap targets.
    func pressable(scale: CGFloat = 0.98) -> some View {
        modifier(PressableScale(scale: scale))
    }
}

/// Subtle ambient glow used behind hero numbers.
struct GlowBackground: ViewModifier {
    var tint: Color
    var radius: CGFloat = 20

    func body(content: Content) -> some View {
        content
            .background(
                tint.opacity(0.35)
                    .blur(radius: radius)
                    .scaleEffect(0.8)
            )
    }
}

extension View {
    func glow(_ tint: Color, radius: CGFloat = 20) -> some View {
        modifier(GlowBackground(tint: tint, radius: radius))
    }
}
