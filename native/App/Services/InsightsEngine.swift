import Foundation
import SwiftUI

/// A single ranked, personalized insight surfaced on the Insights feed.
/// Produced entirely on-device by `InsightsEngine` — no AI, no network.
/// `score` is the ranking weight (impact × confidence, descending) the
/// feed sorts by; the rest are presentation fields the card reads.
struct DataInsight: Identifiable {
    let id = UUID()
    let kind: Kind
    let title: String         // short, scannable
    let detail: String        // the specifics + the "so what"
    let icon: String          // SF Symbol
    let tint: Color           // LifeOSColor token
    let sentiment: Sentiment  // positive, neutral, watch
    let score: Double         // ranking weight (impact × confidence), desc

    enum Kind { case correlation, trend, anomaly, streak, tip }
    enum Sentiment { case positive, neutral, watch }
}

/// Deterministic on-device insight miner. Walks the user's history and
/// emits only statistically meaningful, actionable findings: behavioral
/// correlations, lagged relationships, trends, anomalies, and streaks.
///
/// Design constraints (intentional):
/// - Pure function of its inputs — no @Query, no network, no Date.now
///   side effects beyond resolving "today" for anomaly comparisons.
/// - Conservative: every class requires a minimum sample (≥6 paired
///   days for correlations/lagged) and a meaningful effect size before
///   it surfaces, so we never cry wolf on three noisy nights.
/// - Ranked by impact × confidence so the feed leads with what matters.
enum InsightsEngine {

    // MARK: - Public API

    static func generate(
        daily: [DailyEntry],
        meals: [MealLog],
        lifts: [LiftSessionEntry],
        habits: [HabitEntry],
        settings: UserSettings
    ) -> [DataInsight] {
        // Chronological, de-noised view of the history. Empty/short
        // guards live inside each miner so an empty store yields [].
        let days = daily.sorted { $0.date < $1.date }
        guard !days.isEmpty else { return [] }

        let mealsByDate = Dictionary(grouping: meals, by: \.date)
        let liftsByDate = Dictionary(grouping: lifts, by: \.date)

        var out: [DataInsight] = []
        out += behaviorCorrelations(days)
        out += laggedRelationships(days, liftsByDate: liftsByDate, mealsByDate: mealsByDate, settings: settings)
        out += trends(days)
        out += anomalies(days, settings: settings)
        out += streaks(days, settings: settings)

        // Highest impact × confidence first; cap so the feed stays a
        // curated lead, not a data dump.
        return out.sorted { $0.score > $1.score }
    }

    // MARK: - 1. Behavior correlations
    //
    // For each behavioral flag, split days into flag-true / flag-false
    // and compare the mean of each outcome. Report when both groups are
    // adequately sampled and the gap clears a per-outcome threshold.

    private struct Flag {
        let key: String
        let label: String          // "alcohol", used in copy
        let value: (DailyEntry) -> Bool
        /// Most flags read as a same-night/next-morning behavior; the
        /// flag is already stored on the day it applies to (e.g.
        /// alcoholYesterday is true on the morning-after row), so the
        /// outcome and flag share a row.
    }

    private struct Outcome {
        let key: String
        let label: String          // "HRV"
        let unit: OutcomeUnit
        let higherIsBetter: Bool
        let value: (DailyEntry) -> Double?
        /// Minimum mean-difference (as a fraction of the false-group
        /// mean) to consider meaningful. Below this it's noise.
        let minRelEffect: Double
    }

    private enum OutcomeUnit { case percent, raw, hours }

    private static let flags: [Flag] = [
        Flag(key: "alcohol",  label: "alcohol",            value: { $0.alcoholYesterday }),
        Flag(key: "caffeine", label: "late caffeine",      value: { $0.caffeineAfter2pm }),
        Flag(key: "lateEat",  label: "late eating",        value: { $0.lateEating }),
        Flag(key: "screen",   label: "screens before bed", value: { $0.screenBeforeBed }),
        // High stress (4–5 on the 1–5 scale) treated as the "flag".
        Flag(key: "stress",   label: "high stress",        value: { ($0.stressLevel ?? 0) >= 4 }),
    ]

