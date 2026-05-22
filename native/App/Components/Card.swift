import SwiftUI

/// Standard card chrome — dark, Liquid Glass, hairline border. Use
/// this for every grouped surface so the visual rhythm stays consistent.
struct Card<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassCard()
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
