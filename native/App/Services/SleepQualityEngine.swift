import Foundation
import SwiftUI

/// Deterministic, on-device sleep-quality intelligence. Distinct from
/// `RecoveryEngine` (which folds sleep into a morning autonomic readiness
/// score), this engine answers a narrower question: "how GOOD was this
/// night of sleep, on its own terms?" It blends four pillars —
///   - duration vs the user's goal,
///   - deep-sleep proportion (ideal ~13–23% of asleep time),
///   - REM proportion (ideal ~20–25%),
///   - efficiency (asleep / in-bed, derived from awake time) —
/// into a single 0…100 score with a per-pillar breakdown, then tracks
/// multi-night sleep debt and deep/REM architecture trends.
///
/// The ideal-range thresholds intentionally match `RecoveryEngine.stageQuality`
/// (deep 13–23%, REM 20–25%) so the two surfaces never disagree about what a
/// healthy night looks like. When per-stage minutes are absent we still return
/// a score off duration alone and mark the stage pillars as unavailable, rather
/// than substituting a fake "average" — the same honesty rule RecoveryEngine
/// follows.
struct SleepQuality {
    let score: Int                  // 0...100
    let headline: String
    let components: [Component]     // duration, deep, rem, efficiency

    struct Component: Identifiable {
        let id = UUID()
        let label: String
        let value: Int              // 0...100 quality for this pillar
        let detail: String          // human-readable read ("18% · ideal")
        let tint: Color
    }
}

enum SleepQualityEngine {
    // MARK: - Per-night quality

    /// Score a single night. `goalHours` is the user's sleep goal. Returns nil
    /// when the night has no sleep duration at all (the UI shows an empty
    /// state). Duration always contributes; the deep/REM/efficiency pillars
    /// only contribute when per-stage minutes exist, and the present pillars
    /// are re-weighted across themselves so a stage-less night still produces a
    /// fair score rather than being dragged toward zero.
    static func score(for daily: DailyEntry, goalHours: Double) -> SleepQuality? {
        guard let hours = daily.sleepHours else { return nil }
        let goal = goalHours > 0 ? goalHours : 8.0

        var pillars: [Pillar] = []

        // Duration — always present. Quality ramps to 1.0 at goal and is held
        // flat past it (oversleeping isn't rewarded, but isn't penalized to the
        // point of hurting the score for someone catching up).
        let durQ = durationQuality(hours, goal: goal)
        pillars.append(Pillar(
            label: "Duration",
            quality: durQ,
            weight: 0.40,
            tint: LifeOSColor.Metric.sleep,
            detail: durationDetail(hours, goal: goal)
        ))

        // Stage pillars — only when HealthKit gave us per-stage minutes.
        let stages = stageBreakdown(daily)
        if let s = stages {
            let deepQ = bandScore(s.deepPct, low: 0.13, high: 0.23, tolerance: 0.10)
            pillars.append(Pillar(
                label: "Deep",
                quality: deepQ,
                weight: 0.25,
                tint: LifeOSColor.SleepStage.deep,
                detail: stagePctDetail(s.deepPct, low: 0.13, high: 0.23)
            ))

            let remQ = bandScore(s.remPct, low: 0.20, high: 0.25, tolerance: 0.12)
            pillars.append(Pillar(
                label: "REM",
                quality: remQ,
                weight: 0.20,
                tint: LifeOSColor.SleepStage.rem,
                detail: stagePctDetail(s.remPct, low: 0.20, high: 0.25)
            ))

            // Efficiency — asleep / in-bed. We only know awake time, so in-bed
            // is approximated as asleep + awake. 90%+ reads as excellent.
            let effQ = efficiencyQuality(s.efficiency)
            pillars.append(Pillar(
                label: "Efficiency",
                quality: effQ,
                weight: 0.15,
                tint: LifeOSColor.SleepStage.awake,
                detail: "\(Int((s.efficiency * 100).rounded()))% asleep in bed"
            ))
        }

        let totalWeight = pillars.reduce(0.0) { $0 + $1.weight }
        guard totalWeight > 0 else { return nil }
        let weighted = pillars.reduce(0.0) { $0 + $1.quality * ($1.weight / totalWeight) }
        let score = Int((weighted * 100).rounded().clamped(to: 0...100))

        let components = pillars.map { p in
            SleepQuality.Component(
                label: p.label,
                value: Int((p.quality * 100).rounded().clamped(to: 0...100)),
                detail: p.detail,
                tint: p.tint
            )
        }

        return SleepQuality(
            score: score,
            headline: headline(score: score, hasStages: stages != nil),
            components: components
        )
    }

