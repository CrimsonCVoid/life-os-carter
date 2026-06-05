import Foundation
import SwiftUI

/// On-device body-composition trajectory off DailyEntry weigh-ins. Pure
/// function of its inputs; every derived field is nil below its sample gate so
/// the UI renders an honest partial picture rather than a fabricated trend.
struct BodyCompositionResult {
    let trajectory: [BodyPoint]
    let latestRawLb: Double?
    let latestEmaLb: Double?
    let weighInCount: Int
    let rateLbPerWeek: Double?
    let goal: GoalProjection?
    let bodyFatTrend: [BodyPoint]
    let latestBodyFatPct: Double?
    let bodyFatRatePctPerMonth: Double?
    let leanMassTrend: [BodyPoint]
    let latestLeanMassLb: Double?
    let bmi: Double?
    let bmiCategory: BMICategory?
    let takeaway: String

    struct BodyPoint: Identifiable, Hashable {
        let id: Date
        let day: Date
        let raw: Double
        let ema: Double
        init(day: Date, raw: Double, ema: Double) { id = day; self.day = day; self.raw = raw; self.ema = ema }
    }

    struct GoalProjection {
        let goalLb: Double
        let remainingLb: Double
        let etaDate: Date?
        let weeksToGoal: Double?
        let onPace: Bool
        let progressFraction: Double
    }

    enum BMICategory: String {
        case under = "Underweight", healthy = "Healthy", over = "Overweight", obese = "Obese"
        var tint: Color {
            switch self {
            case .healthy: return LifeOSColor.success
            case .under, .over: return LifeOSColor.warning
            case .obese: return LifeOSColor.danger
            }
        }
    }

    static let empty = BodyCompositionResult(
        trajectory: [], latestRawLb: nil, latestEmaLb: nil, weighInCount: 0,
        rateLbPerWeek: nil, goal: nil,
        bodyFatTrend: [], latestBodyFatPct: nil, bodyFatRatePctPerMonth: nil,
        leanMassTrend: [], latestLeanMassLb: nil,
        bmi: nil, bmiCategory: nil, takeaway: "Log a few weigh-ins to see your trajectory.")
}

enum BodyCompositionEngine {

    /// EMA α = 0.25 (≈ Hacker's Diet "trend weight"): a ~4-day half-life that
    /// strips daily water/glycogen swings while still bending within a week.
    private static let emaAlpha = 0.25

    static func compute(
        dailies: [DailyEntry],
        goalWeightLb: Double?,
        heightCm: Int?,
        bodyFatSeries: [(day: Date, pct: Double)] = [],
        leanMassSeries: [(day: Date, lb: Double)] = [],
        rateWindowDays: Int = 28,
        asOf: Date = Date()
    ) -> BodyCompositionResult {
        let cal = Calendar.current
        let weighIns: [(day: Date, lb: Double)] = dailies
            .compactMap { d -> (Date, Double)? in
                guard let w = d.weightLb, let dt = ymd.date(from: d.date) else { return nil }
                return (cal.startOfDay(for: dt), w)
            }
            .sorted { $0.0 < $1.0 }
        guard weighIns.count >= 2 else { return .empty }

        var ema = weighIns[0].lb
        var traj: [BodyCompositionResult.BodyPoint] = []
        for (i, w) in weighIns.enumerated() {
            ema = i == 0 ? w.lb : emaAlpha * w.lb + (1 - emaAlpha) * ema
            traj.append(.init(day: w.day, raw: w.lb, ema: ema))
        }
        let latestRaw = weighIns.last!.lb
        let latestEma = ema

        let cutoff = cal.date(byAdding: .day, value: -rateWindowDays, to: cal.startOfDay(for: asOf)) ?? .distantPast
        let windowPts = traj.filter { $0.day >= cutoff }
        let rate: Double? = {
            guard windowPts.count >= 4, let first = windowPts.first, let last = windowPts.last,
                  (cal.dateComponents([.day], from: first.day, to: last.day).day ?? 0) >= 10 else { return nil }
            let pts = windowPts.map { (x: $0.day.timeIntervalSince(first.day) / 86400, y: $0.ema) }
            guard let slope = leastSquaresSlope(pts) else { return nil }
            return slope * 7
        }()

        let goal: BodyCompositionResult.GoalProjection? = {
            guard let g = goalWeightLb, let r = rate else { return nil }
            let remaining = latestEma - g
            let heading = (remaining > 0 && r < 0) || (remaining < 0 && r > 0)
            let onPace = abs(r) >= 0.2 && heading
            let weeks: Double? = (onPace && r != 0) ? abs(remaining / r) : nil
            let eta = weeks.flatMap { cal.date(byAdding: .day, value: Int(($0 * 7).rounded()), to: asOf) }
            let startEma = traj.first!.ema
            let totalNeeded = abs(startEma - g)
            let covered = abs(startEma - latestEma)
            let frac = totalNeeded > 0 ? min(1, covered / totalNeeded) : (abs(remaining) < 0.5 ? 1 : 0)
            return .init(goalLb: g, remainingLb: remaining, etaDate: eta,
                         weeksToGoal: weeks, onPace: onPace, progressFraction: frac)
        }()

        let bfTraj = emaTrajectory(bodyFatSeries.map { ($0.day, $0.pct) })
        let bfRate = monthlyRate(bfTraj, cal: cal)
        let lmTraj = emaTrajectory(leanMassSeries.map { ($0.day, $0.lb) })

        let bmi: Double? = {
            guard let h = heightCm, h > 0 else { return nil }
            let kg = latestEma * 0.45359237
            let m = Double(h) / 100
            return kg / (m * m)
        }()
        let bmiCat = bmi.map(category(forBMI:))

        return BodyCompositionResult(
            trajectory: traj, latestRawLb: latestRaw, latestEmaLb: latestEma, weighInCount: weighIns.count,
            rateLbPerWeek: rate, goal: goal,
            bodyFatTrend: bfTraj, latestBodyFatPct: bfTraj.last?.ema, bodyFatRatePctPerMonth: bfRate,
            leanMassTrend: lmTraj, latestLeanMassLb: lmTraj.last?.ema,
            bmi: bmi, bmiCategory: bmiCat,
            takeaway: takeaway(rate: rate, goal: goal, bmiCat: bmiCat))
    }

