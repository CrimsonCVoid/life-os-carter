import Foundation
import SwiftUI

/// Forward-looking recovery analytics. Everything here is a PROJECTION: a
/// defensible extrapolation of already-computed signals (the lagged strain
/// damper RecoveryEngine applies, least-squares HRV/RHR trends, multi-night
/// sleep debt), wrapped in an honest uncertainty band and a capped horizon.
/// Small-N honest: each surface returns nil below its minimum sample rather
/// than fabricating a line.
///
/// @MainActor because it leans on StrainCalculator.daySeries + RecoveryEngine
/// per day, exactly like StrainRecoveryEngine. No new models, no schema, no
/// network — derives entirely from existing data.
struct ReadinessForecast {
    let tomorrow: ReadinessProjection?
    let hrvTrajectory: Trajectory?
    let rhrTrajectory: Trajectory?
    let sleepDebt: DebtProjection?
    /// Chronological readiness calendar: past actual recovery + future forecast.
    let calendar: [CalendarCell]
    let findings: [Finding]

    struct ReadinessProjection {
        let pointEstimate: Double      // 0...100 band midpoint (not a promise)
        let low: Double
        let high: Double
        let band: RecoveryResult.Band
        let confidence: Confidence
        let drivers: [ForecastDriver]
        let todayStrain: Double
        let recentMean: Double
    }

    struct ForecastDriver: Identifiable {
        let id = UUID()
        let label: String
        let detail: String
        let delta: Double          // signed recovery points vs recentMean
        let tint: Color
    }

    enum Confidence {
        case low, medium, high
        var label: String {
            switch self {
            case .low: return "Low confidence"
            case .medium: return "Moderate confidence"
            case .high: return "High confidence"
            }
        }
        var widthScale: Double {
            switch self { case .low: return 1.6; case .medium: return 1.0; case .high: return 0.7 }
        }
    }

    struct Trajectory {
        let history: [TrendPoint]
        let projection: [TrendPoint]
        let projLow: [TrendPoint]
        let projHigh: [TrendPoint]
        let slopePerDay: Double
        let r2: Double
        let horizonDays: Int
        let unit: String
        let higherIsBetter: Bool
        let projectedEndValue: Double
    }

    struct DebtProjection {
        let currentDebtHours: Double
        let curve: [TrendPoint]
        let nightsToClear: Int?
        let projectedCurve: [TrendPoint]
        let trendingUp: Bool
    }

    struct CalendarCell: Identifiable {
        let id: Date
        let day: Date
        let isForecast: Bool
        let value: Double?
        let bandHalfWidth: Double?
        let recommendedStrainMid: Double?
    }

    struct Finding {
        enum Kind { case decliningTrajectory, risingTrajectory, deepeningDebt, lowReadinessAhead }
        let kind: Kind
        let score: Double
        let confident: Bool
    }

    static let empty = ReadinessForecast(
        tomorrow: nil, hrvTrajectory: nil, rhrTrajectory: nil,
        sleepDebt: nil, calendar: [], findings: []
    )
}

@MainActor
enum ReadinessForecastEngine {

    static func compute(
        dailies: [DailyEntry],
        sessions: [LiftSessionEntry],
        settings: UserSettings,
        asOf: Date = Date(),
        calendarPastDays: Int = 7,
        calendarForecastDays: Int = 4
    ) -> ReadinessForecast {
        compute(dailies: dailies, sessions: sessions, sleepGoalHours: settings.sleepGoalHours,
                asOf: asOf, calendarPastDays: calendarPastDays, calendarForecastDays: calendarForecastDays)
    }