    private static let outcomes: [Outcome] = [
        Outcome(key: "hrv",    label: "HRV",        unit: .percent, higherIsBetter: true,
                value: { $0.hrvMs }, minRelEffect: 0.05),
        Outcome(key: "rhr",    label: "resting HR", unit: .raw,     higherIsBetter: false,
                value: { $0.restingHr }, minRelEffect: 0.02),
        Outcome(key: "sleep",  label: "sleep",      unit: .hours,   higherIsBetter: true,
                value: { $0.sleepHours }, minRelEffect: 0.05),
        Outcome(key: "deep",   label: "deep + REM", unit: .percent, higherIsBetter: true,
                value: { restorativeFraction($0) }, minRelEffect: 0.06),
        Outcome(key: "mood",   label: "mood",       unit: .raw,     higherIsBetter: true,
                value: { $0.moodScore.map(Double.init) }, minRelEffect: 0.06),
        Outcome(key: "energy", label: "energy",     unit: .raw,     higherIsBetter: true,
                value: { $0.energyScore.map(Double.init) }, minRelEffect: 0.06),
    ]

    private static func behaviorCorrelations(_ days: [DailyEntry]) -> [DataInsight] {
        var out: [DataInsight] = []
        for flag in flags {
            for outcome in outcomes {
                guard let insight = correlation(days, flag: flag, outcome: outcome) else { continue }
                out.append(insight)
            }
        }
        // Keep the strongest 2 per flag so one behavior doesn't flood
        // the feed with six near-identical rows.
        return topPerFlag(out, limit: 2)
    }

    private static func correlation(_ days: [DailyEntry], flag: Flag, outcome: Outcome) -> DataInsight? {
        var truthy: [Double] = []
        var falsy: [Double] = []
        for d in days {
            guard let v = outcome.value(d) else { continue }
            if flag.value(d) { truthy.append(v) } else { falsy.append(v) }
        }
        // Need an adequate paired sample on both sides — six "flag" days
        // is the floor below which a single bad night dominates.
        guard truthy.count >= 6, falsy.count >= 6 else { return nil }

        let mTrue = mean(truthy)
        let mFalse = mean(falsy)
        guard mFalse != 0 else { return nil }

        let absDiff = mTrue - mFalse
        let relDiff = absDiff / mFalse
        guard abs(relDiff) >= outcome.minRelEffect else { return nil }

        // Effect size (Cohen's d, pooled SD) scaled into a 0…1
        // confidence-ish weight; clamp so a tiny SD doesn't explode it.
        let d = cohensD(truthy, falsy)
        let effect = min(abs(d) / 1.2, 1)
        let sampleConf = min(Double(min(truthy.count, falsy.count)) / 14.0, 1)
        let score = (0.5 + 0.5 * effect) * sampleConf * 100

        // "lower" outcome on a flag day is bad iff higherIsBetter, etc.
        let lower = absDiff < 0
        let bad = (outcome.higherIsBetter && lower) || (!outcome.higherIsBetter && !lower)
        let sentiment: DataInsight.Sentiment = bad ? .watch : .positive

        let magnitude = formatEffect(absDiff, base: mFalse, unit: outcome.unit)
        let dirWord = lower ? "lower" : "higher"
        let title = "\(outcome.label.capitalizedFirst) runs \(magnitude) \(dirWord) after \(flag.label)"
        let detail = "Comparing \(truthy.count) \(flag.label) days against \(falsy.count) without, "
            + "your \(outcome.label) averages \(fmt(mTrue, outcome.unit)) vs \(fmt(mFalse, outcome.unit)). "
            + soWhat(flag: flag, bad: bad, outcome: outcome)

        return DataInsight(
            kind: .correlation,
            title: title,
            detail: detail,
            icon: flagIcon(flag.key),
            tint: outcomeTint(outcome.key),
            sentiment: sentiment,
            score: score
        )
    }

    // MARK: - 2. Lagged relationships
    //
    // Pair a day's input with the NEXT day's outcome (one-day lag). We
    // bucket the input around its median (high/low) and compare the
    // next-day outcome means between buckets — same machinery as the
    // flag correlations but across a temporal offset.