    // MARK: - Sleep debt

    /// Cumulative sleep deficit (hours) over the trailing window. Only nights
    /// BELOW goal add to debt — surplus nights don't pay it down 1:1, the way
    /// fatigue actually compounds (one 9h night doesn't erase a week of 5h).
    /// Recent nights are weighted slightly heavier via an exponential decay so
    /// last night matters more than a deficit ten days ago. Returns 0 when no
    /// nights have data or the window is fully rested.
    static func debtHours(history: [DailyEntry], goalHours: Double) -> Double {
        let goal = goalHours > 0 ? goalHours : 8.0
        // Most-recent-first ordering so index 0 is the freshest night.
        let nights = sortedDescending(history).prefix(14).compactMap { $0.sleepHours }
        guard !nights.isEmpty else { return 0 }

        // decay^i weights: 1.0 for the most recent, ~0.9 per step back.
        let decay = 0.92
        var debt = 0.0
        for (i, h) in nights.enumerated() {
            let deficit = max(0, goal - h)
            debt += deficit * pow(decay, Double(i))
        }
        return debt
    }

    /// One-line, plain-language read on the current debt + an estimate of how
    /// many at-goal nights clear it. Surplus over goal pays debt down ~1h per
    /// surplus-hour, so the paydown estimate assumes the user lands ~1h over
    /// goal on the recovery nights.
    static func debtRead(history: [DailyEntry], goalHours: Double) -> String {
        let debt = debtHours(history: history, goalHours: goalHours)
        if debt < 0.5 { return "No meaningful sleep debt — you're keeping pace with your goal." }
        // Assume ~1h of payback per recovery night (goal + ~1h, capped reality).
        let nightsToClear = max(1, Int((debt / 1.0).rounded(.up)))
        let nightWord = nightsToClear == 1 ? "one night" : "\(nightsToClear) nights"
        let qualifier = debt < 2 ? "a light" : (debt < 5 ? "a moderate" : "a heavy")
        return String(
            format: "You're carrying ~%.1fh of sleep debt — %@ load. %@ above goal mostly clears it.",
            debt, qualifier, nightWord.capitalizedFirst
        )
    }

    // MARK: - Consistency

    /// Bedtime/wake-regularity proxy on 0…100. Without stored clock times we
    /// proxy regularity off the spread in nightly sleep DURATION across the
    /// window — a steady sleeper logs similar hours night to night, an
    /// irregular one swings. Standard deviation of ~0h → 100, ~2.5h+ → 0.
    /// Returns nil with fewer than 3 nights (not enough to judge a pattern).
    static func consistencyScore(history: [DailyEntry], goalHours: Double) -> Int? {
        let nights = sortedDescending(history).prefix(14).compactMap { $0.sleepHours }
        guard nights.count >= 3 else { return nil }
        let mean = nights.reduce(0, +) / Double(nights.count)
        let variance = nights.reduce(0.0) { $0 + ($1 - mean) * ($1 - mean) } / Double(nights.count)
        let sd = variance.squareRoot()
        // 0h SD → 100, 2.5h SD → 0, linear between.
        let score = (1 - sd / 2.5).clamped(to: 0...1) * 100
        return Int(score.rounded())
    }

    /// Social-jetlag-style read off the consistency proxy.
    static func consistencyRead(history: [DailyEntry], goalHours: Double) -> String? {
        guard let score = consistencyScore(history: history, goalHours: goalHours) else { return nil }
        switch score {
        case 80...:  return "Rock-steady schedule — your sleep timing barely moves night to night."
        case 55..<80: return "Fairly consistent, with some swing. Tightening bed/wake times would sharpen recovery."
        default:     return "Irregular sleep timing — big swings in nightly hours act like jet lag on your body clock."
        }
    }

    // MARK: - Architecture trends

    /// Deep-sleep minutes per night across the window, oldest→newest, for the
    /// trend chart. Only nights with deep-stage data produce a point.
    static func deepTrend(history: [DailyEntry]) -> [TrendPoint] {
        trend(history) { $0.sleepDeepMin }
    }

    /// REM-sleep minutes per night across the window, oldest→newest.
    static func remTrend(history: [DailyEntry]) -> [TrendPoint] {
        trend(history) { $0.sleepREMMin }
    }

    // MARK: - Pillar

