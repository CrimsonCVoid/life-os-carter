import SwiftUI
import Foundation

// MARK: - Public output types

/// One scannable behavioral finding — a habit-mood link, an at-risk
/// streak, a behavioral-flag correlation, or an overall consistency
/// read. Deterministic and computed on-device, so these render
/// instantly with no network round-trip (unlike the AI CorrelationsCard
/// on the Analysis tab, which crunches the same raw data server-side for
/// richer prose).
struct BehaviorInsight: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let detail: String
    let tint: Color
    let sentiment: Sentiment
    enum Sentiment { case positive, neutral, watch }
}

/// Per-habit consistency snapshot for the breakdown rows. `id` is the
/// habit's own id so SwiftUI diffing stays stable across recomputes.
struct HabitConsistency: Identifiable {
    let id: UUID
    let name: String
    let icon: String
    let tint: Color
    let completionRate: Double  // 0...1 over window
    let currentStreak: Int
    let trend: Double           // signed, recent half vs earlier half
}

// MARK: - Engine

/// Deterministic on-device analyzer over habits + daily mood/energy +
/// behavioral flags. No async, no I/O — pure functions of the SwiftData
/// snapshots the views @Query in. Thresholds are tuned to avoid
/// surfacing noise from thin data (we require a minimum sample on both
/// sides of every comparison before claiming a difference).
enum BehaviorInsightsEngine {

    /// Minimum days a habit must have been done vs not within the window
    /// before we'll claim a mood/energy attribution. Below this the split
    /// is too noisy to mean anything.
    private static let minSplitSample = 3
    /// Minimum days on each side of a behavioral-flag comparison.
    private static let minFlagSample = 4
    /// Mean difference (on the 1–10 scales) below which we treat two
    /// groups as effectively equal and skip the insight.
    private static let meaningfulDelta = 0.6

    // MARK: Insights

    static func insights(habits: [HabitEntry], daily: [DailyEntry], days: Int) -> [BehaviorInsight] {
        let cal = Calendar.current
        let window = windowKeys(days: days, cal: cal)
        let windowSet = Set(window)

        // Index daily rows by date for O(1) mood/energy lookups, keeping
        // only rows that fall inside the window.
        let dailyInWindow = daily.filter { windowSet.contains($0.date) }
        let moodByDate = dailyInWindow.reduce(into: [String: Int]()) { acc, d in
            if let m = d.moodScore { acc[d.date] = m }
        }
        let energyByDate = dailyInWindow.reduce(into: [String: Int]()) { acc, d in
            if let e = d.energyScore { acc[d.date] = e }
        }

        let active = habits.filter { !$0.archived }

        var out: [BehaviorInsight] = []

        out.append(contentsOf: habitAttributionInsights(
            habits: active, window: window,
            moodByDate: moodByDate, energyByDate: energyByDate
        ))
        out.append(contentsOf: atRiskInsights(habits: active, days: days, cal: cal))
        out.append(contentsOf: flagInsights(daily: dailyInWindow))

        if let overall = consistencyScoreInsight(habits: active, days: days) {
            out.append(overall)
        }

        return out
    }

    // MARK: Consistency breakdown

    static func consistency(habits: [HabitEntry], days: Int) -> [HabitConsistency] {
        let active = habits.filter { !$0.archived }
        let rows = active.map { h -> HabitConsistency in
            HabitConsistency(
                id: h.id,
                name: h.name,
                icon: h.icon,
                tint: h.color,
                completionRate: h.completionRate(days: days),
                currentStreak: h.currentStreak(),
                trend: trend(for: h, days: days)
            )
        }
        // Most consistent first; ties broken by a live streak so an
        // on-fire habit floats above an equally-rated dormant one.
        return rows.sorted {
            $0.completionRate != $1.completionRate
                ? $0.completionRate > $1.completionRate
                : $0.currentStreak > $1.currentStreak
        }
    }

    // MARK: - Habit → mood/energy attribution

