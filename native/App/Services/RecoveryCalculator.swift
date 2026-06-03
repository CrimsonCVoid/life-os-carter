import Foundation
import SwiftUI

/// WHOOP-style daily recovery. Recovery answers "how prepared is your body
/// to take on strain today" and is dominated by autonomic signals: HRV vs a
/// LEARNED rolling baseline (heaviest), resting HR vs baseline (inverted),
/// last night's sleep (duration + stage architecture + multi-night debt),
/// and a prior-day-strain damper.
///
/// Two design rules separate this from a naive weighted blend:
///   1. Baselines are LEARNED from `history` (trailing mean + SD of HRV/RHR),
///      not read from a stored field — so the score adapts to the individual.
///   2. Missing inputs are NOT substituted with a neutral 50. Weights are
///      RE-NORMALIZED across only the present inputs and the absent ones are
///      reported in `missingInputs`, so a sparse day yields an honest partial
///      score rather than a fake "average".
///
/// Sleep is required: recovery is a morning-after-sleep metric, so with no
/// sleep data we return nil and the UI shows an empty state.
struct RecoveryResult {
    let score: Int                 // 0...100 recovery percentage
    let band: Band
    let headline: String
    let drivers: [Driver]          // sorted by |impact| desc
    let recommendedStrain: ClosedRange<Double>?  // suggested target on 0...21; nil if not enough data
    let baselineReady: Bool        // false while baselines are still being learned
    let missingInputs: [String]    // human labels of inputs we lacked

    enum Band { case low, medium, high }

    struct Driver: Identifiable {
        let id = UUID()
        let label: String
        let detail: String
        let impact: Double         // signed, roughly -1...1
        let tint: Color
    }
}

