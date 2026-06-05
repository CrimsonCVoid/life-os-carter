import SwiftUI

/// Deep nutrition analytics — TDEE estimation from intake-vs-weight movement,
/// macro timing/distribution, protein adequacy, and a weekly adherence report.
/// Pure functions over MealLog + DailyEntry history; no network, no AI. Small-N
/// honest: every output returns nil/[] below its sample gate.
enum NutritionIntelligenceEngine {

    // MARK: - Series points (continuous-axis safe)

    struct EnergyBalanceDay: Identifiable, Hashable {
        var id: Date { day }
        let day: Date
        let intake: Double
        let tdee: Double?
        let weight: Double?
    }

    struct ProteinDay: Identifiable, Hashable {
        var id: Date { day }
        let day: Date
        let gramsPerKg: Double
        let grams: Double
    }

    struct MacroSplitDay: Identifiable, Hashable {
        var id: Date { day }
        let day: Date
        let proteinFrac: Double
        let carbsFrac: Double
        let fatFrac: Double
    }

    struct EatingWindowDay: Identifiable, Hashable {
        var id: Date { day }
        let day: Date
        let firstHour: Double
        let lastHour: Double
        let lateNight: Bool
    }

    struct TDEEEstimate {
        let tdee: Double
        let avgIntake: Double
        let dailyDeltaKcal: Double
        let weeklyTrendLb: Double
        let confidence: Double
        let loggedDays: Int
        let method: Method
        enum Method { case regression, energyBalance }
    }

    struct WeeklyReport {
        let loggedDays: Int
        let calorieAdherencePct: Double
        let proteinAdherencePct: Double
        let proteinStreak: Int
        let bestDay: DayScore?
        let worstDay: DayScore?
        let calorieDeltaVsPrior: Double?
        let proteinDeltaVsPrior: Double?
        struct DayScore { let day: Date; let score: Double; let kcal: Double; let protein: Double }
    }

    // MARK: - TDEE

