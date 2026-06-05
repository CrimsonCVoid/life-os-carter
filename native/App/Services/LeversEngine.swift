import Foundation
import SwiftUI

/// A ranked driver board for ONE outcome: the controllable inputs that move
/// THIS user's recovery / mood / energy / sleep quality / HRV, sorted by
/// standardized effect. Produced on-device by `LeversEngine`. Small-N honest:
/// `levers` is empty below the per-input sample gate, and only outcomes with
/// ≥1 qualifying lever produce a board.
struct LeversBoard: Identifiable {
    let id: Outcome
    let outcome: Outcome
    let levers: [Lever]          // sorted by |effect| desc, capped at 6
    let sampleDays: Int          // paired days the board rests on

    /// A single controllable input's standardized effect on the outcome.
    struct Lever: Identifiable {
        let id: String           // input key, stable for SwiftUI diffing
        let label: String
        let icon: String
        let tint: Color
        /// Standardized effect, oriented so + always means "more of this input
        /// → better outcome" (sign flipped for lower-is-good inputs).
        let effect: Double       // roughly -1.5 ... 1.5
        let confidence: Double   // 0...1 (|r| × sample fraction)
        let n: Int
        let kind: LeverKind
        let blurb: String
    }

    enum LeverKind { case continuous, flag }

    enum Outcome: String, CaseIterable, Identifiable {
        case recovery, mood, energy, sleepQuality, hrv
        var id: String { rawValue }
        var label: String {
            switch self {
            case .recovery:     return "Recovery"
            case .mood:         return "Mood"
            case .energy:       return "Energy"
            case .sleepQuality: return "Sleep quality"
            case .hrv:          return "HRV"
            }
        }
        var tint: Color {
            switch self {
            case .recovery:     return LifeOSColor.Metric.peak
            case .mood:         return LifeOSColor.Metric.mood
            case .energy:       return LifeOSColor.Metric.energy
            case .sleepQuality: return LifeOSColor.Metric.sleep
            case .hrv:          return LifeOSColor.Metric.hrv
            }
        }
    }
}

/// Multi-factor driver ranking. For each outcome, regress every controllable
/// input against it over the paired days and rank by standardized effect
/// (continuous inputs) or Cohen's d (flag inputs). Pure function of its inputs;
/// recovery scores are supplied precomputed so the board agrees with the hero.
enum LeversEngine {

    private struct ContInput {
        let key: String
        let label: String
        let icon: String
        let tint: Color
        let higherInputIsGood: Bool
        let value: (DailyEntry) -> Double?
    }

    private struct FlagInput {
        let key: String
        let label: String
        let icon: String
        let tint: Color
        let value: (DailyEntry) -> Bool
    }

    private static func contInputs(waterGoal: Double, proteinByDate: [String: Double]) -> [ContInput] {
        [
            ContInput(key: "sleep", label: "Sleep", icon: "bed.double.fill",
                      tint: LifeOSColor.Metric.sleep, higherInputIsGood: true,
                      value: { $0.sleepHours }),
            ContInput(key: "deep", label: "Deep + REM", icon: "moon.stars.fill",
                      tint: LifeOSColor.Metric.sleep, higherInputIsGood: true,
                      value: { restorativeFraction($0) }),
            ContInput(key: "hydration", label: "Hydration", icon: "drop.fill",
                      tint: LifeOSColor.Metric.water, higherInputIsGood: true,
                      value: { waterGoal > 0 ? $0.waterOz / waterGoal : nil }),
            ContInput(key: "steps", label: "Steps", icon: "figure.walk",
                      tint: LifeOSColor.Metric.steps, higherInputIsGood: true,
                      value: { $0.steps.map(Double.init) }),
            ContInput(key: "protein", label: "Protein", icon: "fork.knife",
                      tint: LifeOSColor.Metric.protein, higherInputIsGood: true,
                      value: { proteinByDate[$0.date] }),
            ContInput(key: "weight", label: "Weight trend", icon: "scalemass.fill",
                      tint: LifeOSColor.Metric.weight, higherInputIsGood: false,
                      value: { $0.weightLb }),
            ContInput(key: "stress", label: "Lower stress", icon: "brain.head.profile",
                      tint: LifeOSColor.warning, higherInputIsGood: false,
                      value: { $0.stressLevel.map(Double.init) }),
        ]
    }

    private static let flagInputs: [FlagInput] = [
        FlagInput(key: "alcohol",  label: "No alcohol",       icon: "wineglass.fill",
                  tint: LifeOSColor.Metric.mood,  value: { $0.alcoholYesterday }),
        FlagInput(key: "caffeine", label: "No late caffeine", icon: "cup.and.saucer.fill",
                  tint: LifeOSColor.Metric.energy, value: { $0.caffeineAfter2pm }),
        FlagInput(key: "lateEat",  label: "No late eating",   icon: "fork.knife",
                  tint: LifeOSColor.Metric.calories, value: { $0.lateEating }),
        FlagInput(key: "screen",   label: "No screens in bed", icon: "iphone",
                  tint: LifeOSColor.Metric.sleep, value: { $0.screenBeforeBed }),
    ]

