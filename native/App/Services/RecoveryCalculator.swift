import Foundation

/// 0–100 daily recovery score loosely modeled on Whoop's formulation:
/// HRV deviation from rolling baseline (heaviest weight), RHR
/// deviation (inverted — higher RHR is worse), sleep hours vs goal,
/// and a small subjective component from mood/energy if logged.
///
/// HRV/RHR/mood components fall back to neutral (50%) when missing, but
/// SLEEP IS REQUIRED: recovery is a morning-after-sleep metric, so with no
/// sleep data we return nil and the UI shows an empty state instead of a
/// number you "recovered" to without having slept.
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

    /// - Parameter priorDayStrain: yesterday's strain (0–21). High strain
    ///   the day before tempers today's recovery ceiling — a 12% component
    ///   that reads ~100 after a true rest day and falls toward ~25 after
    ///   an all-out (21) day. nil when yesterday's strain is unknown, in
    ///   which case it falls back to neutral (50).
    static func compute(
        daily: DailyEntry?,
        hrvBaseline: Double?,
        rhrBaseline: Double?,
        sleepGoalHours: Double,
        priorDayStrain: Double? = nil
    ) -> Score? {
        let hrvNow = daily?.hrvMs
        let rhrNow = daily?.restingHr
        let sleepNow = daily?.sleepHours
        let mood = daily?.moodScore

        // Recovery requires last night's sleep — no sleep, no score.
        guard sleepNow != nil else { return nil }

        var comps: [Component] = []

        // HRV — heaviest weight (35%). Higher than baseline = recovered.
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
        comps.append(Component(label: "HRV", value: hrvScore, weight: 0.35, note: hrvNote))

        // RHR — inverted (20%). Lower than baseline = recovered.
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
        comps.append(Component(label: "Resting HR", value: rhrScore, weight: 0.20, note: rhrNote))

        // Sleep (25%). Blends DURATION (hours vs goal) with QUALITY (stage
        // architecture) when per-stage minutes exist. Quality rewards a
        // healthy split — deep ~13–23%, REM ~20–25% of total sleep — so
        // 8 hours of fragmented sleep scores below 8 hours of well-staged
        // sleep. With no stage data we fall back to hours-only (the prior
        // behavior).
        let hoursScore: Int = {
            guard let s = sleepNow, sleepGoalHours > 0 else { return 50 }
            let ratio = min(1.1, s / sleepGoalHours)
            return Int((ratio * 100).rounded().clamped(to: 0...100))
        }()
        let qualityScore: Int? = stageQualityScore(daily)
        let sleepScore: Int = {
            guard let q = qualityScore else { return hoursScore }
            // 65/35 duration/quality blend — duration still dominates, but
            // poor architecture pulls the score down.
            return Int((Double(hoursScore) * 0.65 + Double(q) * 0.35).rounded().clamped(to: 0...100))
        }()
        let sleepNote: String = {
            guard let s = sleepNow else { return "no sleep data" }
            let h = Int(s)
            let m = Int((s - Double(h)) * 60)
            let base = String(format: "%dh %02dm / %.0fh goal", h, m, sleepGoalHours)
            if let deepMin = daily?.sleepDeepMin, let remMin = daily?.sleepREMMin,
               let lightMin = daily?.sleepLightMin {
                let staged = Double(deepMin + remMin + lightMin)
                if staged > 0 {
                    let deepPct = Int((Double(deepMin) / staged * 100).rounded())
                    let remPct = Int((Double(remMin) / staged * 100).rounded())
                    return "\(base) · \(deepPct)% deep · \(remPct)% REM"
                }
            }
            return base
        }()
        comps.append(Component(label: "Sleep", value: sleepScore, weight: 0.25, note: sleepNote))

        // Mood — subjective (8%). User-logged 1–10.
        let moodScore: Int = {
            guard let m = mood else { return 50 }
            return Int((Double(m) / 10.0 * 100).rounded().clamped(to: 0...100))
        }()
        let moodNote: String = mood == nil ? "log to factor in" : "\(mood!)/10 self-rated"
        comps.append(Component(label: "Mood", value: moodScore, weight: 0.08, note: moodNote))

        // Prior-day strain (12%). A hard yesterday means accumulated
        // fatigue, so it tempers today's ceiling. Map strain 0–21 → 100–25
        // (rest day → full credit, all-out → heavily penalized).
        let priorStrainScore: Int = {
            guard let s = priorDayStrain else { return 50 }
            let normalized = (s / 21.0).clamped(to: 0...1)
            return Int(((1 - normalized) * 75 + 25).rounded().clamped(to: 0...100))
        }()
        let priorStrainNote: String = {
            guard let s = priorDayStrain else { return "no data yesterday" }
            return String(format: "%.1f strain yesterday", s)
        }()
        comps.append(Component(label: "Prior Strain", value: priorStrainScore, weight: 0.12, note: priorStrainNote))

        let total = comps.reduce(0.0) { acc, c in
            acc + Double(c.value) * c.weight
        }
        let value = Int(total.rounded().clamped(to: 0...100))
        return Score(value: value, band: band(for: value), components: comps)
    }

    /// Stage-architecture sub-score (0–100). Rewards proportions near the
    /// healthy adult reference window — deep ~13–23%, REM ~20–25% of total
    /// sleep time — and penalizes excessive awake time. Returns nil when
    /// per-stage minutes are absent so the caller falls back to hours-only.
    private static func stageQualityScore(_ daily: DailyEntry?) -> Int? {
        guard let d = daily,
              let deep = d.sleepDeepMin,
              let rem = d.sleepREMMin,
              let light = d.sleepLightMin else { return nil }
        let asleep = Double(deep + rem + light)
        guard asleep > 0 else { return nil }

        let deepPct = Double(deep) / asleep
        let remPct = Double(rem) / asleep

        // Each stage scores 100 inside its ideal band and decays linearly
        // toward 0 outside it. Deep ideal 0.13–0.23, REM ideal 0.20–0.25.
        let deepScore = bandScore(deepPct, low: 0.13, high: 0.23, tolerance: 0.10)
        let remScore = bandScore(remPct, low: 0.20, high: 0.25, tolerance: 0.12)

        // Fragmentation penalty from awake time relative to time asleep.
        let awake = Double(d.sleepAwakeMin ?? 0)
        let awakeFrac = awake / (asleep + awake)
        let awakeScore = (1 - (awakeFrac / 0.20)).clamped(to: 0...1) * 100  // 20%+ awake → 0

        // Deep matters most for physical recovery, then REM, then continuity.
        let blended = deepScore * 0.45 + remScore * 0.35 + awakeScore * 0.20
        return Int(blended.rounded().clamped(to: 0...100))
    }

    /// 100 inside [low…high], decaying linearly to 0 once `value` is
    /// `tolerance` outside the band on either side.
    private static func bandScore(_ value: Double, low: Double, high: Double, tolerance: Double) -> Double {
        if value >= low && value <= high { return 100 }
        let dist = value < low ? (low - value) : (value - high)
        return ((1 - dist / tolerance) * 100).clamped(to: 0...100)
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

    /// - Parameters:
    ///   - sessionRPE: volume-weighted session RPE (6–10) recovered from
    ///     the day's lift sets. nil when no RPE was logged — mechanical
    ///     load then uses a neutral ~7/10 multiplier so the score still
    ///     reflects the work without inventing exertion.
    ///   - steps / distanceMeters: corroborating cardio signal. They don't
    ///     stack additively on top of active energy (that would double-count
    ///     the same movement) — instead they fill in cardio load when active
    ///     energy is missing or under-reports, via a max() blend.
    static func compute(
        liftVolumeTodayLb: Double,
        liftVolumeMax7dLb: Double,
        activeEnergyKcal: Double,
        sessionRPE: Double? = nil,
        steps: Int? = nil,
        distanceMeters: Double? = nil
    ) -> Score {
        // Cardiovascular load. Primary signal is active energy
        // (800kcal ≈ a solid workout day → ~16). Steps/distance act as a
        // corroborating estimate so a walk that HealthKit under-credits on
        // calories still registers: ~12k steps or ~5mi ≈ moderate cardio
        // (~10). We take the max rather than the sum so the same movement
        // isn't counted twice.
        let kcalCardio = activeEnergyKcal / 50.0
        let stepCardio = steps.map { Double($0) / 1200.0 } ?? 0          // 12k steps → 10
        let distCardio = distanceMeters.map { ($0 / 1609.34) / 0.5 } ?? 0 // 5 mi → 10
        let cardio = min(16.0, max(kcalCardio, max(stepCardio, distCardio)))

        // Mechanical load: today's volume as a fraction of recent peak,
        // scaled so a 100% PR-equivalent volume contributes ~8, then
        // modulated by session RPE (the validated session-RPE / sRPE
        // approach). RPE 6→0.6×, 7→~0.78× (neutral default), 10→1.3×, so
        // an all-out day at the same tonnage reads meaningfully harder
        // than a back-off day.
        let rpeMultiplier: Double = {
            let rpe = sessionRPE ?? 7.0
            // Linear map RPE 6…10 → 0.6…1.3, clamped.
            let m = 0.6 + (rpe - 6.0) / 4.0 * 0.7
            return m.clamped(to: 0.6...1.3)
        }()
        let mechanicalBase: Double = {
            guard liftVolumeMax7dLb > 0 else { return liftVolumeTodayLb > 0 ? 5 : 0 }
            let ratio = min(1.2, liftVolumeTodayLb / liftVolumeMax7dLb)
            return ratio * 8.0
        }()
        let mechanical = mechanicalBase * (liftVolumeTodayLb > 0 ? rpeMultiplier : 1.0)

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
            let liftPart: String? = {
                guard liftVolumeTodayLb > 0 else { return nil }
                let base = "\(Int(liftVolumeTodayLb)) lb"
                guard let rpe = sessionRPE else { return base }
                let rpeStr = rpe.truncatingRemainder(dividingBy: 1) == 0
                    ? "\(Int(rpe))" : String(format: "%.1f", rpe)
                return "\(base) @ RPE \(rpeStr)"
            }()
            let stepPart: String? = {
                // Only surface steps when they're the dominant cardio
                // driver and kcal didn't already cover it.
                guard kcalPart == nil, liftPart == nil, let s = steps, s > 0 else { return nil }
                return "\(s) steps"
            }()
            return [liftPart, kcalPart, stepPart].compactMap { $0 }.joined(separator: " · ")
        }()
        return Score(value: value, band: band, breakdown: breakdown)
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