    private static func laggedRelationships(
        _ days: [DailyEntry],
        liftsByDate: [String: [LiftSessionEntry]],
        mealsByDate: [String: [MealLog]],
        settings: UserSettings
    ) -> [DataInsight] {
        var out: [DataInsight] = []

        // sleep hours (day N) → energy & mood (day N+1)
        out += lagged(
            days, inputLabel: "sleep", inputUnit: .hours,
            input: { $0.sleepHours },
            outLabel: "next-day energy", outValue: { $0.energyScore.map(Double.init) },
            icon: "bolt.fill", tint: LifeOSColor.Metric.energy, higherIsBetter: true,
            phrase: { hi, lo in "Energy climbs \(fmtDelta(hi - lo)) the day after your longer nights." }
        )
        out += lagged(
            days, inputLabel: "sleep", inputUnit: .hours,
            input: { $0.sleepHours },
            outLabel: "next-day mood", outValue: { $0.moodScore.map(Double.init) },
            icon: "face.smiling", tint: LifeOSColor.Metric.mood, higherIsBetter: true,
            phrase: { hi, lo in "Mood lifts \(fmtDelta(hi - lo)) the day after more sleep." }
        )
        // sleep quality (deep+REM share, day N) → next-day energy
        out += lagged(
            days, inputLabel: "deep sleep", inputUnit: .percent,
            input: { restorativeFraction($0) },
            outLabel: "next-day energy", outValue: { $0.energyScore.map(Double.init) },
            icon: "moon.stars.fill", tint: LifeOSColor.Metric.sleep, higherIsBetter: true,
            phrase: { hi, lo in "More restorative (deep + REM) nights are followed by \(fmtDelta(hi - lo)) higher energy." }
        )
        // training volume (day N) → next-day HRV
        out += laggedExternal(
            days,
            input: { d in liftsByDate[d.date].map { rows in rows.reduce(0.0) { $0 + $1.totalVolumeLb } } },
            inputZeroIsAbsent: true,
            outValue: { $0.hrvMs },
            icon: "dumbbell.fill", tint: LifeOSColor.Metric.hrv, higherIsBetter: true,
            phrase: { hi, lo in
                let drop = lo - hi
                return drop > 0
                    ? "HRV runs \(fmtDelta(drop)) lower the morning after your heaviest training days — plan recovery accordingly."
                    : "HRV holds up the morning after heavy training — your recovery is keeping pace with the load."
            },
            watchWhenInverse: true
        )
        // hydration vs goal (day N) → next-day HRV
        let waterGoal = settings.waterGoalOz
        out += lagged(
            days, inputLabel: "hydration", inputUnit: .raw,
            input: { waterGoal > 0 ? $0.waterOz / waterGoal : nil },
            outLabel: "next-day HRV", outValue: { $0.hrvMs },
            icon: "drop.fill", tint: LifeOSColor.Metric.water, higherIsBetter: true,
            phrase: { hi, lo in "HRV is \(fmtDelta(hi - lo)) higher the morning after well-hydrated days." }
        )

        return out
    }

    /// Generic one-day-lag comparison off a DailyEntry input field.
    private static func lagged(
        _ days: [DailyEntry],
        inputLabel: String,
        inputUnit: OutcomeUnit,
        input: (DailyEntry) -> Double?,
        outLabel: String,
        outValue: (DailyEntry) -> Double?,
        icon: String,
        tint: Color,
        higherIsBetter: Bool,
        phrase: (Double, Double) -> String
    ) -> [DataInsight] {
        var pairs: [(inp: Double, out: Double)] = []
        for i in 0..<(days.count - 1) where days.count >= 2 {
            guard isConsecutive(days[i], days[i + 1]) else { continue }
            guard let inp = input(days[i]), let o = outValue(days[i + 1]) else { continue }
            pairs.append((inp, o))
        }
        guard let insight = bucketedComparison(
            pairs, icon: icon, tint: tint, kind: .correlation,
            higherIsBetter: higherIsBetter, phrase: phrase
        ) else { return [] }
        return [insight]
    }