enum RecoveryEngine {
    /// `history` = recent DailyEntry rows EXCLUDING today, most-recent first,
    /// up to ~30 entries. `today` is the current day's DailyEntry. Returns nil
    /// only when there is no sleep data for today.
    static func compute(
        today: DailyEntry,
        history: [DailyEntry],
        priorStrain: Double?,
        sleepGoalHours: Double
    ) -> RecoveryResult? {
        guard today.sleepHours != nil else { return nil }

        let hrvStats = baseline(history.compactMap { $0.hrvMs })
        let rhrStats = baseline(history.compactMap { $0.restingHr })

        // Baselines need a handful of nights before the z-scores mean anything.
        let hrvSamples = history.compactMap { $0.hrvMs }.count
        let rhrSamples = history.compactMap { $0.restingHr }.count
        let baselineReady = hrvSamples >= 5 || rhrSamples >= 5

        // Each contributor produces a 0...1 quality and a target weight. When
        // the underlying input is absent it returns nil and is dropped from
        // the normalization rather than scored as neutral.
        var contributors: [Contributor] = []
        var missing: [String] = []

        // HRV/RHR are sparse on a calendar-day basis — Apple Watch logs SDNN
        // irregularly, so a given night often has no reading even when recent
        // ones exist. Fall back to the most recent value within 2 days so a
        // gap night doesn't drop the dominant autonomic signal entirely.
        let hrvToday = today.hrvMs
            ?? recentValue(history, asOf: today.date, within: 2) { $0.hrvMs }
        let rhrToday = today.restingHr
            ?? recentValue(history, asOf: today.date, within: 2) { $0.restingHr }

        // HRV — dominant signal (target 0.42). Higher than baseline = recovered.
        if let hrv = hrvToday {
            let q = hrvQuality(hrv, stats: hrvStats)
            contributors.append(Contributor(
                label: "HRV",
                quality: q,
                weight: 0.42,
                tint: LifeOSColor.Metric.hrv,
                detail: deltaDetail(value: hrv, baseline: hrvStats?.mean, unit: "ms")
            ))
        } else {
            missing.append("HRV")
        }

        // Resting HR — inverted (target 0.20). Lower than baseline = recovered.
        if let rhr = rhrToday {
            let q = rhrQuality(rhr, stats: rhrStats)
            contributors.append(Contributor(
                label: "Resting HR",
                quality: q,
                weight: 0.20,
                tint: LifeOSColor.Metric.rhr,
                detail: deltaDetail(value: rhr, baseline: rhrStats?.mean, unit: "bpm", inverted: true)
            ))
        } else {
            missing.append("Resting HR")
        }

        // Sleep — duration vs goal blended with stage quality (target 0.25).
        if let sleep = today.sleepHours {
            let durationQ = durationQuality(sleep, goalHours: sleepGoalHours)
            let stageQ = stageQuality(today)
            let q: Double = stageQ.map { durationQ * 0.65 + $0 * 0.35 } ?? durationQ
            if stageQ == nil { missing.append("Sleep stages") }
            contributors.append(Contributor(
                label: "Sleep",
                quality: q,
                weight: 0.25,
                tint: LifeOSColor.Metric.sleep,
                detail: sleepDetail(today, goalHours: sleepGoalHours)
            ))
        }

        // Sleep debt — cumulative shortfall over the trailing nights (target 0.05).
        // A standalone driver so chronic under-sleep keeps pressure on recovery
        // even after one good night.
        if let debt = sleepDebt(history: history, goalHours: sleepGoalHours) {
            let q = (1 - (debt / 6.0)).clamped(to: 0...1)  // 6h+ accumulated debt → 0
            contributors.append(Contributor(
                label: "Sleep debt",
                quality: q,
                weight: 0.05,
                tint: LifeOSColor.Metric.sleep,
                detail: debt < 0.25
                    ? "no debt · rested"
                    : String(format: "%.1fh deficit over %dd", debt, min(history.count, 7))
            ))
        }

        // Prior-day strain damper (target 0.10). A hard yesterday tempers today.
        if let strain = priorStrain {
            let normalized = (strain / 21.0).clamped(to: 0...1)
            let q = 1 - normalized * 0.75  // rest day → 1.0, all-out → 0.25
            contributors.append(Contributor(
                label: "Prior strain",
                quality: q,
                weight: 0.10,
                tint: LifeOSColor.Metric.strain,
                detail: strain < 1 ? "rest day yesterday" : String(format: "%.1f strain yesterday", strain)
            ))
        } else {
            missing.append("Prior strain")
        }

        // Re-normalize weights across present contributors only.
        let totalWeight = contributors.reduce(0.0) { $0 + $1.weight }
        guard totalWeight > 0 else { return nil }

        let weighted = contributors.reduce(0.0) { $0 + $1.quality * ($1.weight / totalWeight) }
        let score = Int((weighted * 100).rounded().clamped(to: 0...100))
        let band = band(for: score)

        // Driver impact = how far this input pushed recovery off neutral (0.5),
        // scaled by its effective (re-normalized) weight. Signed so the detail
        // sheet can render up/down bars.
        let drivers: [RecoveryResult.Driver] = contributors.map { c in
            let effectiveWeight = c.weight / totalWeight
            return RecoveryResult.Driver(
                label: c.label,
                detail: c.detail,
                impact: (c.quality - 0.5) * 2 * effectiveWeight,
                tint: c.tint
            )
        }.sorted { abs($0.impact) > abs($1.impact) }

        return RecoveryResult(
            score: score,
            band: band,
            headline: headline(for: band),
            drivers: drivers,
            recommendedStrain: recommendedStrain(for: score),
            baselineReady: baselineReady,
            missingInputs: missing
        )
    }

    // MARK: - Contributor

    private struct Contributor {
        let label: String
        let quality: Double   // 0...1
        let weight: Double    // target share before re-normalization
        let tint: Color
        let detail: String
    }

    // MARK: - Quality functions

    /// HRV quality from a z-score against the learned baseline, with a %-delta
    /// fallback when SD is unavailable (too few samples). z of -1.5…+1.5 maps
    /// to 0…1, centered at 0.5 so "at baseline" reads as solidly recovered.
    private static func hrvQuality(_ hrv: Double, stats: Stats?) -> Double {
        guard let stats else { return 0.5 }  // no baseline yet — neutral until learned
        if stats.sd > 1 {
            let z = (hrv - stats.mean) / stats.sd
            return (0.5 + z / 3.0).clamped(to: 0...1)
        }
        guard stats.mean > 0 else { return 0.5 }
        let pct = (hrv - stats.mean) / stats.mean
        return mapLinear(pct, from: -0.25...0.25)
    }

