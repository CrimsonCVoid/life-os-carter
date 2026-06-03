import Foundation
import SwiftUI

/// On-device weekly review — a deterministic, instant, free roll-up of
/// the last 7 days vs the prior 7, across every pillar. No AI, no
/// network: the coach's narrative is computed from the same SwiftData
/// rows the rest of the app already holds. Produced once and rendered
/// by `WeeklyReviewView` / teased by `WeeklyReviewCard`.
struct WeeklyReview {
    /// Human label for the reviewed window, e.g. "May 27 – Jun 2".
    let weekLabel: String
    /// One-line summary that leads the screen and the teaser card.
    let headline: String
    /// Every pillar delta, ordered for display.
    let metrics: [Metric]
    /// 2–3 strongest / most-improved areas, phrased to motivate.
    let wins: [String]
    /// 1–3 areas that regressed or sit below target.
    let watchOuts: [String]

    /// A single pillar comparison: this-week value vs last-week value,
    /// with a signed delta the view turns into an arrow + good/bad color.
    struct Metric: Identifiable {
        let id = UUID()
        let name: String
        /// Pre-formatted display strings so the view stays dumb.
        let thisWeek: String
        let lastWeek: String
        /// Signed raw delta (thisWeek − lastWeek) in the metric's native
        /// unit. Drives arrow direction and, combined with
        /// `higherIsBetter`, the success/danger tint.
        let delta: Double
        /// When false (e.g. resting HR), a *negative* delta is the good
        /// outcome — the view flips the color accordingly.
        let higherIsBetter: Bool
        let tint: Color
    }
}

enum WeeklyReviewEngine {

    // MARK: - Public API