    /// One-day-lag where the input comes from an external source (lifts /
    /// meals) rather than a DailyEntry field. `inputZeroIsAbsent` drops
    /// rows with no session so rest days don't dilute the "heavy" bucket.
    private static func laggedExternal(
        _ days: [DailyEntry],
        input: (DailyEntry) -> Double?,
        inputZeroIsAbsent: Bool,
        outValue: (DailyEntry) -> Double?,
        icon: String,
        tint: Color,
        higherIsBetter: Bool,
        phrase: (Double, Double) -> String,
        watchWhenInverse: Bool
    ) -> [DataInsight] {
        var pairs: [(inp: Double, out: Double)] = []
        for i in 0..<max(0, days.count - 1) {
            guard isConsecutive(days[i], days[i + 1]) else { continue }
            guard var inp = input(days[i]), let o = outValue(days[i + 1]) else { continue }
            if inputZeroIsAbsent && inp <= 0 { continue }
            inp = max(inp, 0)
            pairs.append((inp, o))
        }
        guard let insight = bucketedComparison(
            pairs, icon: icon, tint: tint, kind: .correlation,
            higherIsBetter: higherIsBetter, phrase: phrase
        ) else { return [] }
        return [insight]
    }

    /// Split pairs at the input median, compare next-day-outcome means
    /// between the high-input and low-input halves, and emit an insight
    /// when the gap is meaningful.
    private static func bucketedComparison(
        _ pairs: [(inp: Double, out: Double)],
        icon: String,
        tint: Color,
        kind: DataInsight.Kind,
        higherIsBetter: Bool,
        phrase: (Double, Double) -> String
    ) -> DataInsight? {
        guard pairs.count >= 12 else { return nil } // ≥6 per bucket
        let sorted = pairs.sorted { $0.inp < $1.inp }
        let mid = sorted.count / 2
        let low = Array(sorted[..<mid])
        let high = Array(sorted[mid...])
        guard low.count >= 6, high.count >= 6 else { return nil }

        let mHigh = mean(high.map(\.out))
        let mLow = mean(low.map(\.out))
        guard mLow != 0 else { return nil }
        let rel = abs(mHigh - mLow) / abs(mLow)
        guard rel >= 0.05 else { return nil }

        let d = cohensD(high.map(\.out), low.map(\.out))
        let effect = min(abs(d) / 1.2, 1)
        let sampleConf = min(Double(min(low.count, high.count)) / 12.0, 1)
        let score = (0.45 + 0.45 * effect) * sampleConf * 95

        let better = (mHigh >= mLow) == higherIsBetter
        return DataInsight(
            kind: kind,
            title: phrase(mHigh, mLow),
            detail: "Across \(pairs.count) paired days, the outcome averaged "
                + "\(fmt(mHigh, .raw)) after your top-half input days vs \(fmt(mLow, .raw)) after the bottom half.",
            icon: icon,
            tint: tint,
            sentiment: better ? .positive : .watch,
            score: score
        )
    }

    // MARK: - 3. Trends
    //
    // Linear least-squares slope over the trailing window per metric.
    // Surface when the slope clears a per-metric "this is real" floor.

    private struct TrendSpec {
        let key: String
        let label: String
        let unit: OutcomeUnit
        let higherIsBetter: Bool
        let tint: Color
        let icon: String
        let value: (DailyEntry) -> Double?
        /// Minimum total change over the window (as a fraction of mean)
        /// to call it a trend rather than flat noise.
        let minRelChange: Double
    }

