import Foundation
import SwiftUI

/// Day-aligned strain ↔ recovery analytics. Recovery answers "how prepared am
/// I"; strain answers "how hard did I go". This engine quantifies the
/// relationship between the two over a trailing window:
///   - the one-day-lag cost: does a hard day depress tomorrow's recovery, and
///     by how much for THIS user (the HRV-guided-training rebound effect),
///   - acute:chronic workload ratio (Gabbett) — is recent load spiking,
///   - training monotony / Foster strain — is the week too samey,
///   - same-day alignment quadrants — pushing when primed vs grinding when red,
///   - adherence to the morning recommended-strain band.
///
/// Design discipline, same as `InsightsEngine` / `RecoveryEngine`:
///   - Pure function of its inputs; the only "now" is the `asOf` passed in.
///   - Small-N honest: every derived stat has a minimum sample below which it
///     stays nil rather than fabricating a flat ACWR of 1.0 or a neutral
///     alignment. `compute` returns a `.empty` balance for a thin history.
///   - Builds off the SAME machinery the live UI uses — `StrainCalculator`
///     `.daySeries` for strain, `RecoveryEngine.compute` per day for recovery —
///     so the analytics never drift from the numbers shown elsewhere.
///
/// `@MainActor` because `StrainCalculator.daySeries` is main-actor isolated
/// (it decodes lift JSON via `CSVExporter`). Cheap at these data sizes; called
/// synchronously from the Insights / Analysis recompute on the main actor.

/// A trailing-window strain↔recovery snapshot. Every numeric field is optional
/// (present only when its minimum sample was met) so the UI renders an honest
/// partial picture. Top-level (not nested) so views can name it directly.
struct StrainRecoveryBalance {
    /// Chronological, one entry per calendar day in the display window
    /// (oldest → newest). Days with no logged activity still appear (strain 0);
    /// days with no overnight sleep have `recovery == nil` so charts gap.
    let series: [DayPoint]
    /// Days in `series` carrying BOTH a strain value and a recovery score.
    /// Drives every chart's empty state (the charts need scored days).
    let pairedDayCount: Int

    // --- Acute / chronic load (ACWR) ---
    let acwr: Double?
    let acwrBand: ACWRBand
    let acuteLoad: Double?      // mean strain, last 7d
    let chronicLoad: Double?    // mean strain, last 28d

    // --- Monotony / Foster strain ---
    let monotony: Double?       // mean daily strain / SD over last 7d (rest = 0)
    let weeklyLoad: Double?      // sum of strain, last 7d
    let fosterStrain: Double?    // weeklyLoad × monotony

    // --- Alignment / quadrants ---
    /// 0…1: how closely daily strain tracked the morning recommended-strain
    /// midpoint (1 = trained right on the recommendation). nil until ≥7 pairs.
    let alignmentScore: Double?
    let quadrantCounts: [Quadrant: Int]
    /// The dominant OFF-diagonal quadrant when one holds ≥30% of scored days —
    /// drives the alignment insight's framing. nil → generic positive copy.
    let dominantOffDiagonal: Quadrant?

    // --- Today snapshot (for the card glyph) ---
    let todayQuadrant: Quadrant?
    let todayRecovery: Int?
    let todayStrain: Double?
    let recommendedStrainToday: ClosedRange<Double>?

    // --- Lagged strain (day N) → recovery (day N+1) ---
    let lag: LagFinding?
    let laggedPairCount: Int

    // --- Recommended-strain adherence ---
    let adherencePct: Double?
    let adherenceSampleDays: Int

    /// Pre-scored findings the `InsightsEngine` emitters consume — only those
    /// that cleared their sample gate appear here.
    let findings: [Finding]

    /// One aligned day on the strain↔recovery timeline.
    struct DayPoint: Identifiable, Hashable {
        let id: Date
        let day: Date           // startOfDay, local tz
        let strain: Double      // 0...21 (0 when nothing logged)
        let recovery: Int?      // 0...100, nil when unscored that morning
        let quadrant: Quadrant? // nil when recovery == nil
    }

    /// Which corner of the recovery×strain plane a day falls in. Thresholds
    /// match `RecoveryEngine.band` (high ≥67 / low <34) and `StrainCalculator`
    /// bands (high ≥14 / low <9); mid days collapse to `.balanced`.
    enum Quadrant: String {
        case primedAndPushed    // high recovery, high strain — capitalized
        case primedAndRested    // high recovery, low strain  — room to push
        case drainedButPushed   // low recovery,  high strain — overreaching
        case balanced           // everything mid / aligned
    }

