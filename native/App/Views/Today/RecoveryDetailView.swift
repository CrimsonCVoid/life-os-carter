import SwiftUI

/// Presented breakdown of today's recovery. Big band-tinted ring + headline,
/// the signed driver bars (what pushed recovery up/down), the recommended
/// strain target, and a partial-data note when baselines are still learning
/// or inputs were missing. Wraps itself in a NavigationStack so it renders its
/// own title bar + Done button whether the integrator shows it as a sheet or a
/// full-screen cover.
struct RecoveryDetailView: View {
    let result: RecoveryResult
    /// The viewed day's entry — drives the personalized improvement tips
    /// (behavioral flags + actual sleep-stage values).
    let daily: DailyEntry
    /// Trailing window of entries up to and including the viewed day,
    /// chronological — powers the "why" trend charts.
    let history: [DailyEntry]
    var sleepGoalHours: Double = 8
    @Environment(\.dismiss) private var dismiss

    private var tint: Color { LifeOSColor.recovery(result.score) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    hero
                    recoveryTrendCard
                    driversCard
                    signalsSection
                    sleepArchitectureCard
                    improveCard
                    recommendedStrainCard
                    if isPartial { partialNote }
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Recovery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        Haptics.tap()
                        dismiss()
                    }
                    .foregroundStyle(LifeOSColor.accent)
                }
            }
        }
    }

    // MARK: - Hero

    private var hero: some View {
        Card(tint: tint) {
            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.30))
                        .frame(width: 150, height: 150)
                        .blur(radius: 40)
                    ScoreRing(
                        progress: Double(result.score) / 100.0,
                        value: "\(result.score)",
                        label: "RECOVERY",
                        tint: tint,
                        size: 150
                    )
                }
                Text(result.headline)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(LifeOSColor.fg)
                Text(bandLabel)
                    .font(.system(size: 11, weight: .heavy)).tracking(1.0)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.15)))
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var bandLabel: String {
        switch result.band {
        case .low:    return "PRIORITIZE RECOVERY"
        case .medium: return "HOLD STEADY"
        case .high:   return "PRIMED TO PUSH"
        }
    }

    // MARK: - Drivers

    private var driversCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel("What's driving it")
                ForEach(result.drivers) { driver in
                    DriverRow(driver: driver)
                }
            }
        }
    }

    // MARK: - Why (trend charts)

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private func points(_ pick: (DailyEntry) -> Double?) -> [TrendPoint] {
        history.compactMap { row in
            guard let v = pick(row), let d = Self.ymd.date(from: row.date) else { return nil }
            return TrendPoint(day: d, value: v)
        }
    }

    /// mean ± 1 SD "normal range" band; nil when too few points to mean it.
    private func band(_ pts: [TrendPoint]) -> (low: Double, high: Double)? {
        let vals = pts.map(\.value)
        guard vals.count >= 4 else { return nil }
        let mean = vals.reduce(0, +) / Double(vals.count)
        let variance = vals.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(vals.count)
        let sd = variance.squareRoot()
        guard sd > 0 else { return nil }
        return (mean - sd, mean + sd)
    }

    /// Recovery recomputed per day across the window (prior-strain damper
    /// omitted so the trajectory reads cleanly off the autonomic + sleep
    /// signals). The hero shows the precise current value.
    private var recoveryTrend: [TrendPoint] {
        var pts: [TrendPoint] = []
        for (i, row) in history.enumerated() {
            let prior = Array(history[0..<i].reversed())
            guard let r = RecoveryEngine.compute(
                today: row, history: prior, priorStrain: nil, sleepGoalHours: sleepGoalHours
            ), let d = Self.ymd.date(from: row.date) else { continue }
            pts.append(TrendPoint(day: d, value: Double(r.score)))
        }
        return pts
    }

    @ViewBuilder
    private var recoveryTrendCard: some View {
        let pts = recoveryTrend
        if pts.count >= 3 {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Recovery trend")
                    ScrubbableTrendChart(
                        points: pts,
                        tint: tint,
                        showPoints: pts.count <= 21,
                        valueFormat: { "\(Int($0.rounded()))" },
                        yDomain: 0...100,
                        deltaCaption: true,
                        deltaHigherIsBetter: true
                    )
                    .frame(height: 120)
                    Text("Where today sits against your recent days — drag to read any day.")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    private var signalsSection: some View {
        VStack(spacing: 16) {
            trendCard(
                "Heart rate variability", unit: "ms", tint: LifeOSColor.Metric.hrv,
                points: points { $0.hrvMs }, higherIsBetter: true, showBand: true,
                baseline: nil, fmt: { "\(Int($0.rounded()))" },
                footnote: "Today against your normal range (mean ± 1 SD). Above the band reads as well-recovered; below it, strained.")
            trendCard(
                "Resting heart rate", unit: "bpm", tint: LifeOSColor.Metric.rhr,
                points: points { $0.restingHr }, higherIsBetter: false, showBand: true,
                baseline: nil, fmt: { "\(Int($0.rounded()))" },
                footnote: "Lower is better. Sitting above your normal band signals incomplete recovery, dehydration, or illness.")
            trendCard(
                "Sleep", unit: "h", tint: LifeOSColor.Metric.sleep,
                points: points { $0.sleepHours }, higherIsBetter: true, showBand: false,
                baseline: sleepGoalHours, fmt: { String(format: "%.1f", $0) },
                footnote: "The line is nightly hours; the rule is your \(Int(sleepGoalHours))h goal.")
        }
    }

    @ViewBuilder
    private func trendCard(
        _ title: String, unit: String, tint: Color,
        points pts: [TrendPoint], higherIsBetter: Bool, showBand: Bool,
        baseline: Double?, fmt: @escaping (Double) -> String, footnote: String
    ) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    SectionLabel(title)
                    Spacer()
                    if let last = pts.last?.value {
                        Text(fmt(last))
                            .font(.system(size: 16, weight: .bold, design: .rounded)).monospacedDigit()
                            .foregroundStyle(tint)
                        Text(unit).font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                    }
                }
                if pts.count >= 3 {
                    ScrubbableTrendChart(
                        points: pts,
                        tint: tint,
                        showPoints: pts.count <= 21,
                        valueFormat: fmt,
                        yAxisFormat: fmt,
                        band: showBand ? band(pts) : nil,
                        baseline: baseline,
                        deltaCaption: true,
                        deltaHigherIsBetter: higherIsBetter
                    )
                    .frame(height: 110)
                    Text(footnote)
                        .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Not enough synced history yet — a few more days fills this in.")
                        .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 16)
                }
            }
        }
    }

    @ViewBuilder
    private var sleepArchitectureCard: some View {
        if let deep = daily.sleepDeepMin, let rem = daily.sleepREMMin,
           let light = daily.sleepLightMin {
            let awake = daily.sleepAwakeMin ?? 0
            let asleep = max(1, deep + rem + light)
            let total = max(1, asleep + awake)
            let rows: [(name: String, mins: Int, tint: Color, ideal: ClosedRange<Double>?)] = [
                ("Deep", deep, LifeOSColor.SleepStage.deep, 0.13...0.23),
                ("REM", rem, LifeOSColor.SleepStage.rem, 0.20...0.25),
                ("Light", light, LifeOSColor.SleepStage.light, nil),
                ("Awake", awake, LifeOSColor.SleepStage.awake, nil),
            ]
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel("Last night's sleep architecture")
                    GeometryReader { geo in
                        HStack(spacing: 2) {
                            ForEach(rows, id: \.name) { r in
                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                    .fill(r.tint)
                                    .frame(width: max(0, geo.size.width * Double(r.mins) / Double(total) - 2))
                            }
                        }
                    }
                    .frame(height: 10)
                    ForEach(rows, id: \.name) { r in
                        let pct = Double(r.mins) / Double(asleep)
                        HStack(spacing: 8) {
                            Circle().fill(r.tint).frame(width: 8, height: 8)
                            Text(r.name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(LifeOSColor.fg)
                            Spacer(minLength: 4)
                            if let ideal = r.ideal {
                                let inRange = ideal.contains(pct)
                                let label = inRange ? "ideal" : (pct < ideal.lowerBound ? "low" : "high")
                                let c = inRange ? LifeOSColor.success : LifeOSColor.warning
                                Text(label.uppercased())
                                    .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                                    .foregroundStyle(c)
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .background(Capsule().fill(c.opacity(0.15)))
                            }
                            Text("\(Int((pct * 100).rounded()))%")
                                .font(.system(size: 12, weight: .medium).monospacedDigit())
                                .foregroundStyle(LifeOSColor.fg3)
                                .frame(width: 40, alignment: .trailing)
                            Text(hm(r.mins))
                                .font(.system(size: 13, weight: .bold).monospacedDigit())
                                .foregroundStyle(r.tint)
                                .frame(width: 56, alignment: .trailing)
                        }
                    }
                    Text("Ideal targets — deep 13–23%, REM 20–25% of time asleep.")
                        .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    private func hm(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    // MARK: - How to improve

    private var improveCard: some View {
        let tips = RecoveryAdvisor.tips(
            result: result,
            daily: daily,
            sleepGoalHours: sleepGoalHours
        )
        return Card {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel("How to improve")
                Text("Tailored to what moved your score today — most actionable first.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .padding(.bottom, 6)
                ForEach(Array(tips.enumerated()), id: \.element.id) { idx, tip in
                    RecoveryTipRow(tip: tip)
                    if idx < tips.count - 1 {
                        Divider().overlay(LifeOSColor.stroke)
                    }
                }
            }
        }
    }

    // MARK: - Recommended strain

    @ViewBuilder
    private var recommendedStrainCard: some View {
        if let range = result.recommendedStrain {
            Card(tint: LifeOSColor.Metric.strain) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Today's strain target")
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(String(format: "%.0f–%.0f", range.lowerBound, range.upperBound))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(LifeOSColor.Metric.strain)
                        Text("of 21")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    // Track showing the suggested window on the 0...21 scale.
                    GeometryReader { geo in
                        let w = geo.size.width
                        Capsule()
                            .fill(LifeOSColor.Metric.strain.opacity(0.15))
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(LifeOSColor.Metric.strain)
                                    .frame(width: max(4, w * (range.upperBound - range.lowerBound) / 21.0))
                                    .offset(x: w * range.lowerBound / 21.0)
                            }
                    }
                    .frame(height: 8)
                    Text(strainGuidance)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                }
            }
        }
    }

    private var strainGuidance: String {
        switch result.band {
        case .high:   return "Your body is ready for a heavy session."
        case .medium: return "A moderate effort keeps you balanced today."
        case .low:    return "Keep it light — active recovery beats grinding."
        }
    }

    // MARK: - Partial note

    private var isPartial: Bool {
        !result.baselineReady || !result.missingInputs.isEmpty
    }

    private var partialNote: some View {
        Card {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(LifeOSColor.warning)
                VStack(alignment: .leading, spacing: 4) {
                    Text(result.baselineReady ? "Partial reading" : "Learning your baseline")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    Text(partialDetail)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var partialDetail: String {
        if !result.baselineReady {
            return "A few more nights of watch data sharpens the HRV and resting-HR baselines this score leans on."
        }
        let labels = result.missingInputs.joined(separator: ", ")
        return "Scored from the inputs we had. Missing today: \(labels)."
    }
}

// MARK: - Recovery improvement advisor

/// One actionable recommendation with the "why" behind it.
struct RecoveryTip: Identifiable {
    let id = UUID()
    let icon: String
    let tag: String
    let title: String
    let detail: String
    let tint: Color
}

/// Turns a recovery result + the day's logged context into a prioritized,
/// personalized set of "how to improve" recommendations. Behavioral choices
/// the user actually logged come first (direct cause→effect, highest
/// leverage), then the weakest physiological drivers, then data gaps. Purely
/// rule-based — instant, offline, and free, so it never depends on AI quota.
enum RecoveryAdvisor {
    static func tips(
        result: RecoveryResult,
        daily: DailyEntry,
        sleepGoalHours: Double
    ) -> [RecoveryTip] {
        var tips: [RecoveryTip] = []

        func driver(_ label: String) -> RecoveryResult.Driver? {
            result.drivers.first { $0.label == label }
        }
        // A driver is "weak" when it pulled the score down meaningfully.
        func isWeak(_ label: String) -> Bool { (driver(label)?.impact ?? 0) < -0.02 }

        // 1) Behavioral choices logged today — direct cause→effect.
        if daily.alcoholYesterday {
            tips.append(RecoveryTip(
                icon: "wineglass.fill", tag: "Habits",
                title: "Skip the nightcap tonight",
                detail: "Alcohol fragments REM and blunts overnight HRV for 24–48h. A dry night usually shows up as a noticeably greener score.",
                tint: LifeOSColor.danger))
        }
        if daily.caffeineAfter2pm {
            tips.append(RecoveryTip(
                icon: "cup.and.saucer.fill", tag: "Habits",
                title: "Cut caffeine after ~2pm",
                detail: "Caffeine has a ~6h half-life, so an afternoon coffee keeps your nervous system elevated at night and trims deep sleep and HRV.",
                tint: LifeOSColor.warning))
        }
        if daily.lateEating {
            tips.append(RecoveryTip(
                icon: "fork.knife", tag: "Habits",
                title: "Finish eating earlier",
                detail: "Late meals raise core body temperature and keep digestion running overnight, which suppresses deep sleep. Aim for 2–3h before bed.",
                tint: LifeOSColor.warning))
        }
        if daily.screenBeforeBed {
            tips.append(RecoveryTip(
                icon: "iphone", tag: "Habits",
                title: "Screens off 30–60 min before bed",
                detail: "Blue light and late stimulation delay melatonin and push back sleep onset. A real wind-down improves both duration and stage quality.",
                tint: LifeOSColor.Metric.sleep))
        }
        if let stress = daily.stressLevel, stress >= 4 {
            tips.append(RecoveryTip(
                icon: "wind", tag: "Stress",
                title: "Downshift before bed",
                detail: "Sustained stress keeps you sympathetic-dominant — the single biggest drag on HRV. Five minutes of slow breathing (in 4 / out 6) flips you into recovery mode.",
                tint: LifeOSColor.Metric.hrv))
        }

        // 2) Weakest physiological drivers.
        if isWeak("HRV") || result.missingInputs.contains("HRV") {
            tips.append(RecoveryTip(
                icon: "waveform.path.ecg", tag: "HRV",
                title: "Protect your HRV",
                detail: "HRV is your dominant recovery signal. Consistent sleep and wake times, good hydration, limiting alcohol, and easy-day training all nudge it up over 1–2 weeks.",
                tint: LifeOSColor.Metric.hrv))
        }
        if isWeak("Resting HR") {
            tips.append(RecoveryTip(
                icon: "heart.fill", tag: "Resting HR",
                title: "Bring resting HR down",
                detail: "An elevated resting HR points to incomplete recovery, dehydration, or oncoming illness. Hydrate well, ease intensity, and watch alcohol and late caffeine.",
                tint: LifeOSColor.Metric.rhr))
        }

        // 3) Sleep — duration, stage architecture, multi-night debt.
        if let hours = daily.sleepHours, hours < sleepGoalHours - 0.5 {
            tips.append(RecoveryTip(
                icon: "bed.double.fill", tag: "Sleep",
                title: "Bank more sleep",
                detail: String(
                    format: "You slept %.1fh — about %.1fh under your %.0fh goal. An earlier bedtime is the fastest lever; even 30 minutes compounds.",
                    hours, sleepGoalHours - hours, sleepGoalHours),
                tint: LifeOSColor.Metric.sleep))
        }
        if let deep = daily.sleepDeepMin, let rem = daily.sleepREMMin,
           let light = daily.sleepLightMin {
            let asleep = max(1, deep + rem + light)
            if Double(deep) / Double(asleep) < 0.13 {
                tips.append(RecoveryTip(
                    icon: "moon.stars.fill", tag: "Deep sleep",
                    title: "Chase more deep sleep",
                    detail: "Deep sleep ran low — it's when your body physically repairs. A cool (~65°F), dark room, no late alcohol, and a consistent bedtime all increase it.",
                    tint: LifeOSColor.SleepStage.deep))
            }
            if Double(rem) / Double(asleep) < 0.18 {
                tips.append(RecoveryTip(
                    icon: "brain.head.profile", tag: "REM",
                    title: "Support REM sleep",
                    detail: "REM (mental recovery) was light. It concentrates in the back half of the night, so full duration and skipping the nightcap protect it most.",
                    tint: LifeOSColor.SleepStage.rem))
            }
        }
        if isWeak("Sleep debt") {
            tips.append(RecoveryTip(
                icon: "calendar", tag: "Sleep debt",
                title: "Pay down sleep debt",
                detail: "Several short nights have stacked up. One long sleep won't fully clear it — aim for a few consistent nights at or above goal.",
                tint: LifeOSColor.Metric.sleep))
        }

        // 4) Yesterday's load.
        if isWeak("Prior strain") {
            tips.append(RecoveryTip(
                icon: "figure.cooldown", tag: "Load",
                title: "Recover from yesterday's load",
                detail: "Yesterday was demanding. Prioritize protein, hydration, and an easy or active-recovery day so the adaptation actually sticks.",
                tint: LifeOSColor.Metric.strain))
        }

        // 5) Stage-data gap (HRV gap already covered above).
        if result.missingInputs.contains("Sleep stages") {
            tips.append(RecoveryTip(
                icon: "applewatch", tag: "Data",
                title: "Wear your tracker overnight",
                detail: "No stage breakdown came through for last night. Sleeping with your watch or band lets the score weigh deep and REM quality, not just hours.",
                tint: LifeOSColor.fg2))
        }

        // 6) Everything's in a good place — reinforce the routine.
        if tips.isEmpty {
            tips.append(RecoveryTip(
                icon: "checkmark.seal.fill", tag: "On track",
                title: "Keep doing what you're doing",
                detail: "Your inputs are all in a good place. Hold your sleep schedule, stay hydrated, and you can confidently take on today's strain target.",
                tint: LifeOSColor.success))
        }

        return tips
    }
}

/// One recommendation row: an icon chip, the action, a category tag, and the
/// physiological "why" behind it.
private struct RecoveryTipRow: View {
    let tip: RecoveryTip

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(tip.tint.opacity(0.16))
                Image(systemName: tip.icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(tip.tint)
            }
            .frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(tip.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    Text(tip.tag.uppercased())
                        .font(.system(size: 8, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(tip.tint)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Capsule().fill(tip.tint.opacity(0.14)))
                }
                Text(tip.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
    }
}

/// One driver row: label + detail on the left, a signed impact bar tinted by
/// the driver's metric color on the right. Bars grow right for positive impact
/// (pushed recovery up) and left for negative.
private struct DriverRow: View {
    let driver: RecoveryResult.Driver

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(driver.label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Spacer()
                Text(driver.detail)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(LifeOSColor.fg2)
            }
            GeometryReader { geo in
                let half = geo.size.width / 2
                let mag = min(1, abs(driver.impact)) * half
                ZStack(alignment: .center) {
                    Capsule()
                        .fill(LifeOSColor.stroke)
                        .frame(height: 6)
                    Rectangle()
                        .fill(LifeOSColor.strokeStrong)
                        .frame(width: 1, height: 10)  // neutral center marker
                    Capsule()
                        .fill(driver.tint)
                        .frame(width: max(2, mag), height: 6)
                        .offset(x: driver.impact >= 0 ? mag / 2 : -mag / 2)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 12)
        }
    }
}