    private static func trends(_ days: [DailyEntry]) -> [DataInsight] {
        let window = Array(days.suffix(21))
        let specs: [TrendSpec] = [
            TrendSpec(key: "hrv",   label: "HRV",         unit: .raw,   higherIsBetter: true,  tint: LifeOSColor.Metric.hrv,   icon: "waveform.path.ecg", value: { $0.hrvMs },              minRelChange: 0.08),
            TrendSpec(key: "rhr",   label: "resting HR",  unit: .raw,   higherIsBetter: false, tint: LifeOSColor.Metric.rhr,   icon: "heart.fill",        value: { $0.restingHr },          minRelChange: 0.05),
            TrendSpec(key: "sleep", label: "sleep",       unit: .hours, higherIsBetter: true,  tint: LifeOSColor.Metric.sleep, icon: "bed.double.fill",   value: { $0.sleepHours },         minRelChange: 0.08),
            TrendSpec(key: "mood",  label: "mood",        unit: .raw,   higherIsBetter: true,  tint: LifeOSColor.Metric.mood,  icon: "face.smiling",      value: { $0.moodScore.map(Double.init) },   minRelChange: 0.10),
            TrendSpec(key: "energy",label: "energy",      unit: .raw,   higherIsBetter: true,  tint: LifeOSColor.Metric.energy,icon: "bolt.fill",         value: { $0.energyScore.map(Double.init) }, minRelChange: 0.10),
            TrendSpec(key: "steps", label: "daily steps", unit: .raw,   higherIsBetter: true,  tint: LifeOSColor.Metric.steps, icon: "figure.walk",       value: { $0.steps.map(Double.init) },       minRelChange: 0.12),
            TrendSpec(key: "weight",label: "weight",      unit: .raw,   higherIsBetter: false, tint: LifeOSColor.Metric.weight,icon: "scalemass.fill",    value: { $0.weightLb },           minRelChange: 0.02),
        ]
        var out: [DataInsight] = []
        for s in specs {
            guard let insight = trend(window, spec: s) else { continue }
            out.append(insight)
        }
        return out
    }

    private static func trend(_ window: [DailyEntry], spec: TrendSpec) -> DataInsight? {
        let pts: [(x: Double, y: Double)] = window.enumerated().compactMap { i, d in
            spec.value(d).map { (Double(i), $0) }
        }
        guard pts.count >= 8 else { return nil }
        guard let (slope, _) = leastSquares(pts) else { return nil }
        let m = mean(pts.map(\.y))
        guard m != 0 else { return nil }
        let totalChange = slope * Double(pts.count - 1)
        let relChange = totalChange / abs(m)
        guard abs(relChange) >= spec.minRelChange else { return nil }

        let r2 = rSquared(pts)
        let rising = totalChange > 0
        let good = (spec.higherIsBetter && rising) || (!spec.higherIsBetter && !rising)
        let dirWord = rising ? "trending up" : "trending down"
        let score = (0.35 + 0.4 * min(abs(relChange) / 0.3, 1)) * (0.5 + 0.5 * r2) * 80

        let title = "\(spec.label.capitalizedFirst) is \(dirWord)"
        let detail = "Over the last \(pts.count) logged days your \(spec.label) shifted "
            + "\(fmtSignedChange(totalChange, unit: spec.unit)) "
            + "(now around \(fmt(pts.last?.y ?? m, spec.unit))). "
            + (good ? "Keep doing whatever's driving it." : "Worth a closer look if it continues.")

        return DataInsight(
            kind: .trend,
            title: title,
            detail: detail,
            icon: spec.icon,
            tint: spec.tint,
            sentiment: good ? .positive : .watch,
            score: score
        )
    }

    // MARK: - 4. Anomalies
    //
    // Today's value vs the 14-day personal baseline (mean ± SD). Flag
    // when today lands beyond ~1.5 SD, which reads as a real departure
    // rather than day-to-day jitter.

    private struct AnomalySpec {
        let label: String
        let unit: String
        let higherIsBetter: Bool
        let tint: Color
        let icon: String
        let value: (DailyEntry) -> Double?
    }