    private static func habitAttributionInsights(
        habits: [HabitEntry],
        window: [String],
        moodByDate: [String: Int],
        energyByDate: [String: Int]
    ) -> [BehaviorInsight] {
        struct Attribution {
            let habit: HabitEntry
            let metric: String     // "energy" | "mood"
            let tint: Color
            let onAvg: Double
            let offAvg: Double
            let delta: Double      // onAvg - offAvg
        }

        var candidates: [Attribution] = []

        for habit in habits {
            let done = Set(habit.completedDates)

            for (label, table, tint) in [
                ("energy", energyByDate, LifeOSColor.Metric.energy),
                ("mood", moodByDate, LifeOSColor.Metric.mood),
            ] {
                var on: [Int] = []
                var off: [Int] = []
                for key in window {
                    guard let v = table[key] else { continue }
                    if done.contains(key) { on.append(v) } else { off.append(v) }
                }
                guard on.count >= minSplitSample, off.count >= minSplitSample else { continue }
                let onAvg = mean(on)
                let offAvg = mean(off)
                let delta = onAvg - offAvg
                guard abs(delta) >= meaningfulDelta else { continue }
                candidates.append(Attribution(
                    habit: habit, metric: label, tint: tint,
                    onAvg: onAvg, offAvg: offAvg, delta: delta
                ))
            }
        }

        // Surface the strongest links first, cap to keep the card
        // scannable. Positive (habit-day better) links lead.
        let ranked = candidates.sorted { abs($0.delta) > abs($1.delta) }.prefix(4)

        return ranked.map { a in
            let better = a.delta > 0
            let detail = "On \(a.habit.name.lowercased()) days your \(a.metric) "
                + "averages \(fmt(a.onAvg)) vs \(fmt(a.offAvg)) otherwise."
            return BehaviorInsight(
                icon: a.habit.icon,
                title: better
                    ? "\(a.habit.name) lifts your \(a.metric)"
                    : "\(a.habit.name) days run lower on \(a.metric)",
                detail: detail,
                tint: a.tint,
                sentiment: better ? .positive : .watch
            )
        }
    }

    // MARK: - At-risk habits

    private static func atRiskInsights(habits: [HabitEntry], days: Int, cal: Calendar) -> [BehaviorInsight] {
        var out: [BehaviorInsight] = []
        let todayKey = HabitDateFmt.ymd(cal.startOfDay(for: Date()))

        for habit in habits {
            let streak = habit.currentStreak()
            let rate = habit.completionRate(days: days)
            let doneToday = habit.isCompleted(on: todayKey)
            let dueToday = habit.cadence.isDueOn(weekday: cal.component(.weekday, from: Date()))

            // A strong streak that's due today and not yet done is the
            // single most actionable nudge — protect it.
            if streak >= 4 && dueToday && !doneToday {
                out.append(BehaviorInsight(
                    icon: "flame.fill",
                    title: "\(habit.name) streak at risk",
                    detail: "\(streak)-day streak on the line — it's due today and not done yet.",
                    tint: LifeOSColor.warning,
                    sentiment: .watch
                ))
                continue
            }

            // Slipping consistency: was once reliable, now under half.
            let drift = trend(for: habit, days: days)
            if rate < 0.5 && drift < -0.15 {
                out.append(BehaviorInsight(
                    icon: habit.icon,
                    title: "\(habit.name) is slipping",
                    detail: "Down to \(pct(rate)) completion over \(days) days, and trending lower.",
                    tint: LifeOSColor.danger,
                    sentiment: .watch
                ))
            }
        }
        return Array(out.prefix(3))
    }

    // MARK: - Behavioral flag correlations