    private struct Pillar {
        let label: String
        let quality: Double   // 0...1
        let weight: Double    // target share before re-normalization
        let tint: Color
        let detail: String
    }

    // MARK: - Stage math

    private struct StageBreakdown {
        let deepPct: Double
        let remPct: Double
        let efficiency: Double   // asleep / (asleep + awake)
    }

    /// Decompose a night into deep/REM proportions of asleep time and an
    /// efficiency figure. nil when per-stage minutes are missing or sum to a
    /// degenerate (zero) asleep total.
    private static func stageBreakdown(_ d: DailyEntry) -> StageBreakdown? {
        guard let deep = d.sleepDeepMin,
              let rem = d.sleepREMMin,
              let light = d.sleepLightMin else { return nil }
        let asleep = Double(deep + rem + light)
        guard asleep > 0 else { return nil }
        let awake = Double(d.sleepAwakeMin ?? 0)
        let inBed = asleep + awake
        return StageBreakdown(
            deepPct: Double(deep) / asleep,
            remPct: Double(rem) / asleep,
            efficiency: inBed > 0 ? asleep / inBed : 1
        )
    }

    private static func durationQuality(_ hours: Double, goal: Double) -> Double {
        guard goal > 0 else { return 0.5 }
        // Ramp to 1.0 at goal; hold flat above so a catch-up night isn't dinged.
        return (hours / goal).clamped(to: 0...1)
    }

    /// Efficiency quality — 85% asleep-in-bed is the clinical "good" floor,
    /// 95%+ is excellent. Below 75% reads as fragmented.
    private static func efficiencyQuality(_ eff: Double) -> Double {
        mapLinear(eff, from: 0.70...0.95)
    }

    /// 1.0 inside [low…high], decaying linearly to 0 once `value` is
    /// `tolerance` outside the band — identical shape to RecoveryEngine's
    /// bandScore so the two engines agree on "ideal".
    private static func bandScore(_ value: Double, low: Double, high: Double, tolerance: Double) -> Double {
        if value >= low && value <= high { return 1 }
        let dist = value < low ? (low - value) : (value - high)
        return (1 - dist / tolerance).clamped(to: 0...1)
    }

    private static func mapLinear(_ value: Double, from range: ClosedRange<Double>) -> Double {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0.5 }
        return ((value - range.lowerBound) / span).clamped(to: 0...1)
    }

    // MARK: - Details / headline

    private static func durationDetail(_ hours: Double, goal: Double) -> String {
        let h = Int(hours)
        let m = Int((hours - Double(h)) * 60)
        let delta = hours - goal
        if abs(delta) < 0.25 { return String(format: "%dh %02dm · at goal", h, m) }
        let sign = delta >= 0 ? "+" : "−"
        return String(format: "%dh %02dm · %@%.1fh vs goal", h, m, sign, abs(delta))
    }

    private static func stagePctDetail(_ pct: Double, low: Double, high: Double) -> String {
        let p = Int((pct * 100).rounded())
        if pct >= low && pct <= high { return "\(p)% · ideal" }
        return pct < low ? "\(p)% · below ideal" : "\(p)% · above ideal"
    }

    private static func headline(score: Int, hasStages: Bool) -> String {
        let base: String
        switch score {
        case 85...:  base = "Excellent sleep"
        case 70..<85: base = "Solid night"
        case 55..<70: base = "Decent, room to improve"
        case 40..<55: base = "Rough night"
        default:     base = "Poor sleep"
        }
        return hasStages ? base : base + " · duration only"
    }

    // MARK: - Trend helpers

    /// Build an oldest→newest `[TrendPoint]` of an Int sleep-stage field,
    /// skipping nights where the field is nil. Dates are parsed from the
    /// "yyyy-MM-dd" key; unparseable keys are dropped.
    private static func trend(_ history: [DailyEntry], _ pick: (DailyEntry) -> Int?) -> [TrendPoint] {
        sortedAscending(history).compactMap { d in
            guard let mins = pick(d), let day = ymd.date(from: d.date) else { return nil }
            return TrendPoint(day: day, value: Double(mins))
        }
    }

    private static func sortedAscending(_ history: [DailyEntry]) -> [DailyEntry] {
        history.sorted { $0.date < $1.date }
    }

    private static func sortedDescending(_ history: [DailyEntry]) -> [DailyEntry] {
        history.sorted { $0.date > $1.date }
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}

// MARK: - Small local helpers

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

private extension String {
    /// Uppercase just the first character — used to make "one night" read as
    /// "One night" at the start of a sentence fragment.
    var capitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