    private static func anomalies(_ days: [DailyEntry], settings: UserSettings) -> [DataInsight] {
        guard let today = days.last else { return [] }
        // Compare against the 14 days preceding today (exclude today).
        let baselineDays = Array(days.dropLast().suffix(14))
        guard baselineDays.count >= 7 else { return [] }

        let specs: [AnomalySpec] = [
            AnomalySpec(label: "Resting HR", unit: "bpm", higherIsBetter: false, tint: LifeOSColor.Metric.rhr,   icon: "heart.fill",        value: { $0.restingHr }),
            AnomalySpec(label: "HRV",        unit: "ms",  higherIsBetter: true,  tint: LifeOSColor.Metric.hrv,   icon: "waveform.path.ecg", value: { $0.hrvMs }),
            AnomalySpec(label: "Sleep",      unit: "h",   higherIsBetter: true,  tint: LifeOSColor.Metric.sleep, icon: "bed.double.fill",   value: { $0.sleepHours }),
        ]
        var out: [DataInsight] = []
        for s in specs {
            guard let v = s.value(today) else { continue }
            let base = baselineDays.compactMap(s.value)
            guard base.count >= 7 else { continue }
            let m = mean(base)
            let sd = stddev(base, mean: m)
            guard sd > 0 else { continue }
            let z = (v - m) / sd
            guard abs(z) >= 1.5 else { continue }

            let above = v > m
            let absGap = abs(v - m)
            let bad = (s.higherIsBetter && !above) || (!s.higherIsBetter && above)
            let dirWord = above ? "above" : "below"
            let gapStr = s.unit == "h"
                ? String(format: "%.1f", absGap)
                : "\(Int(absGap.rounded()))"

            let title = "\(s.label) is \(gapStr) \(s.unit) \(dirWord) your normal"
            let detail = "Today's \(s.label.lowercased()) is \(fmtPlain(v, s.unit)) vs a 14-day baseline of "
                + "\(fmtPlain(m, s.unit)). "
                + (bad
                   ? (s.label == "Resting HR"
                      ? "An elevated resting HR can signal strain, dehydration, alcohol, or oncoming illness — ease off today."
                      : "A dip below baseline often means accumulated fatigue — prioritize recovery.")
                   : "A strong reading — a good day to push if you've been holding back.")

            // Bigger z = more notable; anomalies rank high so they lead.
            let score = min(abs(z) / 3.0, 1) * 90 + 10
            out.append(DataInsight(
                kind: .anomaly,
                title: title,
                detail: detail,
                icon: s.icon,
                tint: s.tint,
                sentiment: bad ? .watch : .positive,
                score: score
            ))
        }
        return out
    }

    // MARK: - 5. Streaks / consistency

    private static func streaks(_ days: [DailyEntry], settings: UserSettings) -> [DataInsight] {
        var out: [DataInsight] = []

        // Consecutive nights at/above the sleep goal, counting back from
        // the most recent logged night.
        let sleepGoal = settings.sleepGoalHours
        var sleepStreak = 0
        for d in days.reversed() {
            guard let h = d.sleepHours else { break }
            if h + 0.25 >= sleepGoal { sleepStreak += 1 } else { break }
        }
        if sleepStreak >= 3 {
            out.append(DataInsight(
                kind: .streak,
                title: "\(sleepStreak) straight nights at your sleep goal",
                detail: "You've hit \(fmt(sleepGoal, .hours)) or more \(sleepStreak) nights running. "
                    + "Sleep consistency is the single biggest lever on recovery — protect the streak.",
                icon: "bed.double.fill",
                tint: LifeOSColor.Metric.sleep,
                sentiment: .positive,
                score: 60 + Double(min(sleepStreak, 14)) * 2
            ))
        }

        // Consecutive days hydration goal hit.
        let waterGoal = settings.waterGoalOz
        if waterGoal > 0 {
            var waterStreak = 0
            for d in days.reversed() {
                if d.waterOz + 0.5 >= waterGoal { waterStreak += 1 } else { break }
            }
            if waterStreak >= 4 {
                out.append(DataInsight(
                    kind: .streak,
                    title: "\(waterStreak) days hitting your water goal",
                    detail: "Hydration locked in for \(waterStreak) days straight. Keep the bottle close.",
                    icon: "drop.fill",
                    tint: LifeOSColor.Metric.water,
                    sentiment: .positive,
                    score: 52 + Double(min(waterStreak, 14))
                ))
            }
        }

        // Consecutive days steps goal hit.
        let stepsGoal = Double(settings.stepsGoal)
        if stepsGoal > 0 {
            var stepStreak = 0
            for d in days.reversed() {
                guard let s = d.steps else { break }
                if Double(s) >= stepsGoal { stepStreak += 1 } else { break }
            }
            if stepStreak >= 3 {
                out.append(DataInsight(
                    kind: .streak,
                    title: "\(stepStreak)-day step goal streak",
                    detail: "\(stepStreak) days in a row over \(Int(stepsGoal)) steps. Movement consistency is paying off.",
                    icon: "figure.walk",
                    tint: LifeOSColor.Metric.steps,
                    sentiment: .positive,
                    score: 50 + Double(min(stepStreak, 14))
                ))
            }
        }

        return out
    }

