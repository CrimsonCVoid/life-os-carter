import Foundation
import SwiftData

/// Real-data backing for the Analysis tab. Pulls from DailyEntry +
/// LiftSessionEntry and shapes the values into the same DTOs the
/// chart cards consumed when they were Sample.* placeholders, so the
/// AnalysisView surgery is one-line swaps instead of a rewrite.
///
/// When real data is sparse (fewer than 3 logged days in the window),
/// each section gracefully returns an empty array — the chart card
/// can decide whether to hide itself or show a "log more days" hint.
struct AnalysisData {
    struct DayPoint: Hashable {
        let day: Date
        let value: Double
    }
    struct ScorePoint: Hashable {
        let day: Date
        let score: Double
    }
    struct DualPoint: Hashable {
        let day: Date
        let value: Double
    }
    struct SleepStagePoint: Identifiable, Hashable {
        let id: String
        let day: Date
        let stage: String
        let minutes: Double
    }
    struct HRVSleepPoint: Identifiable, Hashable {
        let id: String
        let sleepHours: Double
        let hrv: Double
    }
    struct StepsByDow: Hashable {
        let day: String     // 3-letter weekday
        let steps: Double
    }
    struct WeightPoint: Hashable {
        let day: Date
        let weight: Double
    }

    let performanceTrend: [ScorePoint]
    let performanceAvg: Double
    let performanceLatest: Int
    let performanceDelta: Double

    let rhrTrend: [DayPoint]
    let hrvTrend: [DayPoint]
    let rhrLatest: Double?
    let hrvLatest: Double?
    let rhrDelta: Double
    let hrvDelta: Double

    let sleepStageSeries: [SleepStagePoint]
    let avgSleepTotalMin: Int
    let avgSleepDeepMin: Int
    let avgSleepREMMin: Int

    let hrvVsSleep: [HRVSleepPoint]
    let hrvSleepSlope: Double

    let workoutDays: [Date: Double]
    let workoutSessionCount: Int
    let workoutStreakDays: Int
    let workoutRestDays: Int
    let workoutTotalVolume: Double

    let stepsByDOW: [StepsByDow]
    let mostActiveDOW: String?
    let leastActiveDOW: String?

    let weightTrend: [WeightPoint]
    let weightChange: Double?

    /// Activity-energy and distance trends, plus VO₂ max samples. Each
    /// is a date-keyed daily series (only days that actually have the
    /// metric synced appear). Empty arrays => no data => empty-state card.
    let activeEnergyTrend: [DayPoint]
    let totalEnergyTrend: [DayPoint]
    let distanceTrend: [DayPoint]   // miles
    let vo2MaxTrend: [DayPoint]
    let stepsTrend: [DayPoint]

    /// Cheap zero-value snapshot used as the initial @State seed in
    /// AnalysisView before `refreshData()` populates real values.
    /// Empty arrays render as empty charts (no spinner, no crash).
    static let empty: AnalysisData = AnalysisData(
        performanceTrend: [],
        performanceAvg: 0,
        performanceLatest: 0,
        performanceDelta: 0,
        rhrTrend: [],
        hrvTrend: [],
        rhrLatest: nil,
        hrvLatest: nil,
        rhrDelta: 0,
        hrvDelta: 0,
        sleepStageSeries: [],
        avgSleepTotalMin: 0,
        avgSleepDeepMin: 0,
        avgSleepREMMin: 0,
        hrvVsSleep: [],
        hrvSleepSlope: 0,
        workoutDays: [:],
        workoutSessionCount: 0,
        workoutStreakDays: 0,
        workoutRestDays: 0,
        workoutTotalVolume: 0,
        stepsByDOW: [],
        mostActiveDOW: nil,
        leastActiveDOW: nil,
        weightTrend: [],
        weightChange: nil,
        activeEnergyTrend: [],
        totalEnergyTrend: [],
        distanceTrend: [],
        vo2MaxTrend: [],
        stepsTrend: []
    )

