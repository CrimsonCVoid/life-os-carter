import SwiftUI

/// Rolling AI-coach-style observation card. Each row is a 1-line
/// takeaway with an SF Symbol icon + a tap-to-expand chevron. Designed
/// to feed from the same insights pipeline as the web's Overseer.
struct InsightsCard: View {
    struct Insight: Identifiable {
        let id = UUID()
        let icon: String
        let tint: Color
        let title: String
        let body: String
    }

    let insights: [Insight]

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.accent)
                    Text("INSIGHTS")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.4)
                        .foregroundStyle(LifeOSColor.accent)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(insights) { insight in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: insight.icon)
                                .font(.system(size: 14))
                                .foregroundStyle(insight.tint)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(insight.title)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(.white)
                                Text(insight.body)
                                    .font(.system(size: 12))
                                    .foregroundStyle(LifeOSColor.fg2)
                                    .lineLimit(2)
                            }
                        }
                    }
                }
            }
        }
    }
}