    /// Build a review for the 7 days ending on `asOf` (inclusive),
    /// compared against the 7 days before that. Returns nil when there
    /// isn't enough history to say anything honest — the caller shows a
    /// clean empty state in that case.
    static func build(
        daily: [DailyEntry],
        meals: [MealLog],
        lifts: [LiftSessionEntry],
        habits: [HabitEntry],
        settings: UserSettings,
        asOf: Date
    ) -> WeeklyReview? {
        let cal = Calendar.current
        let today = cal.startOfDay(for: asOf)

        // This week = today and the 6 days before; last week = the 7
        // days before that. Both windows are inclusive day ranges.
        let thisStart = cal.date(byAdding: .day, value: -6, to: today) ?? today
        let lastEnd = cal.date(byAdding: .day, value: -7, to: today) ?? today
        let lastStart = cal.date(byAdding: .day, value: -13, to: today) ?? today

        let thisKeys = dayKeys(from: thisStart, to: today, cal: cal)
        let lastKeys = dayKeys(from: lastStart, to: lastEnd, cal: cal)
        let thisSet = Set(thisKeys)
        let lastSet = Set(lastKeys)

        // Gate: need at least 4 days of *any* signal in the current week
        // before a "weekly review" is meaningful. Below that the deltas
        // are noise and we'd be inventing a story.
        let daysWithSignal = thisKeys.filter { key in
            daily.contains { $0.date == key && hasAnySignal($0) }
                || meals.contains { $0.date == key }
                || lifts.contains { $0.date == key }
        }.count
        guard daysWithSignal >= 4 else { return nil }

        let thisDaily = daily.filter { thisSet.contains($0.date) }
        let lastDaily = daily.filter { lastSet.contains($0.date) }
        let thisMeals = meals.filter { thisSet.contains($0.date) }
        let lastMeals = meals.filter { lastSet.contains($0.date) }
        let thisLifts = lifts.filter { thisSet.contains($0.date) }
        let lastLifts = lifts.filter { lastSet.contains($0.date) }

        var metrics: [WeeklyReview.Metric] = []

        // ----- Sleep (avg hours) -----
        let sleepNow = avg(thisDaily.compactMap(\.sleepHours))
        let sleepPrev = avg(lastDaily.compactMap(\.sleepHours))
        if let m = metric(
            name: "Sleep",
            now: sleepNow, prev: sleepPrev,
            format: hoursFmt,
            higherIsBetter: true,
            tint: LifeOSColor.Metric.sleep
        ) { metrics.append(m) }

        // ----- Recovery: HRV vs baseline, RHR vs baseline -----
        let hrvNow = avg(thisDaily.compactMap(\.hrvMs))
        let hrvPrev = avg(lastDaily.compactMap(\.hrvMs))
        if let m = metric(
            name: "HRV",
            now: hrvNow, prev: hrvPrev,
            format: { intFmt($0, unit: "ms") },
            higherIsBetter: true,
            tint: LifeOSColor.Metric.hrv
        ) { metrics.append(m) }

        let rhrNow = avg(thisDaily.compactMap(\.restingHr))
        let rhrPrev = avg(lastDaily.compactMap(\.restingHr))
        if let m = metric(
            name: "Resting HR",
            now: rhrNow, prev: rhrPrev,
            format: { intFmt($0, unit: "bpm") },
            higherIsBetter: false,
            tint: LifeOSColor.Metric.rhr
        ) { metrics.append(m) }

        // ----- Activity: steps, active kcal, workouts -----
        let stepsNow = avg(thisDaily.compactMap { $0.steps.map(Double.init) })
        let stepsPrev = avg(lastDaily.compactMap { $0.steps.map(Double.init) })
        if let m = metric(
            name: "Steps",
            now: stepsNow, prev: stepsPrev,
            format: stepsFmt,
            higherIsBetter: true,
            tint: LifeOSColor.Metric.steps
        ) { metrics.append(m) }

        let activeNow = avg(thisDaily.compactMap(\.activeEnergyKcal))
        let activePrev = avg(lastDaily.compactMap(\.activeEnergyKcal))
        if let m = metric(
            name: "Active Burn",
            now: activeNow, prev: activePrev,
            format: { intFmt($0, unit: "kcal") },
            higherIsBetter: true,
            tint: LifeOSColor.Metric.calories
        ) { metrics.append(m) }

        // Workout count is always present (zero is a real value), so it
        // doesn't go through the nil-gated `metric` helper.
        let workoutsNow = Double(thisLifts.count)
        let workoutsPrev = Double(lastLifts.count)
        metrics.append(WeeklyReview.Metric(
            name: "Workouts",
            thisWeek: "\(thisLifts.count)",
            lastWeek: "\(lastLifts.count)",
            delta: workoutsNow - workoutsPrev,
            higherIsBetter: true,
            tint: LifeOSColor.Metric.strain
        ))

        let volNow = thisLifts.map(\.totalVolumeLb).reduce(0, +)
        let volPrev = lastLifts.map(\.totalVolumeLb).reduce(0, +)
        if volNow > 0 || volPrev > 0 {
            metrics.append(WeeklyReview.Metric(
                name: "Lift Volume",
                thisWeek: volumeFmt(volNow),
                lastWeek: volumeFmt(volPrev),
                delta: volNow - volPrev,
                higherIsBetter: true,
                tint: LifeOSColor.Metric.strain
            ))
        }

        // ----- Nutrition: avg calories (vs goal context), avg protein -----
        let calNow = avgDailyTotal(thisMeals, keys: thisKeys, value: \.calories)
        let calPrev = avgDailyTotal(lastMeals, keys: lastKeys, value: \.calories)
        if calNow != nil || calPrev != nil {
            metrics.append(WeeklyReview.Metric(
                name: "Calories",
                thisWeek: calNow.map { intFmt($0, unit: "kcal") } ?? "—",
                lastWeek: calPrev.map { intFmt($0, unit: "kcal") } ?? "—",
                delta: (calNow ?? 0) - (calPrev ?? 0),
                // Closer-to-goal is "better", but calories don't have a
                // simple monotonic direction; we treat the delta as
                // neutral-informational by anchoring to the goal in the
                // win/watch logic, and present the arrow without a hard
                // good/bad tint by marking higherIsBetter true (the view
                // still shows direction; nutrition judgement lives in the
                // wins/watch-outs, not the row color).
                higherIsBetter: true,
                tint: LifeOSColor.Metric.calories
            ))
        }

        let protNow = avgDailyTotal(thisMeals, keys: thisKeys, value: \.proteinG)
        let protPrev = avgDailyTotal(lastMeals, keys: lastKeys, value: \.proteinG)
        if protNow != nil || protPrev != nil {
            metrics.append(WeeklyReview.Metric(
                name: "Protein",
                thisWeek: protNow.map { intFmt($0, unit: "g") } ?? "—",
                lastWeek: protPrev.map { intFmt($0, unit: "g") } ?? "—",
                delta: (protNow ?? 0) - (protPrev ?? 0),
                higherIsBetter: true,
                tint: LifeOSColor.Metric.protein
            ))
        }

        // ----- Mood & energy -----
        let moodNow = avg(thisDaily.compactMap { $0.moodScore.map(Double.init) })
        let moodPrev = avg(lastDaily.compactMap { $0.moodScore.map(Double.init) })
        if let m = metric(
            name: "Mood",
            now: moodNow, prev: moodPrev,
            format: { decFmt($0, unit: "/10") },
            higherIsBetter: true,
            tint: LifeOSColor.Metric.mood
        ) { metrics.append(m) }

        let energyNow = avg(thisDaily.compactMap { $0.energyScore.map(Double.init) })
        let energyPrev = avg(lastDaily.compactMap { $0.energyScore.map(Double.init) })
        if let m = metric(
            name: "Energy",
            now: energyNow, prev: energyPrev,
            format: { decFmt($0, unit: "/10") },
            higherIsBetter: true,
            tint: LifeOSColor.Metric.energy
        ) { metrics.append(m) }

        // ----- Habit completion rate -----
        let habitNow = habitCompletionRate(habits, keys: thisKeys, cal: cal)
        let habitPrev = habitCompletionRate(habits, keys: lastKeys, cal: cal)
        if let now = habitNow {
            metrics.append(WeeklyReview.Metric(
                name: "Habits",
                thisWeek: pctFmt(now),
                lastWeek: habitPrev.map(pctFmt) ?? "—",
                delta: (now - (habitPrev ?? now)) * 100,
                higherIsBetter: true,
                tint: LifeOSColor.accent
            ))
        }

        // ----- Wins, watch-outs, headline -----
        let wins = buildWins(
            metrics: metrics,
            calNow: calNow, calGoal: Double(settings.caloriesGoal),
            protNow: protNow, protGoal: Double(settings.proteinGoal),
            sleepNow: sleepNow, sleepGoal: settings.sleepGoalHours,
            workouts: thisLifts.count
        )
        let watchOuts = buildWatchOuts(
            metrics: metrics,
            sleepNow: sleepNow, sleepGoal: settings.sleepGoalHours,
            protNow: protNow, protGoal: Double(settings.proteinGoal),
            workouts: thisLifts.count
        )
        let headline = buildHeadline(
            metrics: metrics,
            workouts: thisLifts.count,
            sleepNow: sleepNow, sleepPrev: sleepPrev,
            wins: wins, watchOuts: watchOuts
        )

        return WeeklyReview(
            weekLabel: weekLabel(start: thisStart, end: today, cal: cal),
            headline: headline,
            metrics: metrics,
            wins: wins,
            watchOuts: watchOuts
        )
    }

