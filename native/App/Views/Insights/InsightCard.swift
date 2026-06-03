import SwiftUI

/// The premium feed row for a single mined `DataInsight`. Reads as a coach
/// note, not a stat dump: a tinted icon medallion, a scannable title, a
/// sentiment chip, and the specifics underneath. Built on the shared
/// `Card` chrome so it sits in the same visual rhythm as every other
/// grouped surface.
struct InsightCard: View {
    let insight: DataInsight

    var body: some View {
        Card(tint: insight.tint) {
            HStack(alignment: .top, spacing: 14) {
                medallion
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(insight.title)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(LifeOSColor.fg)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        sentimentChip
                    }
                    Text(insight.detail)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                    kindTag
                }
            }
        }
    }

    private var medallion: some View {
        ZStack {
            Circle()
                .fill(insight.tint.opacity(0.16))
            Circle()
                .strokeBorder(insight.tint.opacity(0.30), lineWidth: 0.5)
            Image(systemName: insight.icon)
                .symbolRenderingMode(.hierarchical)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(insight.tint)
        }
        .frame(width: 44, height: 44)
    }

    private var sentimentChip: some View {
        let (label, color): (String, Color) = {
            switch insight.sentiment {
            case .positive: return ("GOOD", LifeOSColor.success)
            case .watch:    return ("WATCH", LifeOSColor.warning)
            case .neutral:  return ("NOTE", LifeOSColor.fg3)
            }
        }()
        return Text(label)
            .font(.system(size: 8, weight: .heavy)).tracking(0.8)
            .foregroundStyle(color)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(Capsule().fill(color.opacity(0.15)))
    }

    private var kindTag: some View {
        HStack(spacing: 5) {
            Image(systemName: kindIcon)
                .font(.system(size: 8, weight: .bold))
            Text(kindLabel)
                .font(.system(size: 9, weight: .semibold)).tracking(0.8)
        }
        .foregroundStyle(insight.tint.opacity(0.85))
        .padding(.top, 1)
    }

    private var kindLabel: String {
        switch insight.kind {
        case .correlation: return "CORRELATION"
        case .trend:       return "TREND"
        case .anomaly:     return "ANOMALY"
        case .streak:      return "STREAK"
        case .tip:         return "TIP"
        }
    }

    private var kindIcon: String {
        switch insight.kind {
        case .correlation: return "arrow.triangle.branch"
        case .trend:       return "chart.line.uptrend.xyaxis"
        case .anomaly:     return "exclamationmark.magnifyingglass"
        case .streak:      return "flame.fill"
        case .tip:         return "lightbulb.fill"
        }
    }
}