    /// Overload for surfaces that don't hold a full UserSettings (the recovery
    /// sheet). Math is identical; only the sleep goal is needed.
    static func compute(
        dailies: [DailyEntry],
        sessions: [LiftSessionEntry],
        sleepGoalHours: Double,
        asOf: Date = Date(),
        calendarPastDays: Int = 7,
        calendarForecastDays: Int = 4
    ) -> ReadinessForecast {
        let sorted = dailies.sorted { $0.date < $1.date }
        guard !sorted.isEmpty else { return .empty }

        let recHistory = recoveryHistory(sorted, sessions: sessions, goal: sleepGoalHours, asOf: asOf)
        let tomorrow = projectTomorrow(recHistory, sorted: sorted, goal: sleepGoalHours)
        let hrvTraj = trajectory(sorted, pick: { $0.hrvMs }, unit: "ms", higherIsBetter: true)
        let rhrTraj = trajectory(sorted, pick: { $0.restingHr }, unit: "bpm", higherIsBetter: false)
        let debt = debtProjection(sorted, goalHours: sleepGoalHours, asOf: asOf)
        let calendar = buildCalendar(recHistory, tomorrow: tomorrow, asOf: asOf,
                                     pastDays: calendarPastDays, forecastDays: calendarForecastDays)
        let findings = buildFindings(tomorrow: tomorrow, hrvTraj: hrvTraj, rhrTraj: rhrTraj, debt: debt)

        return ReadinessForecast(
            tomorrow: tomorrow, hrvTrajectory: hrvTraj, rhrTrajectory: rhrTraj,
            sleepDebt: debt, calendar: calendar, findings: findings
        )
    }

    // MARK: - Recovery + strain history (shared substrate)