    enum ACWRBand {
        case detraining   // < 0.8
        case sweetSpot    // 0.8 ... 1.3
        case caution      // 1.3 ... 1.5
        case danger       // > 1.5
        case unknown      // acwr == nil
    }

    struct LagFinding {
        let pctChange: Double      // signed; -0.11 = recovery 11% lower after hard days
        let deltaPoints: Double    // signed; mean recovery after high-strain − after low
        let hardDayCount: Int      // n high-strain days the comparison rests on
        let isMeaningful: Bool     // cleared the effect-size + sample floor
    }

    struct Finding {
        enum Kind { case laggedStrainRecovery, acwr, monotony, alignment, adherence }
        let kind: Kind
        let score: Double          // impact × confidence, 0...100, DataInsight scale
        let confident: Bool        // false → emitter may downgrade / skip
    }

    static let empty = StrainRecoveryBalance(
        series: [], pairedDayCount: 0,
        acwr: nil, acwrBand: .unknown, acuteLoad: nil, chronicLoad: nil,
        monotony: nil, weeklyLoad: nil, fosterStrain: nil,
        alignmentScore: nil, quadrantCounts: [:], dominantOffDiagonal: nil,
        todayQuadrant: nil, todayRecovery: nil, todayStrain: nil, recommendedStrainToday: nil,
        lag: nil, laggedPairCount: 0,
        adherencePct: nil, adherenceSampleDays: 0,
        findings: []
    )
}

@MainActor
enum StrainRecoveryEngine {

    /// Quadrant thresholds — mirror `RecoveryEngine.band` + `StrainCalculator`
    /// bands. Charts restate these constants; keep in sync.
    static let highRecovery = 67, lowRecovery = 34
    static let highStrain = 14.0, lowStrain = 9.0

    /// Build the full balance over the trailing `days` ending at `asOf`.
    /// Always returns a value — `.empty` (pairedDayCount 0) when there's no
    /// history — so the always-present Analysis card can branch on the count.
    static func compute(
        dailies: [DailyEntry],
        sessions: [LiftSessionEntry],
        settings: UserSettings,
        days: Int = 30,
        asOf: Date = Date()
    ) -> StrainRecoveryBalance {
        let dailySorted = dailies.sorted { $0.date < $1.date }
        guard !dailySorted.isEmpty else { return .empty }

        // ACWR's chronic leg wants 28 days; pull at least that much strain.
        let windowDays = max(days, 28)
        let strainPoints = StrainCalculator.daySeries(
            sessions: sessions, dailies: dailySorted, days: windowDays, asOf: asOf
        )
        guard !strainPoints.isEmpty else { return .empty }

        let dailyByKey = Dictionary(
            dailySorted.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a }
        )

        // Pair each strain day with that morning's recovery + recommendation,
        // computed exactly as the live screen does.
        var series: [StrainRecoveryBalance.DayPoint] = []
        var recommendation: [String: ClosedRange<Double>] = [:]
        for (i, sp) in strainPoints.enumerated() {
            let key = ymd.string(from: sp.day)
            guard let today = dailyByKey[key] else {
                series.append(.init(id: sp.day, day: sp.day, strain: sp.value,
                                    recovery: nil, quadrant: nil))
                continue
            }
            let history = dailySorted
                .filter { $0.date < key }
                .sorted { $0.date > $1.date }
                .prefix(30)
            let priorStrain: Double? = i > 0 ? strainPoints[i - 1].value : nil
            let rec = RecoveryEngine.compute(
                today: today, history: Array(history),
                priorStrain: priorStrain, sleepGoalHours: settings.sleepGoalHours
            )
            if let band = rec?.recommendedStrain { recommendation[key] = band }
            let quad = rec.map { quadrant(recovery: $0.score, strain: sp.value) }
            series.append(.init(id: sp.day, day: sp.day, strain: sp.value,
                                recovery: rec?.score, quadrant: quad))
        }

        let displaySeries = Array(series.suffix(days))
        let pairedDayCount = displaySeries.filter { $0.recovery != nil }.count

        // ---- Acute / chronic / ACWR ----
        // Gate the load math on REAL training signal, not mere DailyEntry
        // presence — otherwise a phone-step-tracking non-lifter clears the gate
        // off NEAT noise and gets authoritative injury-risk prose. A day counts
        // as "trained" only above the light-band floor (strain ≥ 4, matching
        // StrainCalculator's rest/light cutoff), which excludes pure step/walk
        // strain.
        let strainByDay = series.map(\.strain)            // chronological, dense
        let last7 = Array(strainByDay.suffix(7))
        let last28 = Array(strainByDay.suffix(28))
        let trainedDays7 = last7.filter { $0 >= 4 }.count
        let trainedDays28 = last28.filter { $0 >= 4 }.count
        let acuteLoad: Double? = trainedDays7 >= 2 ? mean(last7) : nil
        let chronicLoad: Double? = trainedDays28 >= 10 ? mean(last28) : nil
        let acwr: Double? = {
            // Chronic floor of 2.0 can't be cleared by step noise alone.
            guard let a = acuteLoad, let c = chronicLoad, c >= 2.0 else { return nil }
            return a / c
        }()
        let acwrBand = band(forACWR: acwr)
        let weeklyLoad: Double? = trainedDays28 >= 10 ? last7.reduce(0, +) : nil