    // MARK: - Metric assembly

    /// Build a nil-gated metric: only emit a row when at least one of the
    /// two windows produced a real average. Keeps "—" rows from cluttering
    /// the review when a sensor simply wasn't worn.
    private static func metric(
        name: String,
        now: Double?,
        prev: Double?,
        format: (Double) -> String,
        higherIsBetter: Bool,
        tint: Color
    ) -> WeeklyReview.Metric? {
        guard now != nil || prev != nil else { return nil }
        return WeeklyReview.Metric(
            name: name,
            thisWeek: now.map(format) ?? "—",
            lastWeek: prev.map(format) ?? "—",
            delta: (now ?? prev ?? 0) - (prev ?? now ?? 0),
            higherIsBetter: higherIsBetter,
            tint: tint
        )
    }

    // MARK: - Wins / watch-outs / headline

    private static func buildWins(
        metrics: [WeeklyReview.Metric],
        calNow: Double?, calGoal: Double,
        protNow: Double?, protGoal: Double,
        sleepNow: Double?, sleepGoal: Double,
        workouts: Int
    ) -> [String] {
        var wins: [(String, Double)] = []

        // Rank improving metrics by relative gain. Nutrition rows are
        // judged against goal below, not by raw direction, so skip them.
        for m in metrics where m.name != "Calories" && m.name != "Protein" {
            guard m.delta != 0, lastValue(m) != 0 else { continue }
            let improving = m.higherIsBetter ? m.delta > 0 : m.delta < 0
            guard improving else { continue }
            let rel = abs(m.delta) / max(abs(lastValue(m)), 0.001)
            guard rel >= 0.04 else { continue }
            wins.append((winPhrase(for: m), rel))
        }

        // Goal-hit wins read better than raw deltas — surface them strongly.
        if let p = protNow, protGoal > 0, p >= protGoal * 0.95 {
            wins.append(("Protein on point at \(intFmt(p, unit: "g"))/day, right at your target.", 1.0))
        }
        if let s = sleepNow, s >= sleepGoal {
            wins.append(("Sleep held at goal — \(hoursFmt(s)) a night on average.", 0.9))
        }
        if workouts >= 4 {
            wins.append(("\(workouts) training sessions logged — a high-volume week.", 0.95))
        }

        // Strongest first, de-duped, capped at 3.
        let ordered = wins.sorted { $0.1 > $1.1 }.map(\.0)
        return dedupe(ordered, limit: 3)
    }