    /// RHR quality — inverted (lower is better).
    private static func rhrQuality(_ rhr: Double, stats: Stats?) -> Double {
        guard let stats else { return 0.5 }
        if stats.sd > 0.5 {
            let z = (rhr - stats.mean) / stats.sd
            return (0.5 - z / 3.0).clamped(to: 0...1)
        }
        guard stats.mean > 0 else { return 0.5 }
        let pct = (stats.mean - rhr) / stats.mean
        return mapLinear(pct, from: -0.12...0.12)
    }

    private static func durationQuality(_ hours: Double, goalHours: Double) -> Double {
        guard goalHours > 0 else { return 0.5 }
        return (hours / goalHours).clamped(to: 0...1.1) / 1.1
    }

    /// Stage-architecture quality (0...1). Rewards proportions near the healthy
    /// adult window — deep ~13–23%, REM ~20–25% of asleep time — and penalizes
    /// fragmentation (awake time). nil when per-stage minutes are absent.
    private static func stageQuality(_ d: DailyEntry) -> Double? {
        guard let deep = d.sleepDeepMin,
              let rem = d.sleepREMMin,
              let light = d.sleepLightMin else { return nil }
        let asleep = Double(deep + rem + light)
        guard asleep > 0 else { return nil }

        let deepPct = Double(deep) / asleep
        let remPct = Double(rem) / asleep
        let deepScore = bandScore(deepPct, low: 0.13, high: 0.23, tolerance: 0.10)
        let remScore = bandScore(remPct, low: 0.20, high: 0.25, tolerance: 0.12)

        let awake = Double(d.sleepAwakeMin ?? 0)
        let awakeFrac = awake / (asleep + awake)
        let continuity = (1 - awakeFrac / 0.20).clamped(to: 0...1)  // 20%+ awake → 0

        return (deepScore * 0.45 + remScore * 0.35 + continuity * 0.20).clamped(to: 0...1)
    }

    /// Trailing sleep debt in hours — sum of per-night shortfalls below goal
    /// over up to 7 prior nights (surplus nights don't pay down debt 1:1; we
    /// only accumulate deficits, the way fatigue actually compounds). nil when
    /// no prior nights have sleep data.
    private static func sleepDebt(history: [DailyEntry], goalHours: Double) -> Double? {
        guard goalHours > 0 else { return nil }
        let nights = history.prefix(7).compactMap { $0.sleepHours }
        guard !nights.isEmpty else { return nil }
        return nights.reduce(0.0) { acc, h in acc + max(0, goalHours - h) }
    }

    // MARK: - Recommended strain

    /// Map recovery score to a suggested strain target band on 0...21. High
    /// recovery → room to push; low recovery → active recovery / rest. nil when
    /// the score itself is too uncertain to advise on (we always have a score
    /// here, so this returns a band, but kept optional for the contract).
    private static func recommendedStrain(for score: Int) -> ClosedRange<Double>? {
        switch score {
        case ..<34:   return 0...8     // prioritize recovery — light only
        case 34..<50: return 6...11
        case 50..<67: return 9...14
        case 67..<85: return 12...17
        default:      return 15...21   // primed — green light to push
        }
    }

    // MARK: - Headline

    private static func headline(for band: RecoveryResult.Band) -> String {
        switch band {
        case .high:   return "Primed to push"
        case .medium: return "Hold steady"
        case .low:    return "Prioritize recovery"
        }
    }

    // MARK: - Stats / helpers

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Most recent non-nil value from `history` (sorted most-recent first)
    /// whose date is within `within` days of `asOf`. Used to carry a sparse
    /// signal (HRV/RHR) forward over a gap night rather than dropping it.
    private static func recentValue(
        _ history: [DailyEntry],
        asOf todayDate: String,
        within days: Int,
        _ pick: (DailyEntry) -> Double?
    ) -> Double? {
        let ref = ymd.date(from: todayDate)
        let cal = Calendar.current
        for row in history {
            guard let v = pick(row) else { continue }
            // First non-nil is the most recent; accept only if recent enough.
            guard let ref,
                  let d = ymd.date(from: row.date),
                  let diff = cal.dateComponents(
                    [.day],
                    from: cal.startOfDay(for: d),
                    to: cal.startOfDay(for: ref)
                  ).day
            else { return v }
            return diff <= days ? v : nil
        }
        return nil
    }

