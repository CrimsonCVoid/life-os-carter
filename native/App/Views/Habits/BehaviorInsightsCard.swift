import SwiftUI
import SwiftData

/// Compact on-device behavioral intelligence card for the Habits screen
/// (or Analysis). Shows the top deterministic insights plus a one-line
/// behavioral-consistency summary, and pushes the full BehaviorInsights
/// screen on tap. Everything renders instantly — no network — because
/// BehaviorInsightsEngine is pure local math over the @Query'd data.
struct BehaviorInsightsCard: View {
    @Query(filter: #Predicate<HabitEntry> { $0.archived == false })
    private var habits: [HabitEntry]
    @Query private var daily: [DailyEntry]

    /// Lookback window. 30 days matches the Analysis correlations card.
    var days: Int = 30

    private var insights: [BehaviorInsight] {
        BehaviorInsightsEngine.insights(habits: habits, daily: daily, days: days)
    }
    private var consistency: [HabitConsistency] {
        BehaviorInsightsEngine.consistency(habits: habits, days: days)
    }

    var body: some View {
        NavigationLink {
            BehaviorInsightsView()
        } label: {
            Card(tint: LifeOSColor.accent) {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    if insights.isEmpty {
                        emptyBody
                    } else {
                        VStack(spacing: 10) {
                            ForEach(insights.prefix(3)) { InsightRow(insight: $0) }
                        }
                        consistencyStrip
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .pressable()
    }

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(
                    LinearGradient(
                        colors: [LifeOSColor.accent, LifeOSColor.Metric.peak],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
            }
            .frame(width: 22, height: 22)
            Text("BEHAVIOR")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            if !insights.isEmpty {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private var emptyBody: some View {
        Text("Keep logging habits and your mood or energy — once there's a week or two of data, on-device insights show up here.")
            .font(.system(size: 12))
            .foregroundStyle(LifeOSColor.fg2)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// One-line behavioral consistency read derived from the same engine
    /// rows, with a thin average-rate meter so it reads at a glance.
    private var consistencyStrip: some View {
        let avg = consistency.isEmpty
            ? 0
            : consistency.map(\.completionRate).reduce(0, +) / Double(consistency.count)
        return HStack(spacing: 10) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(LifeOSColor.accent)
            Text("Consistency")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg2)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(LifeOSColor.elevated)
                    Capsule()
                        .fill(LifeOSColor.accent)
                        .frame(width: max(4, geo.size.width * avg))
                }
            }
            .frame(height: 5)
            Text("\(Int((avg * 100).rounded()))%")
                .font(.system(size: 12, weight: .heavy).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg)
        }
        .padding(.top, 2)
    }
}

// MARK: - Shared insight row

/// Single behavioral insight line — sentiment-tinted icon bubble, title,
/// and supporting detail. Reused by the card and the full view so the
/// two read identically.
struct InsightRow: View {
    let insight: BehaviorInsight

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(insight.tint.opacity(0.15))
                Image(systemName: insight.icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(insight.tint)
            }
            .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(insight.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    sentimentChip
                }
                Text(insight.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var sentimentChip: some View {
        let (label, color): (String, Color) = {
            switch insight.sentiment {
            case .positive: return ("GOOD", LifeOSColor.success)
            case .watch:    return ("WATCH", LifeOSColor.warning)
            case .neutral:  return ("", LifeOSColor.fg3)
            }
        }()
        if !label.isEmpty {
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                .foregroundStyle(color)
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(Capsule().fill(color.opacity(0.15)))
        }
    }
}