    /// Compute the analysis snapshot off the user's logs. `daysBack`
    /// is typically 7/30/90/365 from the AnalysisView range selector.
    static func compute(
        dailies: [DailyEntry],
        sessions: [LiftSessionEntry],
        daysBack: Int,
        today: Date = Date()
    ) -> AnalysisData {
        let cal = Calendar.current
        let todayStart = cal.startOfDay(for: today)
        let cutoff = cal.date(byAdding: .day, value: -daysBack + 1, to: todayStart) ?? todayStart
        let byDate = Dictionary(uniqueKeysWithValues: dailies.map { ($0.date, $0) })

        // Day-keyed walk back through the window for ordered series.
        var orderedDates: [Date] = []
        var cursor = todayStart
        while cursor >= cutoff {
            orderedDates.insert(cursor, at: 0)
            cursor = cal.date(byAdding: .day, value: -1, to: cursor) ?? cursor
        }

        // ---- Vitals trends
        let hrv: [DayPoint] = orderedDates.compactMap { d in
            guard let v = byDate[Self.ymd(d)]?.hrvMs else { return nil }
            return DayPoint(day: d, value: v)
        }
        let rhr: [DayPoint] = orderedDates.compactMap { d in
            guard let v = byDate[Self.ymd(d)]?.restingHr else { return nil }
            return DayPoint(day: d, value: v)
        }
        let hrvLatest = hrv.last?.value
        let rhrLatest = rhr.last?.value
        // Delta = last value vs the prior half-window average.
        let hrvDelta = delta(hrv.map(\.value))
        let rhrDelta = delta(rhr.map(\.value))

        // ---- Sleep stages
        var sleepSeries: [SleepStagePoint] = []
        var totalSleepMin = 0
        var totalDeep = 0, totalRem = 0, totalSleepDays = 0
        for d in orderedDates {
            guard let row = byDate[Self.ymd(d)] else { continue }
            let deep = row.sleepDeepMin ?? 0
            let rem = row.sleepREMMin ?? 0
            let light = row.sleepLightMin ?? 0
            let awake = row.sleepAwakeMin ?? 0
            if deep + rem + light == 0 {
                // Fall back to a single "Core" bar from sleepHours so the
                // chart isn't empty when the user lacks stage data.
                if let h = row.sleepHours, h > 0 {
                    sleepSeries.append(.init(id: "\(d)-core", day: d, stage: "Core", minutes: h * 60))
                    totalSleepMin += Int(h * 60)
                    totalSleepDays += 1
                }
                continue
            }
            sleepSeries.append(.init(id: "\(d)-deep", day: d, stage: "Deep", minutes: Double(deep)))
            sleepSeries.append(.init(id: "\(d)-core", day: d, stage: "Core", minutes: Double(light)))
            sleepSeries.append(.init(id: "\(d)-rem",  day: d, stage: "REM",  minutes: Double(rem)))
            sleepSeries.append(.init(id: "\(d)-aw",   day: d, stage: "Awake", minutes: Double(awake)))
            totalSleepMin += deep + rem + light
            totalDeep += deep
            totalRem += rem
            totalSleepDays += 1
        }
        let avgTotal = totalSleepDays > 0 ? totalSleepMin / totalSleepDays : 0
        let avgDeep = totalSleepDays > 0 ? totalDeep / totalSleepDays : 0
        let avgREM = totalSleepDays > 0 ? totalRem / totalSleepDays : 0

        // ---- HRV vs sleep correlation
        var corr: [HRVSleepPoint] = []
        for d in orderedDates {
            guard let row = byDate[Self.ymd(d)],
                  let h = row.sleepHours, h > 0,
                  let v = row.hrvMs, v > 0 else { continue }
            corr.append(.init(id: Self.ymd(d), sleepHours: h, hrv: v))
        }
        let slope = simpleSlope(xs: corr.map(\.sleepHours), ys: corr.map(\.hrv))

        // ---- Workout consistency
        var workoutDays: [Date: Double] = [:]
        var totalVolume = 0.0
        for s in sessions where s.startedAt >= cutoff {
            let day = cal.startOfDay(for: s.startedAt)
            workoutDays[day, default: 0] += s.totalVolumeLb
            totalVolume += s.totalVolumeLb
        }
        let sessionCount = sessions.filter { $0.startedAt >= cutoff }.count
        let streak = streakDays(workoutDays: Set(workoutDays.keys), today: todayStart, cal: cal)
        let restDays = orderedDates.filter { workoutDays[$0] == nil }.count

        // ---- Steps by day of week
        let dowSyms = cal.shortWeekdaySymbols
        var stepsByWeekday: [Int: (sum: Double, count: Int)] = [:]
        for d in orderedDates {
            guard let s = byDate[Self.ymd(d)]?.steps else { continue }
            let wd = cal.component(.weekday, from: d)
            let cur = stepsByWeekday[wd] ?? (0, 0)
            stepsByWeekday[wd] = (cur.sum + Double(s), cur.count + 1)
        }
        let dowSeries: [StepsByDow] = (1...7).map { i in
            let entry = stepsByWeekday[i] ?? (0, 0)
            let avg = entry.count > 0 ? entry.sum / Double(entry.count) : 0
            return StepsByDow(day: dowSyms[i - 1], steps: avg)
        }
        let maxDow = dowSeries.max(by: { $0.steps < $1.steps })
        let nonZero = dowSeries.filter { $0.steps > 0 }
        let minDow = nonZero.min(by: { $0.steps < $1.steps })

        // ---- Weight trend
        var weight: [WeightPoint] = []
        for d in orderedDates {
            guard let w = byDate[Self.ymd(d)]?.weightLb else { continue }
            weight.append(WeightPoint(day: d, weight: w))
        }
        let weightChange: Double? = {
            guard weight.count >= 2 else { return nil }
            return weight.last!.weight - weight.first!.weight
        }()

        // ---- Activity energy / distance / VO₂ max / steps trends
        let activeEnergy: [DayPoint] = orderedDates.compactMap { d in
            guard let v = byDate[Self.ymd(d)]?.activeEnergyKcal, v > 0 else { return nil }
            return DayPoint(day: d, value: v)
        }
        let totalEnergy: [DayPoint] = orderedDates.compactMap { d in
            guard let v = byDate[Self.ymd(d)]?.totalCaloriesKcal, v > 0 else { return nil }
            return DayPoint(day: d, value: v)
        }
        let distance: [DayPoint] = orderedDates.compactMap { d in
            guard let m = byDate[Self.ymd(d)]?.distanceMeters, m > 0 else { return nil }
            return DayPoint(day: d, value: m / 1609.344)   // → miles
        }
        let vo2: [DayPoint] = orderedDates.compactMap { d in
            guard let v = byDate[Self.ymd(d)]?.vo2Max, v > 0 else { return nil }
            return DayPoint(day: d, value: v)
        }
        let stepsSeries: [DayPoint] = orderedDates.compactMap { d in
            guard let s = byDate[Self.ymd(d)]?.steps, s > 0 else { return nil }
            return DayPoint(day: d, value: Double(s))
        }

        // ---- Performance composite (HRV pct of baseline + sleep pct
        // of goal + activity vs steps goal). Sample-grade for now
        // until we have real per-day scoring.
        var perf: [ScorePoint] = []
        for d in orderedDates {
            guard let row = byDate[Self.ymd(d)] else { continue }
            let parts: [Double] = [
                row.sleepHours.map { min(1.1, $0 / 8.0) * 100 } ?? 50,
                row.moodScore.map { Double($0) / 10.0 * 100 } ?? 50,
                row.energyScore.map { Double($0) / 10.0 * 100 } ?? 50,
            ]
            let s = parts.reduce(0, +) / Double(parts.count)
            perf.append(ScorePoint(day: d, score: s))
        }
        let perfAvg = perf.isEmpty ? 0 : perf.map(\.score).reduce(0, +) / Double(perf.count)
        let perfLatest = Int((perf.last?.score ?? perfAvg).rounded())
        let perfDelta = delta(perf.map(\.score))

        return AnalysisData(
            performanceTrend: perf,
            performanceAvg: perfAvg,
            performanceLatest: perfLatest,
            performanceDelta: perfDelta,
            rhrTrend: rhr,
            hrvTrend: hrv,
            rhrLatest: rhrLatest,
            hrvLatest: hrvLatest,
            rhrDelta: rhrDelta,
            hrvDelta: hrvDelta,
            sleepStageSeries: sleepSeries,
            avgSleepTotalMin: avgTotal,
            avgSleepDeepMin: avgDeep,
            avgSleepREMMin: avgREM,
            hrvVsSleep: corr,
            hrvSleepSlope: slope,
            workoutDays: workoutDays,
            workoutSessionCount: sessionCount,
            workoutStreakDays: streak,
            workoutRestDays: restDays,
            workoutTotalVolume: totalVolume,
            stepsByDOW: dowSeries,
            mostActiveDOW: maxDow?.steps == 0 ? nil : maxDow?.day,
            leastActiveDOW: minDow?.day,
            weightTrend: weight,
            weightChange: weightChange,
            activeEnergyTrend: activeEnergy,
            totalEnergyTrend: totalEnergy,
            distanceTrend: distance,
            vo2MaxTrend: vo2,
            stepsTrend: stepsSeries
        )
    }