    static func estimateTDEE(
        meals: [MealLog], daily: [DailyEntry], settings: UserSettings, days: Int = 28
    ) -> TDEEEstimate? {
        let ordered = orderedWindowDays(days: days)
        let keys = ordered.map(\.1)
        let window = meals.filter { keys.contains($0.date) }
        let intakeByDate = Dictionary(grouping: window, by: \.date)
            .mapValues { $0.reduce(0) { $0 + $1.calories } }
        let loggedKeys = keys.filter { (intakeByDate[$0] ?? 0) > 0 }
        let loggedDays = loggedKeys.count
        guard loggedDays >= 7 else { return nil }
        let avgIntake = loggedKeys.reduce(0.0) { $0 + (intakeByDate[$1] ?? 0) } / Double(loggedDays)

        let dailyByDate = Dictionary(daily.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        let weighIns: [(x: Double, y: Double)] = ordered.enumerated().compactMap { i, pair in
            guard let w = dailyByDate[pair.1]?.weightLb else { return nil }
            return (Double(i), w)
        }

        if loggedDays >= 14, weighIns.count >= 2,
           let (slope, _) = leastSquares(weighIns),
           let firstX = weighIns.first?.x, let lastX = weighIns.last?.x, lastX - firstX >= 10 {
            let impliedDeficit = slope * 3500
            let tdee = avgIntake - impliedDeficit
            guard tdee > 800, tdee < 6000 else {
                return energyBalanceFallback(avgIntake, slope, loggedDays, settings)
            }
            let spanDays = lastX - firstX
            let conf = min(1, Double(loggedDays) / 28.0) * min(1, spanDays / 21.0) * min(1, Double(weighIns.count) / 8.0)
            return TDEEEstimate(
                tdee: tdee, avgIntake: avgIntake, dailyDeltaKcal: avgIntake - tdee,
                weeklyTrendLb: slope * 7, confidence: max(0.25, conf),
                loggedDays: loggedDays, method: .regression)
        }
        return energyBalanceFallback(avgIntake, slopeFallback(weighIns), loggedDays, settings)
    }

    private static func slopeFallback(_ pts: [(x: Double, y: Double)]) -> Double {
        guard pts.count >= 2, let (s, _) = leastSquares(pts) else { return 0 }
        return s
    }

    private static func energyBalanceFallback(
        _ avgIntake: Double, _ kLbPerDay: Double, _ loggedDays: Int, _ settings: UserSettings
    ) -> TDEEEstimate? {
        guard settings.caloriesGoal > 0 else { return nil }
        let tdee = Double(settings.caloriesGoal)
        return TDEEEstimate(
            tdee: tdee, avgIntake: avgIntake, dailyDeltaKcal: avgIntake - tdee,
            weeklyTrendLb: kLbPerDay * 7, confidence: 0.2,
            loggedDays: loggedDays, method: .energyBalance)
    }

    // MARK: - Series builders

    static func energyBalanceSeries(
        meals: [MealLog], daily: [DailyEntry], settings: UserSettings, days: Int = 30
    ) -> [EnergyBalanceDay] {
        let ordered = orderedWindowDays(days: days)
        let intakeByDate = Dictionary(grouping: windowMeals(meals, days: days), by: \.date)
            .mapValues { $0.reduce(0) { $0 + $1.calories } }
        let dailyByDate = Dictionary(daily.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        let est = estimateTDEE(meals: meals, daily: daily, settings: settings, days: days)
        return ordered.map { date, key in
            EnergyBalanceDay(day: date, intake: intakeByDate[key] ?? 0,
                             tdee: est?.tdee, weight: dailyByDate[key]?.weightLb)
        }
    }

    static func proteinAdequacySeries(
        meals: [MealLog], daily: [DailyEntry], days: Int = 30
    ) -> [ProteinDay] {
        let ordered = orderedWindowDays(days: days)
        let keys = ordered.map(\.1)
        let byDate = Dictionary(grouping: windowMeals(meals, days: days), by: \.date)
        let dailyByDate = Dictionary(daily.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        return ordered.compactMap { date, key in
            let rows = byDate[key] ?? []
            guard !rows.isEmpty else { return nil }
            let g = rows.reduce(0) { $0 + $1.proteinG }
            guard let kg = bodyweightKg(on: key, dailyByDate: dailyByDate, orderedKeys: keys), kg > 0 else { return nil }
            return ProteinDay(day: date, gramsPerKg: g / kg, grams: g)
        }
    }

    static func macroSplitSeries(meals: [MealLog], days: Int = 30) -> [MacroSplitDay] {
        let byDate = Dictionary(grouping: windowMeals(meals, days: days), by: \.date)
        return orderedWindowDays(days: days).compactMap { date, key in
            let rows = byDate[key] ?? []
            let p = rows.reduce(0) { $0 + $1.proteinG } * 4
            let c = rows.reduce(0) { $0 + $1.carbsG } * 4
            let f = rows.reduce(0) { $0 + $1.fatG } * 9
            let total = p + c + f
            guard total > 0 else { return nil }
            return MacroSplitDay(day: date, proteinFrac: p / total, carbsFrac: c / total, fatFrac: f / total)
        }
    }

    static func eatingWindowSeries(meals: [MealLog], days: Int = 14) -> [EatingWindowDay] {
        let cal = Calendar.current
        let byDate = Dictionary(grouping: windowMeals(meals, days: days), by: \.date)
        return orderedWindowDays(days: days).compactMap { date, key in
            let rows = byDate[key] ?? []
            guard let first = rows.map(\.loggedAt).min(), let last = rows.map(\.loggedAt).max() else { return nil }
            func hour(_ d: Date) -> Double {
                let c = cal.dateComponents([.hour, .minute], from: d)
                return Double(c.hour ?? 0) + Double(c.minute ?? 0) / 60
            }
            let lh = hour(last)
            return EatingWindowDay(day: date, firstHour: hour(first), lastHour: lh, lateNight: lh >= 21)
        }
    }

    // MARK: - Weekly report

    static func weeklyReport(meals: [MealLog], daily: [DailyEntry], settings: UserSettings) -> WeeklyReport? {
        let thisWeek = orderedWindowDays(days: 7)
        let priorWeek = Array(orderedWindowDays(days: 14).prefix(7))
        let byDate = Dictionary(grouping: meals, by: \.date)
        func totals(_ key: String) -> (kcal: Double, protein: Double)? {
            let rows = byDate[key] ?? []
            guard !rows.isEmpty else { return nil }
            return (rows.reduce(0) { $0 + $1.calories }, rows.reduce(0) { $0 + $1.proteinG })
        }
        let logged = thisWeek.compactMap { (d, k) -> (Date, Double, Double)? in
            guard let t = totals(k) else { return nil }; return (d, t.kcal, t.protein)
        }
        guard logged.count >= 3 else { return nil }

        let calGoal = Double(settings.caloriesGoal), protGoal = Double(settings.proteinGoal)
        let calHits = calGoal > 0 ? logged.filter { abs($0.1 - calGoal) <= calGoal * 0.15 }.count : 0
        let protHits = protGoal > 0 ? logged.filter { $0.2 >= protGoal * 0.9 }.count : 0

        var streak = 0
        if protGoal > 0 {
            for (_, k) in thisWeek.reversed() {   // oldest-first reversed = newest-first
                guard let t = totals(k), t.protein >= protGoal * 0.9 else { break }
                streak += 1
            }
        }

        func score(_ kcal: Double, _ prot: Double) -> Double {
            let calScore = calGoal > 0 ? max(0, 1 - abs(kcal - calGoal) / calGoal) : 0.5
            let protScore = protGoal > 0 ? min(1, prot / protGoal) : 0.5
            return 0.5 * calScore + 0.5 * protScore
        }
        let scored = logged.map { WeeklyReport.DayScore(day: $0.0, score: score($0.1, $0.2), kcal: $0.1, protein: $0.2) }
        let best = scored.max { $0.score < $1.score }
        let worst = scored.min { $0.score < $1.score }

        let priorLogged = priorWeek.compactMap { totals($0.1) }
        let calDelta: Double? = priorLogged.count >= 3
            ? (logged.map(\.1).reduce(0, +) / Double(logged.count)) - (priorLogged.map(\.kcal).reduce(0, +) / Double(priorLogged.count))
            : nil
        let protDelta: Double? = priorLogged.count >= 3
            ? (logged.map(\.2).reduce(0, +) / Double(logged.count)) - (priorLogged.map(\.protein).reduce(0, +) / Double(priorLogged.count))
            : nil

        return WeeklyReport(
            loggedDays: logged.count,
            calorieAdherencePct: Double(calHits) / Double(logged.count),
            proteinAdherencePct: Double(protHits) / Double(logged.count),
            proteinStreak: streak, bestDay: best, worstDay: worst,
            calorieDeltaVsPrior: calDelta, proteinDeltaVsPrior: protDelta)
    }

    // MARK: - Feed insights

    static func dataInsights(meals: [MealLog], daily: [DailyEntry], settings: UserSettings) -> [DataInsight] {
        var out: [DataInsight] = []
        out += tdeeInsight(meals: meals, daily: daily, settings: settings)
        out += proteinPerKgInsight(meals: meals, daily: daily, settings: settings)
        out += lateEatingInsight(meals: meals)
        out += eatingWindowConsistencyInsight(meals: meals)
        return out
    }

    private static func tdeeInsight(meals: [MealLog], daily: [DailyEntry], settings: UserSettings) -> [DataInsight] {
        guard let est = estimateTDEE(meals: meals, daily: daily, settings: settings),
              est.method == .regression, est.confidence >= 0.45 else { return [] }
        let surplus = est.dailyDeltaKcal > 0
        let mag = Int(abs(est.dailyDeltaKcal).rounded())
        let lb = String(format: "%.1f", abs(est.weeklyTrendLb))
        return [DataInsight(
            kind: .trend,
            title: "Your measured TDEE is ~\(Int(est.tdee.rounded())) kcal",
            detail: "From \(est.loggedDays) days of intake against your real weight movement, your maintenance lands near \(Int(est.tdee.rounded())) kcal. You're averaging \(Int(est.avgIntake.rounded())) — a \(mag) kcal/day \(surplus ? "surplus" : "deficit"), tracking about \(lb) lb/week \(surplus ? "gain" : "loss"). This is computed from your data, not a formula.",
            icon: "scalemass.fill", tint: LifeOSColor.Metric.weight,
            sentiment: .neutral, score: 58 + est.confidence * 24)]
    }

    private static func proteinPerKgInsight(meals: [MealLog], daily: [DailyEntry], settings: UserSettings) -> [DataInsight] {
        let series = proteinAdequacySeries(meals: meals, daily: daily, days: 21)
        guard series.count >= 6 else { return [] }
        let avg = series.map(\.gramsPerKg).reduce(0, +) / Double(series.count)
        if avg >= 1.6 {
            return [DataInsight(
                kind: .tip, title: "Protein intake is dialed in",
                detail: "You're averaging \(String(format: "%.1f", avg)) g/kg bodyweight over \(series.count) logged days — comfortably inside the 1.6–2.2 g/kg range that maximizes muscle retention and growth.",
                icon: "figure.strengthtraining.traditional", tint: LifeOSColor.Metric.protein,
                sentiment: .positive, score: 54)]
        }
        if avg < 1.2 {
            return [DataInsight(
                kind: .tip, title: "Protein is below the muscle-growth range",
                detail: "You're averaging \(String(format: "%.1f", avg)) g/kg — under the 1.6 g/kg floor for hypertrophy. At your bodyweight that's a meaningful gap; an extra serving of a lean protein per day closes most of it.",
                icon: "figure.strengthtraining.traditional", tint: LifeOSColor.Metric.protein,
                sentiment: .watch, score: 64)]
        }
        return []
    }

    private static func lateEatingInsight(meals: [MealLog]) -> [DataInsight] {
        let series = eatingWindowSeries(meals: meals, days: 21)
        guard series.count >= 6 else { return [] }
        let lateCount = series.filter(\.lateNight).count
        guard Double(lateCount) / Double(series.count) >= 0.5 else { return [] }
        return [DataInsight(
            kind: .correlation, title: "You eat past 9pm most nights",
            detail: "On \(lateCount) of \(series.count) logged days your last meal landed after 9:00pm. Late eating is one of the most common drags on deep sleep and morning hunger — pulling dinner earlier is a cheap experiment.",
            icon: "moon.stars.fill", tint: LifeOSColor.warning, sentiment: .watch, score: 50)]
    }

    private static func eatingWindowConsistencyInsight(meals: [MealLog]) -> [DataInsight] {
        let series = eatingWindowSeries(meals: meals, days: 21)
        guard series.count >= 8 else { return [] }
        let spans = series.map { $0.lastHour - $0.firstHour }
        let mean = spans.reduce(0, +) / Double(spans.count)
        guard mean > 0 else { return [] }
        let sd = (spans.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(spans.count)).squareRoot()
        guard sd / mean <= 0.18 else { return [] }
        return [DataInsight(
            kind: .streak, title: "Your eating window is remarkably steady",
            detail: "Across \(series.count) days your feeding window holds at about \(String(format: "%.0f", mean)) hours with little drift. A consistent eating rhythm steadies energy and makes hunger predictable.",
            icon: "clock.fill", tint: LifeOSColor.success, sentiment: .positive, score: 46)]
    }

    // MARK: - Window helpers (self-contained)

    private static func orderedWindowDays(days: Int, asOf: Date = Date()) -> [(Date, String)] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: asOf)
        return (0..<max(1, days)).reversed().compactMap { off in
            cal.date(byAdding: .day, value: -off, to: today).map { ($0, ymd.string(from: $0)) }
        }
    }

    private static func windowMeals(_ meals: [MealLog], days: Int) -> [MealLog] {
        let keys = Set(orderedWindowDays(days: days).map(\.1))
        return meals.filter { keys.contains($0.date) }
    }

    private static func bodyweightKg(on day: String, dailyByDate: [String: DailyEntry], orderedKeys: [String]) -> Double? {
        if let w = dailyByDate[day]?.weightLb { return w / 2.2046226 }
        guard let idx = orderedKeys.firstIndex(of: day) else { return nil }
        for k in orderedKeys[..<idx].reversed() {
            if let w = dailyByDate[k]?.weightLb { return w / 2.2046226 }
        }
        return nil
    }

    private static func leastSquares(_ pts: [(x: Double, y: Double)]) -> (slope: Double, intercept: Double)? {
        let n = Double(pts.count)
        guard n >= 2 else { return nil }
        let sx = pts.reduce(0) { $0 + $1.x }, sy = pts.reduce(0) { $0 + $1.y }
        let sxx = pts.reduce(0) { $0 + $1.x * $1.x }, sxy = pts.reduce(0) { $0 + $1.x * $1.y }
        let denom = n * sxx - sx * sx
        guard denom != 0 else { return nil }
        let slope = (n * sxy - sx * sy) / denom
        return (slope, (sy - slope * sx) / n)
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
}
