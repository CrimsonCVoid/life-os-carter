import SwiftUI
import SwiftData

/// Deterministic, on-device nutrition intelligence surfaced as a premium
/// card. Self-contained: @Query's its own MealLog + DailyEntry +
/// UserSettings, hands them to `NutritionInsightsEngine`, and renders the
/// weekly headline + insight rows instantly — no network, no AI, free.
///
/// Drop `NutritionIntelligenceCard()` anywhere; it manages its own data.
struct NutritionIntelligenceCard: View {
    /// Rolling analysis window. 14 days gives enough signal for timing /
    /// distribution / variance without diluting recent behavior.
    private static let windowDays = 14

    @Query(sort: \MealLog.loggedAt, order: .reverse) private var meals: [MealLog]
    @Query private var daily: [DailyEntry]
    @Query private var settingsRows: [UserSettings]
    @Environment(\.modelContext) private var modelContext
    @State private var showDeepDive = false

    private var settings: UserSettings {
        settingsRows.first ?? UserSettings.loadOrCreate(in: modelContext)
    }

    private var insights: [NutritionInsight] {
        NutritionInsightsEngine.analyze(
            meals: meals, daily: daily, settings: settings, days: Self.windowDays
        )
    }

    private var stats: NutritionWeeklyStats {
        NutritionInsightsEngine.weeklyStats(
            meals: meals, daily: daily, settings: settings, days: Self.windowDays
        )
    }

    var body: some View {
        if insights.isEmpty {
            EmptyStateCard(
                icon: "brain.head.profile",
                title: "Nutrition intelligence",
                subtitle: "Log meals for a few days and on-device insights — protein, timing, balance, trends — appear here instantly.",
                tint: LifeOSColor.Metric.protein
            )
        } else {
            Card {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    balanceHeadline
                    if stats.dailyCalories.contains(where: { $0.value > 0 }) {
                        miniTrend
                    }
                    Divider().overlay(LifeOSColor.stroke)
                    VStack(spacing: 10) {
                        ForEach(insights) { insight in
                            insightRow(insight)
                        }
                    }
                    Divider().overlay(LifeOSColor.stroke)
                    deepDiveRow
                }
            }
            .sheet(isPresented: $showDeepDive) { NutritionDeepDiveView() }
        }
    }

    private var deepDiveRow: some View {
        Button {
            Haptics.tap(); showDeepDive = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "chart.xyaxis.line")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
                Text("TDEE, protein g/kg, macro split & eating window")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(
                    LinearGradient(
                        colors: [LifeOSColor.Metric.protein, LifeOSColor.accent],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 22, height: 22)
            Text("ON-DEVICE INSIGHTS")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            Text("\(stats.loggedDays)d logged")
                .font(.system(size: 10, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg3)
        }
    }

    // MARK: - Weekly balance headline

    private var balanceHeadline: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            statColumn(
                label: "AVG CALORIES",
                value: "\(Int(stats.avgCalories))",
                unit: "kcal",
                tint: LifeOSColor.Metric.calories
            )
            statColumn(
                label: "AVG PROTEIN",
                value: "\(Int(stats.avgProtein))",
                unit: "g",
                tint: LifeOSColor.Metric.protein
            )
            Spacer(minLength: 0)
            balanceBadge
        }
    }

    private func statColumn(label: String, value: String, unit: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                Text(unit)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(tint.opacity(0.7))
            }
        }
    }

    @ViewBuilder
    private var balanceBadge: some View {
        if let balance = stats.weeklyBalanceKcal {
            let surplus = balance > 0
            let stable = abs(balance) < 7 * 120  // ~maintenance band
            let weeklyLb = abs(balance) / 3500
            let tint: Color = stable
                ? LifeOSColor.Metric.weight
                : (surplus ? LifeOSColor.warning : LifeOSColor.success)
            let title: String = stable
                ? "Maintenance"
                : (surplus ? "+\(String(format: "%.1f", weeklyLb)) lb/wk" : "−\(String(format: "%.1f", weeklyLb)) lb/wk")
            VStack(alignment: .trailing, spacing: 2) {
                Text("WEEKLY BALANCE")
                    .font(.system(size: 8, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                Text(title)
                    .font(.system(size: 14, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
            }
        }
    }

    // MARK: - Mini calories-vs-goal trend

    private var miniTrend: some View {
        let points = stats.dailyCalories.map { TrendPoint(day: $0.day, value: $0.value) }
        return VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Calories vs goal")
            ScrubbableTrendChart(
                points: points,
                tint: LifeOSColor.Metric.calories,
                showArea: true,
                valueFormat: { "\(Int($0)) kcal" },
                baseline: stats.calorieGoal > 0 ? Double(stats.calorieGoal) : nil
            )
            .frame(height: 96)
        }
    }

    // MARK: - Insight row

    private func insightRow(_ insight: NutritionInsight) -> some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(sentimentColor(insight.sentiment).opacity(0.15))
                Image(systemName: insight.icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(insight.tint)
            }
            .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(insight.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text(insight.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func sentimentColor(_ s: NutritionInsight.Sentiment) -> Color {
        switch s {
        case .good:    return LifeOSColor.success
        case .watch:   return LifeOSColor.warning
        case .neutral: return LifeOSColor.fg2
        }
    }
}