    // MARK: - Stats helpers

    private static func mean(_ xs: [Double]) -> Double {
        guard !xs.isEmpty else { return 0 }
        return xs.reduce(0, +) / Double(xs.count)
    }

    private static func stddev(_ xs: [Double], mean m: Double) -> Double {
        guard xs.count > 1 else { return 0 }
        let v = xs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(xs.count - 1)
        return v.squareRoot()
    }

    /// Pooled-SD Cohen's d. Returns 0 when both groups are flat.
    private static func cohensD(_ a: [Double], _ b: [Double]) -> Double {
        guard a.count > 1, b.count > 1 else { return 0 }
        let ma = mean(a), mb = mean(b)
        let va = variance(a, mean: ma), vb = variance(b, mean: mb)
        let pooled = (Double(a.count - 1) * va + Double(b.count - 1) * vb)
            / Double(a.count + b.count - 2)
        guard pooled > 0 else { return 0 }
        return (ma - mb) / pooled.squareRoot()
    }

    private static func variance(_ xs: [Double], mean m: Double) -> Double {
        guard xs.count > 1 else { return 0 }
        return xs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(xs.count - 1)
    }

    /// Ordinary least-squares slope + intercept over (x,y). nil if x has
    /// no spread (can't fit a line).
    private static func leastSquares(_ pts: [(x: Double, y: Double)]) -> (slope: Double, intercept: Double)? {
        let n = Double(pts.count)
        guard n >= 2 else { return nil }
        let sx = pts.reduce(0) { $0 + $1.x }
        let sy = pts.reduce(0) { $0 + $1.y }
        let sxx = pts.reduce(0) { $0 + $1.x * $1.x }
        let sxy = pts.reduce(0) { $0 + $1.x * $1.y }
        let denom = n * sxx - sx * sx
        guard denom != 0 else { return nil }
        let slope = (n * sxy - sx * sy) / denom
        let intercept = (sy - slope * sx) / n
        return (slope, intercept)
    }

    /// Coefficient of determination for a fitted slope — used to weight
    /// trend confidence (a clean line beats a scattered one).
    private static func rSquared(_ pts: [(x: Double, y: Double)]) -> Double {
        guard let (s, b) = leastSquares(pts) else { return 0 }
        let my = mean(pts.map(\.y))
        let ssTot = pts.reduce(0) { $0 + ($1.y - my) * ($1.y - my) }
        guard ssTot > 0 else { return 0 }
        let ssRes = pts.reduce(0) { acc, p in
            let pred = s * p.x + b
            return acc + (p.y - pred) * (p.y - pred)
        }
        return max(0, 1 - ssRes / ssTot)
    }

    /// Deep + REM minutes as a fraction of total sleep — a quick sleep-
    /// quality proxy. nil when stage data is missing.
    private static func restorativeFraction(_ d: DailyEntry) -> Double? {
        guard let deep = d.sleepDeepMin, let rem = d.sleepREMMin else { return nil }
        let light = d.sleepLightMin ?? 0
        let total = deep + rem + light
        guard total > 0 else { return nil }
        return Double(deep + rem) / Double(total)
    }

    // MARK: - Consecutiveness

    private static let parser: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// True when `b` is the calendar day immediately after `a`. Used so
    /// lagged pairs don't span a gap in logging.
    private static func isConsecutive(_ a: DailyEntry, _ b: DailyEntry) -> Bool {
        guard let da = parser.date(from: a.date), let db = parser.date(from: b.date) else { return false }
        let cal = Calendar.current
        guard let days = cal.dateComponents([.day], from: da, to: db).day else { return false }
        return days == 1
    }