    private static func buildWatchOuts(
        metrics: [WeeklyReview.Metric],
        sleepNow: Double?, sleepGoal: Double,
        protNow: Double?, protGoal: Double,
        workouts: Int
    ) -> [String] {
        var watch: [(String, Double)] = []

        for m in metrics where m.name != "Calories" && m.name != "Protein" {
            guard m.delta != 0, lastValue(m) != 0 else { continue }
            let regressing = m.higherIsBetter ? m.delta < 0 : m.delta > 0
            guard regressing else { continue }
            let rel = abs(m.delta) / max(abs(lastValue(m)), 0.001)
            guard rel >= 0.06 else { continue }
            watch.append((watchPhrase(for: m), rel))
        }

        if let s = sleepNow, s < sleepGoal - 0.5 {
            let gap = Int(((sleepGoal - s) * 60).rounded())
            watch.append(("Sleep is running \(gap) min/night under your \(hoursFmt(sleepGoal)) goal.", 0.85))
        }
        if let p = protNow, protGoal > 0, p < protGoal * 0.85 {
            watch.append(("Protein averaged \(intFmt(p, unit: "g")), short of your \(Int(protGoal))g target.", 0.8))
        }
        if workouts == 0 {
            watch.append(("No workouts logged this week — an easy lever to pull next week.", 0.9))
        }

        let ordered = watch.sorted { $0.1 > $1.1 }.map(\.0)
        return dedupe(ordered, limit: 3)
    }

