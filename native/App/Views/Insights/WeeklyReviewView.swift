import SwiftUI
import SwiftData

/// Full-screen weekly review — the deterministic, on-device coach recap
/// of the last 7 days vs the prior 7. Queries the same SwiftData rows
/// the rest of the app holds, hands them to `WeeklyReviewEngine`, and
/// renders the headline, pillar deltas, wins, and watch-outs. No AI,
/// instant, free.
struct WeeklyReviewView: View {
    @Query private var dailies: [DailyEntry]
    @Query private var meals: [MealLog]
    @Query private var lifts: [LiftSessionEntry]
    @Query private var habits: [HabitEntry]
    @Query private var settingsRows: [UserSettings]
    @Environment(\.modelContext) private var modelContext

    @State private var cardsVisible = false

    private var settings: UserSettings {
        settingsRows.first ?? UserSettings.loadOrCreate(in: modelContext)
    }

    private var review: WeeklyReview? {
        WeeklyReviewEngine.build(
            daily: dailies,
            meals: meals,
            lifts: lifts,
            habits: habits,
            settings: settings,
            asOf: Date()
        )
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                if let review {
                    content(review)
                } else {
                    emptyState
                        .cascadeReveal(index: 0, visible: cardsVisible)
                }
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(AmbientBackground(accent: LifeOSColor.accent).ignoresSafeArea())
        .navigationTitle("Weekly Review")
        .navigationBarTitleDisplayMode(.large)
        .onAppear {
            if !cardsVisible {
                withAnimation(.easeOut(duration: 0.5)) { cardsVisible = true }
            }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ review: WeeklyReview) -> some View {
        headlineCard(review)
            .cascadeReveal(index: 0, visible: cardsVisible)

        if !review.wins.isEmpty {
            listCard(
                kicker: "WINS",
                title: "What went well",
                icon: "arrow.up.right.circle.fill",
                tint: LifeOSColor.success,
                items: review.wins
            )
            .cascadeReveal(index: 1, visible: cardsVisible)
        }

        if !review.watchOuts.isEmpty {
            listCard(
                kicker: "WATCH-OUTS",
                title: "Where to focus",
                icon: "exclamationmark.triangle.fill",
                tint: LifeOSColor.warning,
                items: review.watchOuts
            )
            .cascadeReveal(index: 2, visible: cardsVisible)
        }

        metricsCard(review)
            .cascadeReveal(index: 3, visible: cardsVisible)
    }

    private func headlineCard(_ review: WeeklyReview) -> some View {
        Card(tint: LifeOSColor.accent) {
            VStack(alignment: .leading, spacing: 10) {
                Text(review.weekLabel.uppercased())
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.accent)
                Text(review.headline)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Last 7 days vs the 7 before")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
            }
        }
    }

    private func metricsCard(_ review: WeeklyReview) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("PILLAR DELTAS")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
                VStack(spacing: 0) {
                    ForEach(Array(review.metrics.enumerated()), id: \.element.id) { idx, metric in
                        if idx > 0 {
                            Divider().overlay(LifeOSColor.stroke)
                        }
                        WeeklyMetricRow(metric: metric)
                    }
                }
            }
        }
    }

    private func listCard(
        kicker: String,
        title: String,
        icon: String,
        tint: Color,
        items: [String]
    ) -> some View {
        Card(tint: tint) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(tint)
                    Text(kicker)
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(tint)
                }
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(items, id: \.self) { item in
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(tint)
                                .frame(width: 6, height: 6)
                                .padding(.top, 5)
                            Text(item)
                                .font(.system(size: 13.5))
                                .foregroundStyle(LifeOSColor.fg)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        EmptyStateCard(
            icon: "calendar.badge.clock",
            title: "Not enough data yet",
            subtitle: "Log a few more days this week — sleep, meals, workouts, or mood — and your weekly review unlocks with this-week-vs-last comparisons.",
            tint: LifeOSColor.accent
        )
    }
}

/// One pillar row: name on the left, this-week value, and a delta pill
/// whose arrow + color reflect direction and `higherIsBetter`.
private struct WeeklyMetricRow: View {
    let metric: WeeklyReview.Metric

    /// A real improvement vs regression read, respecting metrics where
    /// lower is better (resting HR). Near-zero deltas read as neutral.
    private var trend: Trend {
        if abs(metric.delta) < 0.0001 { return .flat }
        let up = metric.delta > 0
        let good = metric.higherIsBetter ? up : !up
        return good ? .good : .bad
    }

    private enum Trend { case good, bad, flat }

    private var arrow: String {
        switch trend {
        case .good: return metric.higherIsBetter ? "arrow.up.right" : "arrow.down.right"
        case .bad:  return metric.higherIsBetter ? "arrow.down.right" : "arrow.up.right"
        case .flat: return "minus"
        }
    }

    private var trendColor: Color {
        switch trend {
        case .good: return LifeOSColor.success
        case .bad:  return LifeOSColor.danger
        case .flat: return LifeOSColor.fg3
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(metric.tint)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(metric.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Text("was \(metric.lastWeek)")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
            Text(metric.thisWeek)
                .font(.system(size: 16, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg)
            Image(systemName: arrow)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(trendColor)
                .frame(width: 18)
        }
        .padding(.vertical, 11)
    }
}