    // MARK: - Formatting

    private static func fmt(_ v: Double, _ unit: OutcomeUnit) -> String {
        switch unit {
        case .percent: return String(format: "%.0f%%", v * 100)
        case .hours:   return String(format: "%.1fh", v)
        case .raw:     return abs(v) >= 100 ? "\(Int(v.rounded()))" : String(format: "%.1f", v)
        }
    }

    private static func fmtPlain(_ v: Double, _ unit: String) -> String {
        unit == "h" ? String(format: "%.1f h", v) : "\(Int(v.rounded())) \(unit)"
    }

    /// Effect magnitude phrased relative to baseline — percent for ratio
    /// outcomes, absolute otherwise.
    private static func formatEffect(_ absDiff: Double, base: Double, unit: OutcomeUnit) -> String {
        switch unit {
        case .percent:
            return String(format: "%.0f pts", abs(absDiff) * 100)
        case .hours:
            return String(format: "%.0f min", abs(absDiff) * 60)
        case .raw:
            let pct = abs(absDiff) / abs(base) * 100
            return String(format: "%.0f%%", pct)
        }
    }

    private static func fmtSignedChange(_ v: Double, unit: OutcomeUnit) -> String {
        let sign = v >= 0 ? "+" : "−"
        switch unit {
        case .percent: return "\(sign)\(String(format: "%.0f", abs(v) * 100)) pts"
        case .hours:   return "\(sign)\(String(format: "%.0f", abs(v) * 60)) min"
        case .raw:     return "\(sign)\(String(format: abs(v) >= 10 ? "%.0f" : "%.1f", abs(v)))"
        }
    }

    private static func fmtDelta(_ v: Double) -> String {
        // Generic 1–10 / ratio delta phrased as points.
        String(format: "%.1f pts", abs(v))
    }

    private static func soWhat(flag: Flag, bad: Bool, outcome: Outcome) -> String {
        guard bad else { return "A clear positive signal in your data — keep it up." }
        switch flag.key {
        case "alcohol":  return "Even one fewer drinking night a week could move your \(outcome.label)."
        case "caffeine": return "Try cutting caffeine before 2pm and watch the gap close."
        case "lateEat":  return "Shifting your last meal earlier is the cheapest fix here."
        case "screen":   return "A screen-free wind-down is the lowest-effort lever to pull."
        case "stress":   return "On high-stress days, lean harder on recovery — sleep, hydration, easy movement."
        default:         return "Worth experimenting with."
        }
    }

    private static func flagIcon(_ key: String) -> String {
        switch key {
        case "alcohol":  return "wineglass.fill"
        case "caffeine": return "cup.and.saucer.fill"
        case "lateEat":  return "fork.knife"
        case "screen":   return "iphone"
        case "stress":   return "exclamationmark.triangle.fill"
        default:         return "circle.fill"
        }
    }

    private static func outcomeTint(_ key: String) -> Color {
        switch key {
        case "hrv":    return LifeOSColor.Metric.hrv
        case "rhr":    return LifeOSColor.Metric.rhr
        case "sleep":  return LifeOSColor.Metric.sleep
        case "deep":   return LifeOSColor.Metric.sleep
        case "mood":   return LifeOSColor.Metric.mood
        case "energy": return LifeOSColor.Metric.energy
        default:       return LifeOSColor.accent
        }
    }

    /// Keep only the top `limit` insights per behavioral flag, by score,
    /// so one strong driver doesn't monopolize the feed.
    private static func topPerFlag(_ insights: [DataInsight], limit: Int) -> [DataInsight] {
        // The flag isn't on the DataInsight, so re-derive grouping from the
        // icon (each flag has a unique icon). Cheap and avoids widening
        // the public type for an internal ranking concern.
        let grouped = Dictionary(grouping: insights, by: \.icon)
        var out: [DataInsight] = []
        for (_, group) in grouped {
            out += group.sorted { $0.score > $1.score }.prefix(limit)
        }
        return out
    }
}

private extension String {
    /// Capitalize only the first character, leaving acronyms like "HRV"
    /// intact (Swift's `.capitalized` would lowercase the rest).
    var capitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