    private struct Stats { let mean: Double; let sd: Double }

    private static func baseline(_ values: [Double]) -> Stats? {
        guard !values.isEmpty else { return nil }
        let mean = values.reduce(0, +) / Double(values.count)
        guard values.count > 1 else { return Stats(mean: mean, sd: 0) }
        let variance = values.reduce(0.0) { $0 + ($1 - mean) * ($1 - mean) } / Double(values.count - 1)
        return Stats(mean: mean, sd: variance.squareRoot())
    }

    /// "<value> <unit> · <±delta>% vs baseline" — or just the value when no
    /// baseline exists yet. `inverted` flips the sign so a lower RHR reads as
    /// a positive (recovered) delta.
    private static func deltaDetail(value: Double, baseline: Double?, unit: String, inverted: Bool = false) -> String {
        let v = Int(value.rounded())
        guard let base = baseline, base > 0 else { return "\(v) \(unit)" }
        var delta = Int(((value - base) / base * 100).rounded())
        if inverted { delta = -delta }
        let sign = delta >= 0 ? "+" : ""
        return "\(v) \(unit) · \(sign)\(delta)% vs baseline"
    }

    private static func sleepDetail(_ d: DailyEntry, goalHours: Double) -> String {
        guard let s = d.sleepHours else { return "no sleep data" }
        let h = Int(s)
        let m = Int((s - Double(h)) * 60)
        let base = String(format: "%dh %02dm / %.0fh goal", h, m, goalHours)
        if let deep = d.sleepDeepMin, let rem = d.sleepREMMin, let light = d.sleepLightMin {
            let staged = Double(deep + rem + light)
            if staged > 0 {
                let deepPct = Int((Double(deep) / staged * 100).rounded())
                let remPct = Int((Double(rem) / staged * 100).rounded())
                return "\(base) · \(deepPct)% deep · \(remPct)% REM"
            }
        }
        return base
    }

    private static func mapLinear(_ value: Double, from range: ClosedRange<Double>) -> Double {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0.5 }
        return ((value - range.lowerBound) / span).clamped(to: 0...1)
    }

    /// 1.0 inside [low…high], decaying linearly to 0 once `value` is `tolerance`
    /// outside the band on either side.
    private static func bandScore(_ value: Double, low: Double, high: Double, tolerance: Double) -> Double {
        if value >= low && value <= high { return 1 }
        let dist = value < low ? (low - value) : (value - high)
        return (1 - dist / tolerance).clamped(to: 0...1)
    }

    private static func band(for value: Int) -> RecoveryResult.Band {
        switch value {
        case ..<34:   return .low
        case 34..<67: return .medium
        default:      return .high
        }
    }
}

/// Whoop-style strain score on a 0–21 scale. Rough approximation: blends
/// today's logged lift volume against the user's 7-day rolling max volume +
/// active-energy-burned (HealthKit). Without continuous HR we can't replicate
/// Whoop's EPOC math, but the relative number still answers "did I do a lot
/// today vs my normal." Public API is consumed by TodayView and must not change.
enum StrainCalculator {
    struct Score {
        let value: Double        // 0–21
        let band: Band
        let breakdown: String    // one-line user-facing detail
        /// Cardio vs mechanical contributors on the same 0...21 scale, with
        /// each one's share of the combined load. Empty for older callers /
        /// rest days; populated by `compute` so the detail sheet can render
        /// "what's driving it" without re-deriving the math. Additive — does
        /// not affect existing callers reading value/band/breakdown.
        let components: [StrainComponent]
    }

    enum Band {
        case rest, light, moderate, hard, allOut
    }

