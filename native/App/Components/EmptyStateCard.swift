import SwiftUI

/// Premium empty state — a glass card with a gradient halo behind a
/// large SF Symbol, a clear headline, helpful subtitle, and an
/// optional primary CTA. Drop in whenever a screen has nothing to
/// show, but instead of a flat "no data" line we want to communicate
/// what the user can do about it.
struct EmptyStateCard<Trailing: View>: View {
    let icon: String
    let title: String
    let subtitle: String
    let tint: Color
    let action: (() -> Void)?
    let actionLabel: String?
    let trailing: Trailing

    init(
        icon: String,
        title: String,
        subtitle: String,
        tint: Color = LifeOSColor.accent,
        actionLabel: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.tint = tint
        self.actionLabel = actionLabel
        self.action = action
        self.trailing = trailing()
    }

    var body: some View {
        VStack(spacing: 14) {
            haloIcon
            VStack(spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg)
                    .multilineTextAlignment(.center)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let action, let actionLabel {
                Button {
                    Haptics.tap()
                    action()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 11, weight: .heavy))
                        Text(actionLabel)
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(
                        Capsule().fill(
                            LinearGradient(
                                colors: [tint, tint.opacity(0.7)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                    )
                    .shadow(color: tint.opacity(0.35), radius: 12, x: 0, y: 6)
                }
                .buttonStyle(.plain)
            }
            trailing
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 18)
        .padding(.vertical, 22)
        .liquidGlass(cornerRadius: 22, tint: tint, depth: .soft)
    }

    private var haloIcon: some View {
        ZStack {
            // Soft radial halo behind the symbol
            Circle()
                .fill(tint.opacity(0.32))
                .frame(width: 84, height: 84)
                .blur(radius: 26)
            Circle()
                .strokeBorder(tint.opacity(0.4), lineWidth: 1)
                .frame(width: 64, height: 64)
            Image(systemName: icon)
                .symbolRenderingMode(.hierarchical)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(tint)
        }
        .frame(height: 84)
    }
}
