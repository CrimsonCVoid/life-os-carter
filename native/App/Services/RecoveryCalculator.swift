import Foundation

/// 0–100 daily recovery score loosely modeled on Whoop's formulation:
/// HRV deviation from rolling baseline (heaviest weight), RHR
/// deviation (inverted — higher RHR is worse), sleep hours vs goal,
/// and a small subjective component from mood/energy if logged.
///
/// All components default to neutral (50%) when their inputs are
/// missing so a fresh install — or a user without an Apple Watch —
/// still sees a score instead of a "—". Returns nil only when no
/// signal at all is present (no HRV, no RHR, no sleep, no mood).
enum RecoveryCalculator {
    struct Score {
        let value: Int           // 0–100
        let band: Band
        let components: [Component]
    }

    enum Band {
        case low      // 0–33  — red
        case medium   // 34–66 — yellow
        case high     // 67–100 — green
    }

    struct Component {
        let label: String
        let value: Int           // 0–100 contribution
        let weight: Double       // share of overall
        let note: String         // short user-facing detail
    }

    static func compute(
        daily: DailyEntry?,
        hrvBaseline: Double?,
        rhrBaseline: Double?,
        sleepGoalHours: Double
    ) -> Score? {
        let hrvNow = daily?.hrvMs
        let rhrNow = daily?.restingHr
        let sleepNow = daily?.sleepHours
        let mood = daily?.moodScore

        // Bail when there's literally nothing to compute from.
        guard hrvNow != nil || rhrNow != nil || sleepNow != nil || mood != nil else {
            return nil
        }

        var comps: [Component] = []

        // HRV — heaviest weight (40%). Higher than baseline = recovered.
        // Clamp so a single outlier doesn't peg the score.
        let hrvScore: Int = {
            guard let now = hrvNow, let base = hrvBaseline, base > 0 else { return 50 }
            let pct = (now - base) / base
            return percentBand(pct, low: -0.25, high: 0.25)
        }()
        let hrvNote: String = {
            guard let now = hrvNow else { return "no reading today" }
            if let base = hrvBaseline {
                let delta = Int(((now - base) / base * 100).rounded())
                let sign = delta >= 0 ? "+" : ""
                return "\(Int(now.rounded())) ms · \(sign)\(delta)% vs 14d"
            }
            return "\(Int(now.rounded())) ms"
        }()
        comps.append(Component(label: "HRV", value: hrvScore, weight: 0.40, note: hrvNote))

        // RHR — inverted (25%). Lower than baseline = recovered.
        let rhrScore: Int = {
            guard let now = rhrNow, let base = rhrBaseline, base > 0 else { return 50 }
            let pct = (base - now) / base
            return percentBand(pct, low: -0.15, high: 0.15)
        }()
        let rhrNote: String = {
            guard let now = rhrNow else { return "no reading today" }
            if let base = rhrBaseline {
                let delta = Int(((now - base) / base * 100).rounded())
                let sign = delta >= 0 ? "+" : ""
                return "\(Int(now.rounded())) bpm · \(sign)\(delta)% vs 14d"
            }
            return "\(Int(now.rounded())) bpm"
        }()
        comps.append(Component(label: "Resting HR", value: rhrScore, weight: 0.25, note: rhrNote))

        // Sleep hours vs goal (25%). Linear up to goal, plateau above.
        let sleepScore: Int = {
            guard let s = sleepNow, sleepGoalHours > 0 else { return 50 }
            let ratio = min(1.1, s / sleepGoalHours)
            return Int((ratio * 100).rounded().clamped(to: 0...100))
        }()
        let sleepNote: String = {
            guard let s = sleepNow else { return "no sleep data" }
            let h = Int(s)
            let m = Int((s - Double(h)) * 60)
            return String(format: "%dh %02dm / %.0fh goal", h, m, sleepGoalHours)
        }()
        comps.append(Component(label: "Sleep", value: sleepScore, weight: 0.25, note: sleepNote))

        // Mood — subjective (10%). User-logged 1–10.
        let moodScore: Int = {
            guard let m = mood else { return 50 }
            return Int((Double(m) / 10.0 * 100).rounded().clamped(to: 0...100))
        }()
        let moodNote: String = mood == nil ? "log to factor in" : "\(mood!)/10 self-rated"
        comps.append(Component(label: "Mood", value: moodScore, weight: 0.10, note: moodNote))

        let total = comps.reduce(0.0) { acc, c in
            acc + Double(c.value) * c.weight
        }
        let value = Int(total.rounded().clamped(to: 0...100))
        return Score(value: value, band: band(for: value), components: comps)
    }

    private static func percentBand(_ pct: Double, low: Double, high: Double) -> Int {
        // Map [low ... high] linearly to [0 ... 100], clamped.
        let span = high - low
        guard span > 0 else { return 50 }
        let raw = ((pct - low) / span) * 100
        return Int(raw.rounded().clamped(to: 0...100))
    }

    private static func band(for value: Int) -> Band {
        switch value {
        case ..<34:  return .low
        case 34..<67: return .medium
        default:     return .high
        }
    }
}

/// Whoop-style strain score on a 0–21 scale. Rough approximation:
/// blends today's logged lift volume against the user's 7-day rolling
/// max volume + active-energy-burned (HealthKit). It's intentionally
/// simple — without continuous HR data we can't replicate Whoop's
/// proper EPOC-based math, but the relative number is still useful
/// for "did I do a lot today vs my normal."
enum StrainCalculator {
    struct Score {
        let value: Double        // 0–21
        let band: Band
        let breakdown: String    // one-line user-facing detail
    }

    enum Band {
        case rest, light, moderate, hard, allOut
    }

    static func compute(
        liftVolumeTodayLb: Double,
        liftVolumeMax7dLb: Double,
        activeEnergyKcal: Double
    ) -> Score {
        // Cardiovascular load: 800kcal active = solid workout day → ~14.
        let cardio = min(16.0, activeEnergyKcal / 50.0)
        // Mechanical load: today's volume as a fraction of recent peak,
        // scaled so a 100% PR-equivalent volume contributes ~8.
        let mechanical: Double = {
            guard liftVolumeMax7dLb > 0 else { return liftVolumeTodayLb > 0 ? 5 : 0 }
            let ratio = min(1.2, liftVolumeTodayLb / liftVolumeMax7dLb)
            return ratio * 8.0
        }()
        // Combine with a soft cap so they don't double-count when both
        // are present (you don't lift hard + do 90 minutes of cardio
        // without the body merging them anyway).
        let combined = sqrt(cardio * cardio + mechanical * mechanical) * 0.92
        let value = min(21.0, combined)
        let band: Band = {
            switch value {
            case ..<4:   return .rest
            case 4..<9:  return .light
            case 9..<14: return .moderate
            case 14..<18: return .hard
            default:     return .allOut
            }
        }()
        let breakdown: String = {
            if value < 1 { return "no activity logged today" }
            let kcalPart = activeEnergyKcal > 0 ? "\(Int(activeEnergyKcal)) kcal active" : nil
            let liftPart = liftVolumeTodayLb > 0 ? "\(Int(liftVolumeTodayLb)) lb lifted" : nil
            return [liftPart, kcalPart].compactMap { $0 }.joined(separator: " · ")
        }()
        return Score(value: value, band: band, breakdown: breakdown)
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
