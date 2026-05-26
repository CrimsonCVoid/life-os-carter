import SwiftUI
import SwiftData

/// On-demand AI insights for the Nutrition tab. Lazy: stays in the
/// idle state until the user explicitly taps "Generate insights" — no
/// auto-call on appear, no per-render polling. State lives in @State,
/// so navigating away and back drops the result; re-tap to refresh.
///
/// Backed by `/api/nutrition-insights`. Snapshot sent to the model
/// includes today's totals + chronological meals + the last 7 days of
/// per-day totals + (optional) macro targets.
struct NutritionInsightsCard: View {
    let todayMeals: [MealLog]
    /// Meals from the last 7 days (inclusive of today). Filtering at
    /// the caller keeps the SwiftData @Query in NutritionView the
    /// single source-of-truth for which rows we own.
    let last7Meals: [MealLog]
    let targets: NutritionTargetsIn

    @State private var state: ViewState = .idle

    private enum ViewState {
        case idle
        case loading
        case loaded(InsightsResponse)
        case failed(String)
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                header
                switch state {
                case .idle:               idleBody
                case .loading:            loadingBody
                case .loaded(let r):      loadedBody(r)
                case .failed(let msg):    failedBody(msg)
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(
                    LinearGradient(
                        colors: [LifeOSColor.accent, LifeOSColor.Metric.protein],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 22, height: 22)
            Text("AI INSIGHTS")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            if case .loaded = state {
                Button(action: generate) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - State bodies

    private var idleBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pull a read on the last 7 days — protein gap, macro balance, meal timing, what to fix.")
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: generate) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Generate insights")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Capsule().fill(LifeOSColor.accent))
            }
            .buttonStyle(.plain)
        }
    }

    private var loadingBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .symbolEffect(.pulse.byLayer, options: .repeating)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
                Text("Analyzing your last 7 days…")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                Spacer()
            }
            SkeletonShimmer(lines: 3, lastLineFraction: 0.55)
        }
    }

    private func loadedBody(_ r: InsightsResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !r.summary.isEmpty {
                Text(r.summary)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 10) {
                ForEach(Array(r.insights.enumerated()), id: \.offset) { _, ins in
                    insightRow(ins)
                }
            }
        }
    }

    private func insightRow(_ ins: Insight) -> some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(severityColor(ins.severity).opacity(0.15))
                Image(systemName: kindIcon(ins.kind))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(severityColor(ins.severity))
            }
            .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(ins.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text(ins.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func failedBody(_ msg: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(msg)
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.warning)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: generate) {
                Text("Try again")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Style helpers

    private func severityColor(_ s: String) -> Color {
        switch s {
        case "concern":    return LifeOSColor.warning
        case "actionable": return LifeOSColor.accent
        default:           return LifeOSColor.Metric.protein
        }
    }

    private func kindIcon(_ k: String) -> String {
        switch k {
        case "protein_gap":   return "figure.strengthtraining.traditional"
        case "calorie_gap":   return "flame.fill"
        case "macro_balance": return "chart.pie.fill"
        case "trend":         return "chart.line.uptrend.xyaxis"
        case "timing":        return "clock.fill"
        default:              return "lightbulb.fill"
        }
    }

    // MARK: - API

    private func generate() {
        Haptics.tap()
        state = .loading
        Task {
            do {
                let req = buildRequest()
                let result: InsightsResponse = try await APIClient.shared.post(
                    "/api/nutrition-insights",
                    body: req,
                    as: InsightsResponse.self
                )
                await MainActor.run {
                    state = .loaded(result)
                    Haptics.success()
                }
            } catch {
                await MainActor.run {
                    state = .failed("Couldn't reach the coach right now. Try again in a moment.")
                    Haptics.warning()
                }
            }
        }
    }

    private func buildRequest() -> InsightsRequest {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let mealsByDate = Dictionary(grouping: last7Meals, by: \.date)
        // Oldest day first so the model reads it as a chronological timeline.
        let perDay: [DayTotal] = (0..<7).reversed().map { offset in
            let d = cal.date(byAdding: .day, value: -offset, to: today) ?? today
            let key = Self.ymd(d)
            let rows = mealsByDate[key] ?? []
            return DayTotal(
                date: key,
                calories: Int(rows.reduce(0) { $0 + $1.calories }),
                protein: Int(rows.reduce(0) { $0 + $1.proteinG }),
                carbs: Int(rows.reduce(0) { $0 + $1.carbsG }),
                fat: Int(rows.reduce(0) { $0 + $1.fatG }),
                mealCount: rows.count
            )
        }
        let totals = Totals(
            calories: Int(todayMeals.reduce(0) { $0 + $1.calories }),
            protein: Int(todayMeals.reduce(0) { $0 + $1.proteinG }),
            carbs: Int(todayMeals.reduce(0) { $0 + $1.carbsG }),
            fat: Int(todayMeals.reduce(0) { $0 + $1.fatG })
        )
        let mealsIn = todayMeals
            .sorted { $0.loggedAt < $1.loggedAt }
            .map { m in
                MealIn(
                    name: m.name,
                    loggedAt: m.loggedAt.formatted(date: .omitted, time: .shortened),
                    calories: Int(m.calories),
                    protein: Int(m.proteinG),
                    carbs: Int(m.carbsG),
                    fat: Int(m.fatG)
                )
            }
        return InsightsRequest(
            today: TodayPayload(totals: totals, meals: mealsIn),
            last7Days: perDay,
            targets: targets
        )
    }

    private static func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d)
    }
}

// MARK: - DTOs

struct NutritionTargetsIn: Encodable {
    let calories: Int?
    let protein: Int?
    let carbs: Int?
    let fat: Int?
}

private struct InsightsRequest: Encodable {
    let today: TodayPayload
    let last7Days: [DayTotal]
    let targets: NutritionTargetsIn
}

private struct TodayPayload: Encodable {
    let totals: Totals
    let meals: [MealIn]
}

private struct Totals: Encodable {
    let calories: Int
    let protein: Int
    let carbs: Int
    let fat: Int
}

private struct MealIn: Encodable {
    let name: String
    let loggedAt: String
    let calories: Int
    let protein: Int
    let carbs: Int
    let fat: Int
}

private struct DayTotal: Encodable {
    let date: String
    let calories: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let mealCount: Int
}

struct InsightsResponse: Decodable {
    let summary: String
    let insights: [Insight]
}

struct Insight: Decodable {
    let kind: String
    let title: String
    let detail: String
    let severity: String
}