    private static func buildHeadline(
        metrics: [WeeklyReview.Metric],
        workouts: Int,
        sleepNow: Double?, sleepPrev: Double?,
        wins: [String],
        watchOuts: [String]
    ) -> String {
        // Lead clause: training tone if it was an active week.
        let lead: String
        if workouts >= 4 {
            lead = "A strong training week"
        } else if workouts >= 1 {
            lead = "A steady week"
        } else {
            lead = "A quiet week"
        }

        // Counter clause: the single biggest sleep swing reads most
        // human, so prefer it; otherwise lean on the top watch-out / win.
        if let now = sleepNow, let prev = sleepPrev {
            let minDelta = (now - prev) * 60
            if minDelta <= -20 {
                return "\(lead), but sleep slipped \(Int(-minDelta.rounded())) min/night."
            }
            if minDelta >= 20 {
                return "\(lead), and sleep climbed \(Int(minDelta.rounded())) min/night."
            }
        }
        if let first = watchOuts.first {
            return "\(lead) — watch one thing: \(lowerFirst(first))"
        }
        if let first = wins.first {
            return "\(lead). \(first)"
        }
        return "\(lead) — your numbers held steady across the board."
    }

    // MARK: - Phrasing

    private static func winPhrase(for m: WeeklyReview.Metric) -> String {
        let pct = relPct(m)
        switch m.name {
        case "Sleep":      return "Sleep up to \(m.thisWeek) a night, \(pct) better than last week."
        case "HRV":        return "HRV trending up to \(m.thisWeek) — recovery is improving."
        case "Resting HR": return "Resting HR dropped to \(m.thisWeek) — a good recovery sign."
        case "Steps":      return "Steps up \(pct) to \(m.thisWeek)/day."
        case "Active Burn":return "Active burn up \(pct) to \(m.thisWeek)/day."
        case "Workouts":   return "More training — \(m.thisWeek) sessions this week."
        case "Lift Volume":return "Lift volume up \(pct) to \(m.thisWeek)."
        case "Mood":       return "Mood lifted to \(m.thisWeek)."
        case "Energy":     return "Energy up to \(m.thisWeek)."
        case "Habits":     return "Habit consistency up to \(m.thisWeek)."
        default:           return "\(m.name) improved to \(m.thisWeek)."
        }
    }

    private static func watchPhrase(for m: WeeklyReview.Metric) -> String {
        let pct = relPct(m)
        switch m.name {
        case "Sleep":      return "Sleep down to \(m.thisWeek) a night, \(pct) off last week."
        case "HRV":        return "HRV dipped to \(m.thisWeek) — keep an eye on recovery."
        case "Resting HR": return "Resting HR crept up to \(m.thisWeek)."
        case "Steps":      return "Steps fell \(pct) to \(m.thisWeek)/day."
        case "Active Burn":return "Active burn fell \(pct) to \(m.thisWeek)/day."
        case "Mood":       return "Mood slipped to \(m.thisWeek)."
        case "Energy":     return "Energy slipped to \(m.thisWeek)."
        case "Habits":     return "Habit consistency dropped to \(m.thisWeek)."
        case "Lift Volume":return "Lift volume down \(pct) to \(m.thisWeek)."
        default:           return "\(m.name) regressed to \(m.thisWeek)."
        }
    }

    // MARK: - Aggregation helpers

    /// Mean of a non-empty sample; nil when there's nothing to average so
    /// callers can render "—" instead of a fake zero.
    private static func avg(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / Double(values.count)
    }

    /// Average per-logged-day total of a meal field. Days with no meals
    /// are excluded (a no-log day isn't a zero-calorie day), so this is a
    /// per-active-day average. nil when no day in the window had meals.
    private static func avgDailyTotal(
        _ meals: [MealLog],
        keys: [String],
        value: (MealLog) -> Double
    ) -> Double? {
        let byDay = Dictionary(grouping: meals, by: \.date)
        let totals = keys.compactMap { key -> Double? in
            guard let rows = byDay[key], !rows.isEmpty else { return nil }
            return rows.map(value).reduce(0, +)
        }
        return avg(totals)
    }

    /// Fraction (0...1) of due habit-days that were completed across the
    /// window. nil when no habit was due on any day in the window.
    private static func habitCompletionRate(
        _ habits: [HabitEntry],
        keys: [String],
        cal: Calendar
    ) -> Double? {
        var due = 0
        var done = 0
        for key in keys {
            guard let date = HabitDateFmt.date(key) else { continue }
            let weekday = cal.component(.weekday, from: date)
            for habit in habits where !habit.archived {
                guard habit.cadence.isDueOn(weekday: weekday) else { continue }
                due += 1
                if habit.isCompleted(on: key) { done += 1 }
            }
        }
        guard due > 0 else { return nil }
        return Double(done) / Double(due)
    }