    private static func flagInsights(daily: [DailyEntry]) -> [BehaviorInsight] {
        struct Flag {
            let label: String      // human phrase, "drinking alcohol"
            let on: (DailyEntry) -> Bool
            let icon: String
        }
        let flags: [Flag] = [
            Flag(label: "alcohol the night before", on: { $0.alcoholYesterday }, icon: "wineglass"),
            Flag(label: "caffeine after 2pm", on: { $0.caffeineAfter2pm }, icon: "cup.and.saucer.fill"),
            Flag(label: "eating late", on: { $0.lateEating }, icon: "fork.knife"),
            Flag(label: "screens before bed", on: { $0.screenBeforeBed }, icon: "iphone"),
        ]

        struct Metric {
            let label: String
            let tint: Color
            let value: (DailyEntry) -> Double?
        }
        let metrics: [Metric] = [
            Metric(label: "sleep", tint: LifeOSColor.Metric.sleep, value: { $0.sleepHours }),
            Metric(label: "energy", tint: LifeOSColor.Metric.energy, value: { $0.energyScore.map(Double.init) }),
            Metric(label: "mood", tint: LifeOSColor.Metric.mood, value: { $0.moodScore.map(Double.init) }),
        ]

        struct Finding {
            let flag: Flag
            let metric: Metric
            let onAvg: Double
            let offAvg: Double
            let delta: Double
            let relMagnitude: Double  // |delta| / offAvg, for ranking across scales
        }

        var findings: [Finding] = []

        for flag in flags {
            for metric in metrics {
                var on: [Double] = []
                var off: [Double] = []
                for d in daily {
                    guard let v = metric.value(d) else { continue }
                    if flag.on(d) { on.append(v) } else { off.append(v) }
                }
                guard on.count >= minFlagSample, off.count >= minFlagSample else { continue }
                let onAvg = mean(on)
                let offAvg = mean(off)
                let delta = onAvg - offAvg
                // Sleep is on an hours scale; mood/energy on 1–10. Use a
                // relative threshold so each scale's noise floor is fair.
                let floor = metric.label == "sleep" ? 0.4 : meaningfulDelta
                guard abs(delta) >= floor, offAvg > 0 else { continue }
                findings.append(Finding(
                    flag: flag, metric: metric,
                    onAvg: onAvg, offAvg: offAvg, delta: delta,
                    relMagnitude: abs(delta) / offAvg
                ))
            }
        }

        let ranked = findings.sorted { $0.relMagnitude > $1.relMagnitude }.prefix(3)

        return ranked.map { f in
            // Worse-on-flag is the common, actionable case (e.g. less
            // sleep on alcohol nights). Frame the direction plainly.
            let worse = f.delta < 0
            let pctChange = Int((f.relMagnitude * 100).rounded())
            let unit = f.metric.label == "sleep" ? "h" : ""
            let detail = "\(capitalizeFirst(f.metric.label)) averages "
                + "\(fmt(f.onAvg))\(unit) on \(f.flag.label) days vs \(fmt(f.offAvg))\(unit) otherwise "
                + "(\(worse ? "−" : "+")\(pctChange)%)."
            return BehaviorInsight(
                icon: f.flag.icon,
                title: worse
                    ? "\(capitalizeFirst(f.flag.label)) costs you \(f.metric.label)"
                    : "\(capitalizeFirst(f.flag.label)) pairs with better \(f.metric.label)",
                detail: detail,
                tint: f.metric.tint,
                sentiment: worse ? .watch : .neutral
            )
        }
    }

    // MARK: - Overall consistency score

    private static func consistencyScoreInsight(habits: [HabitEntry], days: Int) -> BehaviorInsight? {
        guard !habits.isEmpty else { return nil }
        let avg = habits.map { $0.completionRate(days: days) }.reduce(0, +) / Double(habits.count)
        let (title, tint, sentiment): (String, Color, BehaviorInsight.Sentiment) = {
            switch avg {
            case 0.8...:    return ("Dialed in", LifeOSColor.success, .positive)
            case 0.55..<0.8: return ("Holding steady", LifeOSColor.Metric.energy, .neutral)
            default:        return ("Room to tighten up", LifeOSColor.warning, .watch)
            }
        }()
        return BehaviorInsight(
            icon: "chart.bar.fill",
            title: "Consistency: \(title)",
            detail: "Across \(habits.count) active \(habits.count == 1 ? "habit" : "habits") you're hitting "
                + "\(pct(avg)) of due days over the last \(days) days.",
            tint: tint,
            sentiment: sentiment
        )
    }

    // MARK: - Trend

    /// Recent-half completion rate minus earlier-half, over the window.
    /// Positive = improving, negative = slipping. Uses the habit's own
    /// cadence-aware completionRate so non-due days never count against
    /// it.
    private static func trend(for habit: HabitEntry, days: Int, cal: Calendar = .current) -> Double {
        let half = max(1, days / 2)
        let today = cal.startOfDay(for: Date())
        // Earlier window anchors `half` days back so the two halves don't
        // overlap.
        guard let earlierAnchor = cal.date(byAdding: .day, value: -half, to: today) else { return 0 }
        let recent = habit.completionRate(days: half, today: today, cal: cal)
        let earlier = habit.completionRate(days: half, today: earlierAnchor, cal: cal)
        return recent - earlier
    }

    // MARK: - Helpers

    private static func windowKeys(days: Int, cal: Calendar) -> [String] {
        let today = cal.startOfDay(for: Date())
        return (0..<max(1, days)).compactMap { offset in
            cal.date(byAdding: .day, value: -offset, to: today).map(HabitDateFmt.ymd)
        }
    }

    private static func mean(_ xs: [Int]) -> Double {
        xs.isEmpty ? 0 : Double(xs.reduce(0, +)) / Double(xs.count)
    }
    private static func mean(_ xs: [Double]) -> Double {
        xs.isEmpty ? 0 : xs.reduce(0, +) / Double(xs.count)
    }

    private static func fmt(_ x: Double) -> String {
        String(format: "%.1f", x)
    }
    private static func pct(_ x: Double) -> String {
        "\(Int((x * 100).rounded()))%"
    }
    private static func capitalizeFirst(_ s: String) -> String {
        guard let first = s.first else { return s }
        return first.uppercased() + s.dropFirst()
    }
}
