import SwiftUI

/// One actionable nutrition observation surfaced by the deterministic
/// on-device engine. Mirrors the rendering shape the card expects:
/// an SF-symbol icon, a short title, a one-line detail, a tint, and a
/// sentiment that colors the leading icon chip.
struct NutritionInsight: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let detail: String
    let tint: Color
    let sentiment: Sentiment

    enum Sentiment { case good, neutral, watch }
}

/// Headline weekly numbers the card header renders above the insight
/// rows. All values are window-averaged daily figures except
/// `weeklyBalanceKcal`, which is the projected 7-day energy balance.
struct NutritionWeeklyStats {
    /// Number of logged days inside the window (days with ≥1 meal).
    let loggedDays: Int
    let avgCalories: Double
    let avgProtein: Double
    let calorieGoal: Int
    let proteinGoal: Int
    /// Avg daily calories burned across days that have a health entry.
    /// nil when no DailyEntry carries energy data for the window.
    let avgBurnedKcal: Double?
    /// Projected weekly energy balance vs intake-minus-burn. Positive =
    /// surplus, negative = deficit. nil when burn data is absent.
    let weeklyBalanceKcal: Double?
    /// Per-day calorie totals, oldest-first, for the mini trend. Days
    /// with no meals are zero-filled so the series is contiguous.
    let dailyCalories: [(day: Date, value: Double)]
}

/// Deterministic, on-device nutrition intelligence. Pure functions over
/// the user's MealLog + DailyEntry history — no network, no AI, instant.
/// Everything is computed against a rolling `days`-length window ending
/// today. The engine never mutates its inputs.
enum NutritionInsightsEngine {
    /// "yyyy-MM-dd" in POSIX locale — matches how MealLog.date and
    /// DailyEntry.date are written, so string compares are valid.
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    // MARK: - Public API

    /// The full insight list. Returns an empty array when there's too
    /// little data to say anything useful (fewer than 3 logged days OR
    /// fewer than 6 meals) — the card renders its empty state instead.
    static func analyze(
        meals: [MealLog],
        daily: [DailyEntry],
        settings: UserSettings,
        days: Int
    ) -> [NutritionInsight] {
        let window = windowMeals(meals, days: days)
        let loggedDays = Set(window.map(\.date)).count
        guard loggedDays >= 3, window.count >= 6 else { return [] }

        var out: [NutritionInsight] = []
        if let i = proteinInsight(window, settings: settings, loggedDays: loggedDays) { out.append(i) }
        if let i = proteinDistributionInsight(window) { out.append(i) }
        if let i = timingInsight(window) { out.append(i) }
        if let i = consistencyInsight(window, settings: settings) { out.append(i) }
        if let i = balanceInsight(window, daily: daily, settings: settings, days: days) { out.append(i) }
        if let i = trendInsight(window, days: days) { out.append(i) }
        return out
    }

    /// Headline numbers for the card header. Safe to call even when
    /// `analyze` would return empty — values just reflect whatever is
    /// present (zeros when nothing is logged).
    static func weeklyStats(
        meals: [MealLog],
        daily: [DailyEntry],
        settings: UserSettings,
        days: Int
    ) -> NutritionWeeklyStats {
        let window = windowMeals(meals, days: days)
        let byDate = Dictionary(grouping: window, by: \.date)
        let loggedDays = byDate.count

        let totalCals = window.reduce(0) { $0 + $1.calories }
        let totalProt = window.reduce(0) { $0 + $1.proteinG }
        let avgCals = loggedDays > 0 ? totalCals / Double(loggedDays) : 0
        let avgProt = loggedDays > 0 ? totalProt / Double(loggedDays) : 0

        // Burn: average across DailyEntry rows inside the window that
        // carry an energy figure (total preferred, active as fallback).
        let dayKeys = Set(windowDayKeys(days: days))
        let burns: [Double] = daily.compactMap { entry in
            guard dayKeys.contains(entry.date) else { return nil }
            return entry.totalCaloriesKcal ?? entry.activeEnergyKcal
        }
        let avgBurned: Double? = burns.isEmpty ? nil : burns.reduce(0, +) / Double(burns.count)

        // Weekly balance is intake-vs-burn projected over 7 days. We use
        // the logged-day average intake against the average burn so a
        // partial-logging week still reads sensibly.
        let weeklyBalance: Double? = avgBurned.map { (avgCals - $0) * 7 }

        let dailyCals: [(day: Date, value: Double)] = orderedWindowDays(days: days).map { (date, key) in
            let rows = byDate[key] ?? []
            return (date, rows.reduce(0) { $0 + $1.calories })
        }

        return NutritionWeeklyStats(
            loggedDays: loggedDays,
            avgCalories: avgCals,
            avgProtein: avgProt,
            calorieGoal: settings.caloriesGoal,
            proteinGoal: settings.proteinGoal,
            avgBurnedKcal: avgBurned,
            weeklyBalanceKcal: weeklyBalance,
            dailyCalories: dailyCals
        )
    }