    private static func hasAnySignal(_ d: DailyEntry) -> Bool {
        d.sleepHours != nil || d.moodScore != nil || d.energyScore != nil
            || d.steps != nil || d.hrvMs != nil || d.restingHr != nil
            || d.activeEnergyKcal != nil || d.totalCaloriesKcal != nil
    }

    private static func dayKeys(from start: Date, to end: Date, cal: Calendar) -> [String] {
        var keys: [String] = []
        var cursor = cal.startOfDay(for: start)
        let last = cal.startOfDay(for: end)
        while cursor <= last {
            keys.append(HabitDateFmt.ymd(cursor))
            guard let next = cal.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return keys
    }

    // MARK: - Formatting

    /// "lastWeek" parsed back is fragile, so derive the prior raw value
    /// from the metric's own delta + thisWeek isn't available as a number;
    /// instead we recover it for ranking via the stored delta. We keep a
    /// numeric mirror by re-deriving from delta: lastValue = thisValue −
    /// delta. Since `thisWeek` is a formatted string, ranking uses the
    /// delta magnitude relative to the prior value, which we reconstruct
    /// from the delta itself when the prior is the only known anchor.
    private static func lastValue(_ m: WeeklyReview.Metric) -> Double {
        // thisRaw − delta = lastRaw. thisRaw is parsed from the formatted
        // string's leading number; good enough for relative ranking.
        leadingNumber(m.thisWeek) - m.delta
    }

    private static func relPct(_ m: WeeklyReview.Metric) -> String {
        let prev = abs(lastValue(m))
        guard prev > 0.001 else { return "" }
        let pct = Int((abs(m.delta) / prev * 100).rounded())
        return "\(pct)%"
    }

    /// Pull the leading numeric value out of a formatted metric string
    /// ("7.4h" -> 7.4, "8,200 steps" -> 8200). Used only for relative
    /// ranking, never for display.
    private static func leadingNumber(_ s: String) -> Double {
        var digits = ""
        for ch in s {
            if ch.isNumber || ch == "." { digits.append(ch) }
            else if ch == "," { continue }
            else if !digits.isEmpty { break }
        }
        return Double(digits) ?? 0
    }

    private static func hoursFmt(_ v: Double) -> String {
        String(format: "%.1fh", v)
    }
    private static func intFmt(_ v: Double, unit: String) -> String {
        let n = Int(v.rounded())
        let grouped = numberFormatter.string(from: NSNumber(value: n)) ?? "\(n)"
        return unit.isEmpty ? grouped : "\(grouped) \(unit)"
    }
    private static func decFmt(_ v: Double, unit: String) -> String {
        unit.isEmpty ? String(format: "%.1f", v) : "\(String(format: "%.1f", v))\(unit)"
    }
    private static func stepsFmt(_ v: Double) -> String {
        let n = Int(v.rounded())
        return numberFormatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
    private static func volumeFmt(_ v: Double) -> String {
        if v >= 1000 { return String(format: "%.1fk lb", v / 1000) }
        return "\(Int(v.rounded())) lb"
    }
    private static func pctFmt(_ frac: Double) -> String {
        "\(Int((frac * 100).rounded()))%"
    }

    private static let numberFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()

    private static func weekLabel(start: Date, end: Date, cal: Calendar) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM d"
        return "\(f.string(from: start)) – \(f.string(from: end))"
    }

    private static func dedupe(_ items: [String], limit: Int) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for item in items where !seen.contains(item) {
            seen.insert(item)
            out.append(item)
            if out.count == limit { break }
        }
        return out
    }

    private static func lowerFirst(_ s: String) -> String {
        guard let first = s.first else { return s }
        return first.lowercased() + s.dropFirst()
    }
}
