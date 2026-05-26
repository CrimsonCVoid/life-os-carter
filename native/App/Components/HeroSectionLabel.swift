import SwiftUI

/// Upgraded section header replacement. Adds a gradient hairline
/// underneath, an optional symbol leading the label, and a trailing
/// slot for an action button or status chip. Drop in anywhere the
/// older `SectionLabel` was used to get a more premium read.
struct HeroSectionLabel<Trailing: View>: View {
    let title: String
    var icon: String?
    var tint: Color = LifeOSColor.fg3
    @ViewBuilder var trailing: Trailing

    init(
        _ title: String,
        icon: String? = nil,
        tint: Color = LifeOSColor.fg3,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) {
        self.title = title
        self.icon = icon
        self.tint = tint
        self.trailing = trailing()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(tint)
                }
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.4)
                    .foregroundStyle(tint)
                Spacer()
                trailing
            }
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [tint.opacity(0.4), tint.opacity(0)],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
                .frame(height: 1)
        }
        .padding(.horizontal, 4)
    }
}