        // ---- Monotony / Foster strain ----
        let monotony: Double? = {
            guard trainedDays28 >= 10 else { return nil }
            let m = mean(last7)
            let s = sd(last7, mean: m)
            guard s > 0.01 else { return nil }   // flat week → undefined; skip
            return m / s
        }()
        let fosterStrain: Double? = {
            guard let mono = monotony, let wl = weeklyLoad else { return nil }
            return wl * mono
        }()

        // ---- Lagged strain (N) → recovery (N+1) ----
        // Consecutive scored pairs only; drop true rest days (strain 0) so the
        // "low" bucket is easy training, not no-data (mirrors laggedExternal).
        var lagPairs: [(strain: Double, nextRecovery: Double)] = []
        for i in 0..<max(0, series.count - 1) {
            let a = series[i], b = series[i + 1]
            guard isConsecutive(a.day, b.day) else { continue }
            guard a.strain > 0, let r = b.recovery else { continue }
            lagPairs.append((a.strain, Double(r)))
        }
        var lag: StrainRecoveryBalance.LagFinding? = nil
        if lagPairs.count >= 12 {
            let sorted = lagPairs.sorted { $0.strain < $1.strain }
            let mid = sorted.count / 2
            let lowPairs = Array(sorted[..<mid])
            let highPairs = Array(sorted[mid...])
            let low = lowPairs.map(\.nextRecovery)
            let high = highPairs.map(\.nextRecovery)
            if low.count >= 6, high.count >= 6 {
                let mLow = mean(low), mHigh = mean(high)
                let delta = mHigh - mLow               // negative = strain costs recovery
                let d = cohensD(high, low)
                let pct = mLow != 0 ? delta / mLow : 0
                // The "after hard training" framing is only honest when the two
                // buckets actually differ in strain — a near-flat-strain history
                // makes the median split arbitrary, so require a real contrast
                // (≥3 on the 0...21 scale) before declaring the effect meaningful.
                let strainSeparation = mean(highPairs.map(\.strain)) - mean(lowPairs.map(\.strain))
                lag = .init(
                    pctChange: pct,
                    deltaPoints: delta,
                    hardDayCount: high.count,
                    isMeaningful: abs(d) >= 0.3 && abs(delta) >= 4 && strainSeparation >= 3
                )
            }
        }

        // ---- Alignment + quadrants + adherence ----
        var alignErrs: [Double] = []
        var quadrants: [StrainRecoveryBalance.Quadrant: Int] = [:]
        var adherenceHits = 0, adherenceTotal = 0
        for p in series {
            guard let rec = p.recovery else { continue }
            quadrants[quadrant(recovery: rec, strain: p.strain), default: 0] += 1
            guard let bandRange = recommendation[ymd.string(from: p.day)] else { continue }
            let midpoint = (bandRange.lowerBound + bandRange.upperBound) / 2
            alignErrs.append(abs(p.strain - midpoint) / 21.0)
            adherenceTotal += 1
            if bandRange.contains(p.strain) { adherenceHits += 1 }
        }
        let alignmentScore: Double? = alignErrs.count >= 7
            ? (1 - mean(alignErrs)).clamped(to: 0...1) : nil
        let quadrantCounts = (series.filter { $0.recovery != nil }.count >= 7) ? quadrants : [:]
        let dominantOff: StrainRecoveryBalance.Quadrant? = {
            let scored = quadrants.values.reduce(0, +)
            guard scored >= 7 else { return nil }
            let offDiag: [StrainRecoveryBalance.Quadrant] = [.drainedButPushed, .primedAndRested]
            guard let (q, n) = offDiag.map({ ($0, quadrants[$0] ?? 0) }).max(by: { $0.1 < $1.1 }),
                  Double(n) / Double(scored) >= 0.30 else { return nil }
            return q
        }()
        let adherencePct: Double? = adherenceTotal >= 7
            ? Double(adherenceHits) / Double(adherenceTotal) : nil