    private static func emaTrajectory(_ series: [(Date, Double)]) -> [BodyCompositionResult.BodyPoint] {
        let s = series.sorted { $0.0 < $1.0 }
        guard s.count >= 2 else { return [] }
        var ema = s[0].1; var out: [BodyCompositionResult.BodyPoint] = []
        for (i, p) in s.enumerated() {
            ema = i == 0 ? p.1 : emaAlpha * p.1 + (1 - emaAlpha) * ema
            out.append(.init(day: p.0, raw: p.1, ema: ema))
        }
        return out
    }
    private static func monthlyRate(_ traj: [BodyCompositionResult.BodyPoint], cal: Calendar) -> Double? {
        guard traj.count >= 3, let f = traj.first, let l = traj.last,
              (cal.dateComponents([.day], from: f.day, to: l.day).day ?? 0) >= 14 else { return nil }
        let pts = traj.map { (x: $0.day.timeIntervalSince(f.day) / 86400, y: $0.ema) }
        guard let slope = leastSquaresSlope(pts) else { return nil }
        return slope * 30
    }
    private static func leastSquaresSlope(_ pts: [(x: Double, y: Double)]) -> Double? {
        let n = Double(pts.count); guard n >= 2 else { return nil }
        let sx = pts.reduce(0) { $0 + $1.x }, sy = pts.reduce(0) { $0 + $1.y }
        let sxx = pts.reduce(0) { $0 + $1.x * $1.x }, sxy = pts.reduce(0) { $0 + $1.x * $1.y }
        let d = n * sxx - sx * sx; guard d != 0 else { return nil }
        return (n * sxy - sx * sy) / d
    }
    private static func category(forBMI b: Double) -> BodyCompositionResult.BMICategory {
        switch b { case ..<18.5: return .under; case 18.5..<25: return .healthy; case 25..<30: return .over; default: return .obese }
    }
    private static func takeaway(rate: Double?, goal: BodyCompositionResult.GoalProjection?,
                                 bmiCat: BodyCompositionResult.BMICategory?) -> String {
        if let g = goal, g.onPace, let eta = g.etaDate {
            let dir = g.remainingLb > 0 ? "Down" : "Up"
            return "\(dir) \(String(format: "%.1f", abs(rate ?? 0))) lb/wk — on pace, ETA \(short(eta))."
        }
        if let g = goal, !g.onPace {
            return "Your trend isn't moving toward your goal yet — \(String(format: "%.0f", abs(g.remainingLb))) lb to go."
        }
        if let r = rate, abs(r) >= 0.2 {
            return r < 0 ? "Trending down \(String(format: "%.1f", -r)) lb/wk." : "Trending up \(String(format: "%.1f", r)) lb/wk."
        }
        if let c = bmiCat { return "Weight holding steady — BMI in the \(c.rawValue.lowercased()) range." }
        return "Weight holding steady."
    }
    private static func short(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "MMM d"; return f.string(from: d) }
    private static let ymd: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f }()
}