    private static func recoveryHistory(
        _ sorted: [DailyEntry], sessions: [LiftSessionEntry], goal: Double, asOf: Date
    ) -> [(day: Date, recovery: Double?, strain: Double)] {
        let strainPoints = StrainCalculator.daySeries(sessions: sessions, dailies: sorted, days: 35, asOf: asOf)
        let byKey = Dictionary(sorted.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        var out: [(Date, Double?, Double)] = []
        for (i, sp) in strainPoints.enumerated() {
            let key = ymd.string(from: sp.day)
            guard let today = byKey[key] else { out.append((sp.day, nil, sp.value)); continue }
            let history = sorted.filter { $0.date < key }.sorted { $0.date > $1.date }.prefix(30)
            let prior: Double? = i > 0 ? strainPoints[i - 1].value : nil
            let rec = RecoveryEngine.compute(today: today, history: Array(history),
                                             priorStrain: prior, sleepGoalHours: goal)
            out.append((sp.day, rec.map { Double($0.score) }, sp.value))
        }
        return out
    }

    // MARK: - Tomorrow's readiness band

    private static func projectTomorrow(
        _ recHistory: [(day: Date, recovery: Double?, strain: Double)],
        sorted: [DailyEntry], goal: Double
    ) -> ReadinessForecast.ReadinessProjection? {
        let scored = recHistory.compactMap { $0.recovery }
        guard scored.count >= 5 else { return nil }
        let recentScored = Array(scored.suffix(10))
        let recentMean = mean(recentScored)
        let recentStrainMean = mean(Array(recHistory.map(\.strain).suffix(14)))
        let todayStrain = recHistory.last?.strain ?? 0

        // (a) Strain damper — same shape RecoveryEngine applies.
        let strainQ = 1 - (todayStrain / 21) * 0.75
        let neutralStrainQ = 1 - (recentStrainMean / 21) * 0.75
        let strainDelta = (strainQ - neutralStrainQ) * 0.10 * 100

        // (b)(c) HRV / RHR trajectory tilts.
        let (hrvSlope, hrvR2, hrvMeanV) = slopeFit(sorted, pick: { $0.hrvMs })
        let (rhrSlope, rhrR2, rhrMeanV) = slopeFit(sorted, pick: { $0.restingHr })
        let hrvTilt = hrvMeanV > 0
            ? ((hrvSlope / hrvMeanV) * 100 * hrvR2 * 0.9).clamped(to: -6...6) : 0
        let rhrTilt = rhrMeanV > 0
            ? (-(rhrSlope / rhrMeanV) * 100 * rhrR2 * 0.8).clamped(to: -5...5) : 0

        // (d) Sleep-debt pressure (half applied — tonight's sleep is unknown).
        let currentDebt = standingDebt(sorted, goal: goal)
        let debtPressure = -min(currentDebt, 6) / 6 * 8
        let debtDelta = debtPressure * 0.5

        let point = (recentMean + strainDelta + hrvTilt + rhrTilt + debtDelta).clamped(to: 0...100)

        // Confidence.
        let sampleConf = min(Double(scored.count) / 14, 1)
        let fitConf = max(hrvR2, max(rhrR2, 0))
        let inputConf = inputCompleteness(sorted)
        let confScore = 0.45 * sampleConf + 0.30 * fitConf + 0.25 * inputConf
        let confidence: ReadinessForecast.Confidence = confScore >= 0.66 ? .high : (confScore >= 0.4 ? .medium : .low)

        // Band width = personal recovery volatility, floored.
        let recoverySD = sd(Array(scored.suffix(14)))
        let baseHalf = max(6, recoverySD)
        let debtUpside = min(currentDebt, 6) / 6 * 4
        let half = min(22, baseHalf * confidence.widthScale + debtUpside)
        let low = (point - half).clamped(to: 0...100)
        let high = (point + half).clamped(to: 0...100)

        // Drivers.
        var drivers: [ReadinessForecast.ForecastDriver] = []
        drivers.append(.init(label: "Today's load",
                             detail: todayStrain < 1 ? "rest so far" : String(format: "%.1f strain", todayStrain),
                             delta: strainDelta, tint: LifeOSColor.Metric.strain))
        if abs(hrvTilt) >= 0.5 {
            drivers.append(.init(label: "HRV trend", detail: hrvTilt >= 0 ? "rising" : "falling",
                                 delta: hrvTilt, tint: LifeOSColor.Metric.hrv))
        }
        if abs(rhrTilt) >= 0.5 {
            drivers.append(.init(label: "Resting HR trend", detail: rhrTilt >= 0 ? "improving" : "elevating",
                                 delta: rhrTilt, tint: LifeOSColor.Metric.rhr))
        }
        if currentDebt >= 0.5 {
            drivers.append(.init(label: "Sleep debt", detail: String(format: "%.1fh standing", currentDebt),
                                 delta: debtDelta, tint: LifeOSColor.Metric.sleep))
        }
        drivers.sort { abs($0.delta) > abs($1.delta) }

        return .init(pointEstimate: point, low: low, high: high, band: band(for: Int(point.rounded())),
                     confidence: confidence, drivers: drivers,
                     todayStrain: todayStrain, recentMean: recentMean)
    }

    // MARK: - Trajectory

    private static func trajectory(
        _ sorted: [DailyEntry], pick: (DailyEntry) -> Double?, unit: String, higherIsBetter: Bool
    ) -> ReadinessForecast.Trajectory? {
        let window = Array(sorted.suffix(21))
        let pts: [(x: Double, y: Double, day: Date)] = window.enumerated().compactMap { i, d in
            guard let v = pick(d), let day = ymd.date(from: d.date) else { return nil }
            return (Double(i), v, day)
        }
        guard pts.count >= 7 else { return nil }
        guard let (slope, intercept) = leastSquares(pts.map { ($0.x, $0.y) }) else { return nil }
        let r2 = rSquared(pts.map { ($0.x, $0.y) })
        let yMean = mean(pts.map(\.y))
        let resid = residualSD(pts.map { ($0.x, $0.y) }, slope: slope, intercept: intercept)

        let earned = Int((Double(pts.count) / 3.0).rounded(.down))
        let horizon = max(2, min(7, Int((Double(earned) * (0.4 + 0.6 * r2)).rounded())))

        let lastX = pts.last!.x, lastDay = pts.last!.day
        let cal = Calendar.current
        var proj: [TrendPoint] = [], lo: [TrendPoint] = [], hi: [TrendPoint] = []
        for k in 0...horizon {
            let x = lastX + Double(k)
            guard let day = cal.date(byAdding: .day, value: k, to: lastDay) else { continue }
            let yhat = slope * x + intercept
            let cone = (resid + yMean * 0.01) * (0.6 + 0.5 * Double(k).squareRoot()) / max(0.35, r2)
            proj.append(TrendPoint(day: day, value: yhat))
            lo.append(TrendPoint(day: day, value: yhat - cone))
            hi.append(TrendPoint(day: day, value: yhat + cone))
        }
        return .init(history: pts.map { TrendPoint(day: $0.day, value: $0.y) },
                     projection: proj, projLow: lo, projHigh: hi,
                     slopePerDay: slope, r2: r2, horizonDays: horizon,
                     unit: unit, higherIsBetter: higherIsBetter,
                     projectedEndValue: proj.last?.value ?? yMean)
    }

    // MARK: - Sleep-debt projection

    private static func debtProjection(
        _ sorted: [DailyEntry], goalHours goal: Double, asOf: Date
    ) -> ReadinessForecast.DebtProjection? {
        guard goal > 0 else { return nil }
        let nights = sorted.compactMap { d -> (Date, Double)? in
            guard let h = d.sleepHours, let day = ymd.date(from: d.date) else { return nil }
            return (day, h)
        }
        guard nights.count >= 4 else { return nil }

        // Observed cumulative ledger: accumulate shortfall, pay down on surplus.
        var debt = 0.0
        var curve: [TrendPoint] = []
        for (day, h) in nights {
            if h < goal { debt += (goal - h) } else { debt = max(0, debt - (h - goal)) }
            curve.append(TrendPoint(day: day, value: debt))
        }
        let currentDebt = debt

        // Trend over last 3 vs the 3 before (accumulating?).
        let recent3 = Array(curve.suffix(3)).map(\.value)
        let prev3 = Array(curve.dropLast(3).suffix(3)).map(\.value)
        let trendingUp = !recent3.isEmpty && !prev3.isEmpty && mean(recent3) > mean(prev3)

        let nightsToClear = currentDebt < 0.5 ? nil : Int(ceil(currentDebt / 1.0))
        var projected: [TrendPoint] = []
        if let n = nightsToClear, let last = curve.last {
            let cal = Calendar.current
            var remaining = currentDebt
            for k in 1...min(n, 10) {
                guard let day = cal.date(byAdding: .day, value: k, to: last.day) else { continue }
                remaining = max(0, remaining - 1.0)
                projected.append(TrendPoint(day: day, value: remaining))
            }
        }
        return .init(currentDebtHours: currentDebt, curve: Array(curve.suffix(21)),
                     nightsToClear: nightsToClear, projectedCurve: projected, trendingUp: trendingUp)
    }

    // MARK: - Calendar

    private static func buildCalendar(
        _ recHistory: [(day: Date, recovery: Double?, strain: Double)],
        tomorrow: ReadinessForecast.ReadinessProjection?, asOf: Date,
        pastDays: Int, forecastDays: Int
    ) -> [ReadinessForecast.CalendarCell] {
        var cells: [ReadinessForecast.CalendarCell] = []
        for entry in recHistory.suffix(pastDays) {
            let mid = entry.recovery.map { recommendedStrainMid(forRecovery: Int($0.rounded())) }
            cells.append(.init(id: entry.day, day: entry.day, isForecast: false,
                               value: entry.recovery, bandHalfWidth: nil, recommendedStrainMid: mid))
        }
        guard let t = tomorrow else { return cells }
        let cal = Calendar.current
        let today = cal.startOfDay(for: asOf)
        let baseHalf = max(6, (t.high - t.low) / 2)
        for k in 1...forecastDays {
            guard let day = cal.date(byAdding: .day, value: k, to: today) else { continue }
            let value: Double
            if k == 1 {
                value = t.pointEstimate
            } else {
                value = t.recentMean + (t.pointEstimate - t.recentMean) * pow(0.5, Double(k - 1))
            }
            let half = min(25, baseHalf * (1 + 0.35 * Double(k - 1)))
            cells.append(.init(id: day, day: day, isForecast: true, value: value,
                               bandHalfWidth: half,
                               recommendedStrainMid: recommendedStrainMid(forRecovery: Int(value.rounded()))))
        }
        return cells
    }

    // MARK: - Findings

    private static func buildFindings(
        tomorrow: ReadinessForecast.ReadinessProjection?,
        hrvTraj: ReadinessForecast.Trajectory?, rhrTraj: ReadinessForecast.Trajectory?,
        debt: ReadinessForecast.DebtProjection?
    ) -> [ReadinessForecast.Finding] {
        var out: [ReadinessForecast.Finding] = []

        func relChange(_ t: ReadinessForecast.Trajectory) -> Double {
            let base = mean(t.history.map(\.value))
            guard base != 0 else { return 0 }
            return (t.slopePerDay * Double(max(1, t.history.count - 1))) / abs(base)
        }
        // Declining: HRV down ≥8% or RHR up ≥5%, r2≥0.3.
        if let h = hrvTraj, h.r2 >= 0.3, relChange(h) <= -0.08 {
            out.append(.init(kind: .decliningTrajectory,
                             score: (0.4 + 0.6 * min(abs(relChange(h)) / 0.3, 1)) * (0.5 + 0.5 * h.r2) * 82,
                             confident: h.r2 >= 0.4 && h.history.count >= 10))
        } else if let r = rhrTraj, r.r2 >= 0.3, relChange(r) >= 0.05 {
            out.append(.init(kind: .decliningTrajectory,
                             score: (0.4 + 0.6 * min(abs(relChange(r)) / 0.3, 1)) * (0.5 + 0.5 * r.r2) * 82,
                             confident: r.r2 >= 0.4 && r.history.count >= 10))
        } else if let h = hrvTraj, h.r2 >= 0.3, relChange(h) >= 0.08 {
            out.append(.init(kind: .risingTrajectory,
                             score: (0.4 + 0.6 * min(relChange(h) / 0.3, 1)) * (0.5 + 0.5 * h.r2) * 82,
                             confident: h.r2 >= 0.4 && h.history.count >= 10))
        }
        if let d = debt, d.trendingUp, d.currentDebtHours >= 2 {
            out.append(.init(kind: .deepeningDebt,
                             score: (0.4 + 0.5 * min(d.currentDebtHours / 6, 1)) * 78,
                             confident: d.curve.count >= 6))
        }
        if let t = tomorrow, t.pointEstimate < 34 {
            out.append(.init(kind: .lowReadinessAhead, score: 70, confident: t.confidence != .low))
        }
        return out
    }

    // MARK: - Helpers

    private static func slopeFit(_ sorted: [DailyEntry], pick: (DailyEntry) -> Double?) -> (slope: Double, r2: Double, mean: Double) {
        let pts: [(x: Double, y: Double)] = Array(sorted.suffix(21)).enumerated().compactMap { i, d in
            pick(d).map { (Double(i), $0) }
        }
        guard pts.count >= 7, let (slope, _) = leastSquares(pts) else { return (0, 0, 0) }
        return (slope, rSquared(pts), mean(pts.map(\.y)))
    }

    private static func standingDebt(_ sorted: [DailyEntry], goal: Double) -> Double {
        guard goal > 0 else { return 0 }
        let nights = sorted.suffix(7).compactMap { $0.sleepHours }
        return nights.reduce(0) { $0 + max(0, goal - $1) }
    }

    private static func inputCompleteness(_ sorted: [DailyEntry]) -> Double {
        let last3 = Array(sorted.suffix(3))
        guard !last3.isEmpty else { return 0 }
        var present = 0
        for d in last3 {
            if d.hrvMs != nil { present += 1 }
            if d.restingHr != nil { present += 1 }
            if d.sleepHours != nil { present += 1 }
        }
        return Double(present) / Double(last3.count * 3)
    }

    /// Recommended-strain band midpoint for a recovery score — mirrors
    /// RecoveryEngine.recommendedStrain(for:) (which is private).
    private static func recommendedStrainMid(forRecovery score: Int) -> Double {
        switch score {
        case ..<34:   return 4      // 0...8
        case 34..<50: return 8.5    // 6...11
        case 50..<67: return 11.5   // 9...14
        case 67..<85: return 14.5   // 12...17
        default:      return 18     // 15...21
        }
    }

    private static func band(for value: Int) -> RecoveryResult.Band {
        switch value { case ..<34: return .low; case 34..<67: return .medium; default: return .high }
    }

    private static func mean(_ xs: [Double]) -> Double {
        guard !xs.isEmpty else { return 0 }
        return xs.reduce(0, +) / Double(xs.count)
    }
    private static func sd(_ xs: [Double]) -> Double {
        guard xs.count > 1 else { return 0 }
        let m = mean(xs)
        return (xs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(xs.count - 1)).squareRoot()
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
    private static func rSquared(_ pts: [(x: Double, y: Double)]) -> Double {
        guard let (s, b) = leastSquares(pts) else { return 0 }
        let my = mean(pts.map(\.y))
        let ssTot = pts.reduce(0) { $0 + ($1.y - my) * ($1.y - my) }
        guard ssTot > 0 else { return 0 }
        let ssRes = pts.reduce(0) { acc, p in let e = p.y - (s * p.x + b); return acc + e * e }
        return max(0, 1 - ssRes / ssTot)
    }
    private static func residualSD(_ pts: [(x: Double, y: Double)], slope: Double, intercept: Double) -> Double {
        guard pts.count > 2 else { return 0 }
        let ss = pts.reduce(0.0) { acc, p in let e = p.y - (slope * p.x + intercept); return acc + e * e }
        return (ss / Double(pts.count - 2)).squareRoot()
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
}

private extension Comparable {
    func clamped(to r: ClosedRange<Self>) -> Self { min(max(self, r.lowerBound), r.upperBound) }
}