    // MARK: - Stats helpers

    private static func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d)
    }

    /// Last value minus the average of the prior values. Returns 0 if
    /// fewer than 2 points (no meaningful delta).
    private static func delta(_ values: [Double]) -> Double {
        guard values.count >= 2 else { return 0 }
        let last = values.last!
        let prior = values.dropLast()
        let avg = prior.reduce(0, +) / Double(prior.count)
        return last - avg
    }

    /// Simple linear-regression slope of y over x. Returns 0 when
    /// there's not enough variance.
    private static func simpleSlope(xs: [Double], ys: [Double]) -> Double {
        guard xs.count == ys.count, xs.count >= 3 else { return 0 }
        let n = Double(xs.count)
        let meanX = xs.reduce(0, +) / n
        let meanY = ys.reduce(0, +) / n
        var num = 0.0, den = 0.0
        for i in 0..<xs.count {
            let dx = xs[i] - meanX
            num += dx * (ys[i] - meanY)
            den += dx * dx
        }
        return den == 0 ? 0 : num / den
    }

    /// Consecutive trained days walking back from today. Stops on the
    /// first rest day.
    private static func streakDays(workoutDays: Set<Date>, today: Date, cal: Calendar) -> Int {
        var count = 0
        var cursor = today
        var safety = 0
        while safety < 365 {
            safety += 1
            if workoutDays.contains(cursor) {
                count += 1
            } else {
                break
            }
            guard let prev = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return count
    }
}