        // ---- Today snapshot ----
        // Read from displaySeries (the exposed window) so the card's "today"
        // matches the detail chart's enlarged dot for any `days` argument.
        let todayPoint = displaySeries.last { $0.recovery != nil }
        let todayRecommendation = todayPoint.flatMap { recommendation[ymd.string(from: $0.day)] }

        // ---- Findings (pre-scored for the feed emitters) ----
        var findings: [StrainRecoveryBalance.Finding] = []
        if let lag {
            let effect = min(abs(lag.deltaPoints) / 20.0, 1)   // ~20pt swing → full effect
            let conf = min(Double(lagPairs.count) / 18.0, 1)
            findings.append(.init(kind: .laggedStrainRecovery,
                                  score: (0.5 + 0.5 * effect) * conf * 100,
                                  confident: lag.isMeaningful))
        }
        if let r = acwr {
            let outOfBand = max(0, max(0.8 - r, r - 1.3))
            findings.append(.init(kind: .acwr,
                                  score: (0.4 + 0.6 * min(outOfBand / 0.7, 1)) * 90,
                                  confident: trainedDays28 >= 16))
        }
        if let mono = monotony {
            findings.append(.init(kind: .monotony,
                                  score: (0.35 + 0.5 * min(max(0, mono - 1.2) / 1.3, 1)) * 80,
                                  confident: (weeklyLoad ?? 0) >= 63))
        }
        if let align = alignmentScore {
            findings.append(.init(kind: .alignment,
                                  score: (0.3 + 0.6 * (1 - align)) * 75,
                                  confident: dominantOff != nil))
        }
        if adherencePct != nil {
            findings.append(.init(kind: .adherence, score: 55,
                                  confident: adherenceTotal >= 10))
        }

        return StrainRecoveryBalance(
            series: displaySeries,
            pairedDayCount: pairedDayCount,
            acwr: acwr, acwrBand: acwrBand,
            acuteLoad: acuteLoad, chronicLoad: chronicLoad,
            monotony: monotony, weeklyLoad: weeklyLoad, fosterStrain: fosterStrain,
            alignmentScore: alignmentScore, quadrantCounts: quadrantCounts,
            dominantOffDiagonal: dominantOff,
            todayQuadrant: todayPoint?.quadrant,
            todayRecovery: todayPoint?.recovery,
            todayStrain: todayPoint?.strain,
            recommendedStrainToday: todayRecommendation,
            lag: lag, laggedPairCount: lagPairs.count,
            adherencePct: adherencePct, adherenceSampleDays: adherenceTotal,
            findings: findings
        )
    }

    // MARK: - Classification

    static func quadrant(recovery: Int, strain: Double) -> StrainRecoveryBalance.Quadrant {
        let highRec = recovery >= highRecovery
        let lowRec = recovery < lowRecovery
        if strain >= highStrain {
            if highRec { return .primedAndPushed }
            if lowRec { return .drainedButPushed }
        } else if strain < lowStrain, highRec {
            return .primedAndRested
        }
        return .balanced
    }

    private static func band(forACWR acwr: Double?) -> StrainRecoveryBalance.ACWRBand {
        guard let r = acwr else { return .unknown }
        switch r {
        case ..<0.8:       return .detraining
        case 0.8...1.3:    return .sweetSpot
        case 1.3...1.5:    return .caution
        default:           return .danger
        }
    }

    // MARK: - Stats (minimal duplicated set — see header)

    private static func mean(_ xs: [Double]) -> Double {
        guard !xs.isEmpty else { return 0 }
        return xs.reduce(0, +) / Double(xs.count)
    }

    private static func sd(_ xs: [Double], mean m: Double) -> Double {
        guard xs.count > 1 else { return 0 }
        let v = xs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(xs.count - 1)
        return v.squareRoot()
    }

    private static func cohensD(_ a: [Double], _ b: [Double]) -> Double {
        guard a.count > 1, b.count > 1 else { return 0 }
        let ma = mean(a), mb = mean(b)
        let va = a.reduce(0) { $0 + ($1 - ma) * ($1 - ma) } / Double(a.count - 1)
        let vb = b.reduce(0) { $0 + ($1 - mb) * ($1 - mb) } / Double(b.count - 1)
        let pooled = (Double(a.count - 1) * va + Double(b.count - 1) * vb)
            / Double(a.count + b.count - 2)
        guard pooled > 0 else { return 0 }
        return (ma - mb) / pooled.squareRoot()
    }

    private static func isConsecutive(_ a: Date, _ b: Date) -> Bool {
        let cal = Calendar.current
        guard let d = cal.dateComponents([.day], from: a, to: b).day else { return false }
        return d == 1
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