    /// One driver of the day's strain (cardio or mechanical), surfaced for
    /// the detail breakdown. `value` is on the 0...21 scale, `share` is its
    /// fraction of the combined load (0...1).
    struct StrainComponent: Identifiable {
        let id = UUID()
        let label: String
        let value: Double      // 0...21-ish
        let share: Double      // 0...1 fraction of combined load
        let tint: Color
        let detail: String
    }

    /// - Parameters:
    ///   - sessionRPE: volume-weighted session RPE (6–10) recovered from the
    ///     day's lift sets. nil when no RPE was logged — mechanical load then
    ///     uses a neutral ~7/10 multiplier.
    ///   - steps / distanceMeters: corroborating cardio signal. They don't stack
    ///     additively on active energy (double-counting the same movement) —
    ///     instead they fill in cardio load via a max() blend.
    static func compute(
        liftVolumeTodayLb: Double,
        liftVolumeMax7dLb: Double,
        activeEnergyKcal: Double,
        sessionRPE: Double? = nil,
        steps: Int? = nil,
        distanceMeters: Double? = nil
    ) -> Score {
        let kcalCardio = activeEnergyKcal / 50.0
        let stepCardio = steps.map { Double($0) / 1200.0 } ?? 0          // 12k steps → 10
        let distCardio = distanceMeters.map { ($0 / 1609.34) / 0.5 } ?? 0 // 5 mi → 10
        let cardio = min(16.0, max(kcalCardio, max(stepCardio, distCardio)))

        let rpeMultiplier: Double = {
            let rpe = sessionRPE ?? 7.0
            let m = 0.6 + (rpe - 6.0) / 4.0 * 0.7  // RPE 6…10 → 0.6…1.3
            return m.clamped(to: 0.6...1.3)
        }()
        let mechanicalBase: Double = {
            guard liftVolumeMax7dLb > 0 else { return liftVolumeTodayLb > 0 ? 5 : 0 }
            let ratio = min(1.2, liftVolumeTodayLb / liftVolumeMax7dLb)
            return ratio * 8.0
        }()
        let mechanical = mechanicalBase * (liftVolumeTodayLb > 0 ? rpeMultiplier : 1.0)

        // Soft-combine so a hard lift + long cardio don't simply sum.
        let combined = (cardio * cardio + mechanical * mechanical).squareRoot() * 0.92
        let value = min(21.0, combined)
        let band: Band = {
            switch value {
            case ..<4:    return .rest
            case 4..<9:   return .light
            case 9..<14:  return .moderate
            case 14..<18: return .hard
            default:      return .allOut
            }
        }()
        let breakdown: String = {
            if value < 1 { return "no activity logged today" }
            let kcalPart = activeEnergyKcal > 0 ? "\(Int(activeEnergyKcal)) kcal active" : nil
            let liftPart: String? = {
                guard liftVolumeTodayLb > 0 else { return nil }
                let base = "\(Int(liftVolumeTodayLb)) lb"
                guard let rpe = sessionRPE else { return base }
                let rpeStr = rpe.truncatingRemainder(dividingBy: 1) == 0
                    ? "\(Int(rpe))" : String(format: "%.1f", rpe)
                return "\(base) @ RPE \(rpeStr)"
            }()
            let stepPart: String? = {
                guard kcalPart == nil, liftPart == nil, let s = steps, s > 0 else { return nil }
                return "\(s) steps"
            }()
            return [liftPart, kcalPart, stepPart].compactMap { $0 }.joined(separator: " · ")
        }()

        // Share each contributor by its squared magnitude — matches the
        // quadrature soft-combine above, so the proportions reflect how the
        // two loads actually fold into the final value rather than a naive
        // linear split.
        let cw = cardio * cardio
        let mw = mechanical * mechanical
        let denom = cw + mw
        var components: [StrainComponent] = []
        if denom > 0 {
            let cardioDetail: String = {
                let kcalStr = activeEnergyKcal > 0 ? "\(Int(activeEnergyKcal)) kcal active" : nil
                let stepStr = steps.map { "\($0) steps" }
                let miStr = distanceMeters.map { String(format: "%.1f mi", $0 / 1609.34) }
                let parts = [kcalStr, stepStr, miStr].compactMap { $0 }
                return parts.isEmpty ? "no cardio logged" : parts.joined(separator: " · ")
            }()
            let mechDetail: String = {
                guard liftVolumeTodayLb > 0 else { return "no lifting logged" }
                let base = "\(Int(liftVolumeTodayLb)) lb"
                guard let rpe = sessionRPE else { return "\(base) volume" }
                let rpeStr = rpe.truncatingRemainder(dividingBy: 1) == 0
                    ? "\(Int(rpe))" : String(format: "%.1f", rpe)
                return "\(base) @ RPE \(rpeStr)"
            }()
            components = [
                StrainComponent(
                    label: "Cardio load",
                    value: cardio,
                    share: cw / denom,
                    tint: LifeOSColor.Metric.steps,
                    detail: cardioDetail
                ),
                StrainComponent(
                    label: "Mechanical load",
                    value: mechanical,
                    share: mw / denom,
                    tint: LifeOSColor.Metric.strain,
                    detail: mechDetail
                ),
            ]
        }

        return Score(value: value, band: band, breakdown: breakdown, components: components)
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Per-day strain over the trailing `days`-day window ending at `asOf`,
    /// chronological. Replicates TodayView's `strain(for:)`: each day's lift
    /// volume + volume-weighted set RPE (decoded from `detailsJSON`), the
    /// 7-day rolling max-day volume as the mechanical reference, and that
    /// day's DailyEntry cardio signals. Days with no inputs surface as 0 so
    /// the line reads as a continuous load history. `@MainActor` because
    /// `CSVExporter.decodeExercises` is main-actor isolated.
    @MainActor
    static func daySeries(
        sessions: [LiftSessionEntry],
        dailies: [DailyEntry],
        days: Int,
        asOf: Date
    ) -> [TrendPoint] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: asOf)
        let dailyByKey = Dictionary(dailies.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })

        var points: [TrendPoint] = []
        for offset in (0..<max(1, days)).reversed() {
            guard let dayStart = cal.date(byAdding: .day, value: -offset, to: today),
                  let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart) else { continue }
            let dayKey = ymd.string(from: dayStart)

            let daySessions = sessions.filter { $0.startedAt >= dayStart && $0.startedAt < dayEnd }
            let dayVolume = daySessions.reduce(0.0) { $0 + $1.totalVolumeLb }
            let dayRPE = volumeWeightedRPE(for: daySessions)

            // 7-day rolling window ending at this day (inclusive).
            let weekStart = cal.date(byAdding: .day, value: -7, to: dayStart) ?? dayStart
            let weekSessions = sessions.filter { $0.startedAt >= weekStart && $0.startedAt < dayEnd }
            let weekMaxDayVolume = Dictionary(grouping: weekSessions, by: \.date)
                .values
                .map { $0.reduce(0.0) { $0 + $1.totalVolumeLb } }
                .max() ?? 0

            let daily = dailyByKey[dayKey]
            let score = compute(
                liftVolumeTodayLb: dayVolume,
                liftVolumeMax7dLb: weekMaxDayVolume,
                activeEnergyKcal: daily?.activeEnergyKcal ?? 0,
                sessionRPE: dayRPE,
                steps: daily?.steps,
                distanceMeters: daily?.distanceMeters
            )
            points.append(TrendPoint(day: dayStart, value: score.value))
        }
        return points
    }

    /// Volume-weighted average set RPE across a day's sessions — heavy top
    /// sets count more than light back-offs. nil when no set carried an RPE.
    /// Mirrors TodayView.sessionRPE so daySeries matches the live number.
    @MainActor
    private static func volumeWeightedRPE(for sessions: [LiftSessionEntry]) -> Double? {
        var weightedSum = 0.0
        var totalWeight = 0.0
        for session in sessions {
            for exercise in CSVExporter.decodeExercises(session.detailsJSON) {
                for set in exercise.sets where set.rpe != nil {
                    let vol = max(1.0, set.weight * Double(set.reps))
                    weightedSum += (set.rpe ?? 0) * vol
                    totalWeight += vol
                }
            }
        }
        guard totalWeight > 0 else { return nil }
        return weightedSum / totalWeight
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