    private static func outcomeValue(_ o: LeversBoard.Outcome, day: DailyEntry,
                                     recoveryByDate: [String: Int]) -> Double? {
        switch o {
        case .recovery:     return recoveryByDate[day.date].map(Double.init)
        case .mood:         return day.moodScore.map(Double.init)
        case .energy:       return day.energyScore.map(Double.init)
        case .sleepQuality: return restorativeFraction(day)
        case .hrv:          return day.hrvMs
        }
    }

    static func boards(
        daily: [DailyEntry],
        proteinByDate: [String: Double],
        recoveryByDate: [String: Int],
        settings: UserSettings
    ) -> [LeversBoard] {
        let days = daily.sorted { $0.date < $1.date }
        guard days.count >= 10 else { return [] }
        let cont = contInputs(waterGoal: settings.waterGoalOz, proteinByDate: proteinByDate)

        var out: [LeversBoard] = []
        for outcome in LeversBoard.Outcome.allCases {
            let outDays = days.filter {
                outcomeValue(outcome, day: $0, recoveryByDate: recoveryByDate) != nil
            }
            guard outDays.count >= 10 else { continue }

            var levers: [LeversBoard.Lever] = []

            // Continuous inputs → standardized slope.
            for inp in cont {
                if outcome == .sleepQuality && inp.key == "deep" { continue }   // self-driver guard
                var pts: [(x: Double, y: Double)] = []
                for d in outDays {
                    guard let x = inp.value(d),
                          let y = outcomeValue(outcome, day: d, recoveryByDate: recoveryByDate)
                    else { continue }
                    pts.append((x, y))
                }
                guard pts.count >= 10,
                      let std = InsightStats.standardizedSlope(pts),
                      let r = InsightStats.pearson(pts),
                      abs(std) >= 0.18, abs(r) >= 0.25 else { continue }
                let oriented = inp.higherInputIsGood ? std : -std
                let conf = (abs(r) * min(Double(pts.count) / 20.0, 1)).clamped(to: 0...1)
                levers.append(.init(
                    id: inp.key, label: inp.label, icon: inp.icon, tint: inp.tint,
                    effect: oriented.clamped(to: -1.5...1.5),
                    confidence: conf, n: pts.count, kind: .continuous,
                    blurb: contBlurb(inp: inp, outcome: outcome, std: oriented, r: r)
                ))
            }

            // Flag inputs → Cohen's d (flag-false good vs flag-true bad).
            for fl in flagInputs {
                var good: [Double] = [], bad: [Double] = []
                for d in outDays {
                    guard let y = outcomeValue(outcome, day: d, recoveryByDate: recoveryByDate) else { continue }
                    if fl.value(d) { bad.append(y) } else { good.append(y) }
                }
                guard good.count >= 5, bad.count >= 5 else { continue }
                let d = InsightStats.cohensD(good, bad)
                guard abs(d) >= 0.30 else { continue }
                let conf = (min(abs(d) / 1.0, 1) * min(Double(min(good.count, bad.count)) / 10.0, 1)).clamped(to: 0...1)
                levers.append(.init(
                    id: fl.key, label: fl.label, icon: fl.icon, tint: fl.tint,
                    effect: d.clamped(to: -1.5...1.5),
                    confidence: conf, n: good.count + bad.count, kind: .flag,
                    blurb: flagBlurb(fl: fl, outcome: outcome,
                                     goodAvg: InsightStats.mean(good), badAvg: InsightStats.mean(bad))
                ))
            }

            guard !levers.isEmpty else { continue }
            levers.sort { abs($0.effect) > abs($1.effect) }
            out.append(LeversBoard(
                id: outcome, outcome: outcome,
                levers: Array(levers.prefix(6)), sampleDays: outDays.count
            ))
        }
        return out.sorted { boardStrength($0) > boardStrength($1) }
    }

    private static func boardStrength(_ b: LeversBoard) -> Double {
        b.levers.reduce(0) { $0 + abs($1.effect) * $1.confidence }
    }

    // MARK: - Copy

    private static func contBlurb(inp: ContInput, outcome: LeversBoard.Outcome, std: Double, r: Double) -> String {
        let dir = std >= 0 ? "lifts" : "drags down"
        return "More \(inp.label.lowercased()) \(dir) your \(outcome.label.lowercased()) (r \(String(format: "%.2f", r)))."
    }

    private static func flagBlurb(fl: FlagInput, outcome: LeversBoard.Outcome, goodAvg: Double, badAvg: Double) -> String {
        let unit = (outcome == .sleepQuality) ? "%" : (outcome == .hrv ? " ms" : (outcome == .recovery ? " pts" : ""))
        let g = outcome == .sleepQuality ? goodAvg * 100 : goodAvg
        let b = outcome == .sleepQuality ? badAvg * 100 : badAvg
        return "\(outcome.label) averages \(fmt1(g))\(unit) on \(fl.label.lowercased()) days vs \(fmt1(b))\(unit) otherwise."
    }
    private static func fmt1(_ v: Double) -> String { String(format: abs(v) >= 100 ? "%.0f" : "%.1f", v) }

    private static func restorativeFraction(_ d: DailyEntry) -> Double? {
        guard let deep = d.sleepDeepMin, let rem = d.sleepREMMin else { return nil }
        let light = d.sleepLightMin ?? 0
        let total = deep + rem + light
        guard total > 0 else { return nil }
        return Double(deep + rem) / Double(total)
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self { min(max(self, range.lowerBound), range.upperBound) }
}