    // MARK: - Window helpers

    /// Meals falling on or after the window's earliest day. String date
    /// compares are valid because the format sorts lexicographically.
    private static func windowMeals(_ meals: [MealLog], days: Int) -> [MealLog] {
        guard let earliest = windowDayKeys(days: days).first else { return meals }
        return meals.filter { $0.date >= earliest }
    }

    /// Window day keys, oldest-first.
    private static func windowDayKeys(days: Int) -> [String] {
        orderedWindowDays(days: days).map(\.1)
    }

    /// (Date, "yyyy-MM-dd") for each day in the window, oldest-first.
    private static func orderedWindowDays(days: Int) -> [(Date, String)] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let span = max(days, 1)
        return (0..<span).reversed().compactMap { offset in
            guard let d = cal.date(byAdding: .day, value: -offset, to: today) else { return nil }
            return (d, ymd.string(from: d))
        }
    }

    /// Resolve a meal's bucket — honor the explicit override, else
    /// re-derive from loggedAt so pre-migration rows still bucket.
    private static func bucket(_ m: MealLog) -> String {
        m.mealType.isEmpty ? MealLog.deriveMealType(at: m.loggedAt) : m.mealType
    }

    // MARK: - 1. Protein adequacy

    private static func proteinInsight(
        _ window: [MealLog],
        settings: UserSettings,
        loggedDays: Int
    ) -> NutritionInsight? {
        guard settings.proteinGoal > 0, loggedDays > 0 else { return nil }
        let avg = window.reduce(0) { $0 + $1.proteinG } / Double(loggedDays)
        let goal = Double(settings.proteinGoal)
        let pct = avg / goal

        if pct >= 0.95 {
            return NutritionInsight(
                icon: "figure.strengthtraining.traditional",
                title: "Protein on point",
                detail: "Averaging \(Int(avg))g/day against your \(settings.proteinGoal)g goal — right where muscle wants it.",
                tint: LifeOSColor.Metric.protein,
                sentiment: .good
            )
        }
        let shortG = Int((goal - avg).rounded())
        return NutritionInsight(
            icon: "figure.strengthtraining.traditional",
            title: "Protein running low",
            detail: "Averaging \(Int(avg))g/day — about \(shortG)g under your \(settings.proteinGoal)g target.",
            tint: LifeOSColor.Metric.protein,
            sentiment: pct < 0.75 ? .watch : .neutral
        )
    }

    // MARK: - 2. Protein distribution

    private static func proteinDistributionInsight(_ window: [MealLog]) -> NutritionInsight? {
        // Share of total protein landing in each meal bucket. MPS favors
        // an even spread; flag when a single meal dominates the day.
        let total = window.reduce(0) { $0 + $1.proteinG }
        guard total > 0 else { return nil }

        var byBucket: [String: Double] = [:]
        for m in window { byBucket[bucket(m), default: 0] += m.proteinG }
        guard let (topBucket, topG) = byBucket.max(by: { $0.value < $1.value }) else { return nil }
        let share = topG / total

        if share >= 0.5 {
            return NutritionInsight(
                icon: "chart.bar.fill",
                title: "Protein bunched up",
                detail: "\(Int(share * 100))% of your protein lands at \(label(topBucket)). Spreading it across meals helps muscle synthesis.",
                tint: LifeOSColor.Metric.protein,
                sentiment: .watch
            )
        }
        if share <= 0.4 {
            return NutritionInsight(
                icon: "chart.bar.fill",
                title: "Protein well spread",
                detail: "Evenly distributed across the day — no single meal carries more than \(Int(share * 100))%.",
                tint: LifeOSColor.Metric.protein,
                sentiment: .good
            )
        }
        return nil
    }

    // MARK: - 3. Meal timing

    private static func timingInsight(_ window: [MealLog]) -> NutritionInsight? {
        let total = window.reduce(0) { $0 + $1.calories }
        guard total > 0 else { return nil }

        // Calories logged at/after 6pm (18:00) by loggedAt hour.
        let cal = Calendar.current
        let lateCals = window
            .filter { cal.component(.hour, from: $0.loggedAt) >= 18 }
            .reduce(0) { $0 + $1.calories }
        let lateShare = lateCals / total

        if lateShare >= 0.55 {
            return NutritionInsight(
                icon: "moon.stars.fill",
                title: "Calories skew late",
                detail: "\(Int(lateShare * 100))% of your calories land after 6pm. Front-loading the day can steady energy and sleep.",
                tint: LifeOSColor.warning,
                sentiment: .watch
            )
        }

        // Otherwise call out the longest eating window — first to last
        // meal of an average logged day. Compute per-day spans, average.
        let byDate = Dictionary(grouping: window, by: \.date)
        let spans: [Double] = byDate.values.compactMap { rows in
            let times = rows.map(\.loggedAt)
            guard let first = times.min(), let last = times.max(), last > first else { return nil }
            return last.timeIntervalSince(first) / 3600
        }
        guard !spans.isEmpty else { return nil }
        let avgSpan = spans.reduce(0, +) / Double(spans.count)
        if avgSpan <= 10 {
            return NutritionInsight(
                icon: "clock.fill",
                title: "Tight eating window",
                detail: "Your meals cluster into about a \(String(format: "%.0f", avgSpan))-hour daily window — a naturally lean feeding pattern.",
                tint: LifeOSColor.Metric.calories,
                sentiment: .good
            )
        }
        return NutritionInsight(
            icon: "clock.fill",
            title: "Eating window",
            detail: "You eat across roughly \(String(format: "%.0f", avgSpan)) hours a day, balanced morning to evening.",
            tint: LifeOSColor.Metric.calories,
            sentiment: .neutral
        )
    }

    // MARK: - 4. Calorie consistency

    private static func consistencyInsight(
        _ window: [MealLog],
        settings: UserSettings
    ) -> NutritionInsight? {
        let byDate = Dictionary(grouping: window, by: \.date)
        let dayTotals = byDate.values.map { rows in rows.reduce(0) { $0 + $1.calories } }
        guard dayTotals.count >= 3 else { return nil }

        let mean = dayTotals.reduce(0, +) / Double(dayTotals.count)
        guard mean > 0 else { return nil }
        let variance = dayTotals.reduce(0) { $0 + pow($1 - mean, 2) } / Double(dayTotals.count)
        let cv = sqrt(variance) / mean  // coefficient of variation

        if cv <= 0.18 {
            return NutritionInsight(
                icon: "waveform.path.ecg",
                title: "Rock-steady intake",
                detail: "Your daily calories barely move day to day (±\(Int(cv * 100))%). Consistency is what drives results.",
                tint: LifeOSColor.success,
                sentiment: .good
            )
        }
        if cv >= 0.35 {
            return NutritionInsight(
                icon: "waveform.path.ecg",
                title: "Intake on a rollercoaster",
                detail: "Daily calories swing ±\(Int(cv * 100))% around your average — smoothing this out helps adherence.",
                tint: LifeOSColor.warning,
                sentiment: .watch
            )
        }
        return nil
    }

    // MARK: - 5. Weekly deficit / surplus

    private static func balanceInsight(
        _ window: [MealLog],
        daily: [DailyEntry],
        settings: UserSettings,
        days: Int
    ) -> NutritionInsight? {
        let byDate = Dictionary(grouping: window, by: \.date)
        let loggedDays = byDate.count
        guard loggedDays >= 3 else { return nil }
        let avgIntake = window.reduce(0) { $0 + $1.calories } / Double(loggedDays)

        // Prefer measured burn; fall back to the calorie goal as the
        // maintenance proxy when no health data is present.
        let dayKeys = Set(windowDayKeys(days: days))
        let burns: [Double] = daily.compactMap { entry in
            guard dayKeys.contains(entry.date) else { return nil }
            return entry.totalCaloriesKcal ?? entry.activeEnergyKcal
        }
        let reference: Double
        let referenceLabel: String
        if !burns.isEmpty {
            reference = burns.reduce(0, +) / Double(burns.count)
            referenceLabel = "burned"
        } else if settings.caloriesGoal > 0 {
            reference = Double(settings.caloriesGoal)
            referenceLabel = "goal"
        } else {
            return nil
        }

        let dailyDelta = avgIntake - reference  // + = surplus
        // 3500 kcal ≈ 1 lb. Weekly lb trajectory from the daily delta.
        let weeklyLb = (dailyDelta * 7) / 3500
        let magnitude = abs(dailyDelta)

        if magnitude < 120 {
            return NutritionInsight(
                icon: "scalemass.fill",
                title: "Holding maintenance",
                detail: "Intake (~\(Int(avgIntake)) kcal/day) sits right at \(referenceLabel) — a roughly weight-stable week.",
                tint: LifeOSColor.Metric.weight,
                sentiment: .neutral
            )
        }
        let surplus = dailyDelta > 0
        let dir = surplus ? "surplus" : "deficit"
        let traj = String(format: "%.1f", abs(weeklyLb))
        return NutritionInsight(
            icon: "scalemass.fill",
            title: surplus ? "Running a surplus" : "Running a deficit",
            detail: "~\(Int(magnitude)) kcal/day \(dir) vs \(referenceLabel) → about \(traj) lb/week \(surplus ? "gain" : "loss") trajectory.",
            tint: surplus ? LifeOSColor.warning : LifeOSColor.success,
            sentiment: .neutral
        )
    }

    // MARK: - 6. Trend

    private static func trendInsight(_ window: [MealLog], days: Int) -> NutritionInsight? {
        // Split the window in half and compare average daily protein
        // across logged days in each half. Needs both halves populated.
        let mid = orderedWindowDays(days: days)
        guard mid.count >= 4 else { return nil }
        let half = mid.count / 2
        let firstKeys = Set(mid.prefix(half).map(\.1))
        let secondKeys = Set(mid.suffix(mid.count - half).map(\.1))

        func avgProtein(_ keys: Set<String>) -> Double? {
            let rows = window.filter { keys.contains($0.date) }
            let d = Set(rows.map(\.date)).count
            guard d > 0 else { return nil }
            return rows.reduce(0) { $0 + $1.proteinG } / Double(d)
        }
        guard let early = avgProtein(firstKeys), let late = avgProtein(secondKeys), early > 0 else { return nil }
        let change = (late - early) / early

        guard abs(change) >= 0.12 else { return nil }
        let rising = change > 0
        return NutritionInsight(
            icon: rising ? "chart.line.uptrend.xyaxis" : "chart.line.downtrend.xyaxis",
            title: rising ? "Protein trending up" : "Protein trending down",
            detail: "Daily protein is \(rising ? "up" : "down") about \(Int(abs(change) * 100))% versus the start of the window.",
            tint: LifeOSColor.Metric.protein,
            sentiment: rising ? .good : .watch
        )
    }

    // MARK: - Misc

    private static func label(_ bucket: String) -> String {
        switch bucket {
        case "breakfast": return "breakfast"
        case "lunch":     return "lunch"
        case "dinner":    return "dinner"
        default:          return "snacks"
        }
    }
}
