import SwiftUI

/// Presented breakdown of the day's strain. Big strain-tinted ring + band,
/// the cardio-vs-mechanical components that built it, a scrubbable strain
/// trend, a this-week-vs-last-week load read, band guidance ("how to train
/// today"), and rule-based strain-management tips. Wraps itself in a
/// NavigationStack so it renders its own title bar + Done button whether the
/// integrator shows it as a sheet or a full-screen cover — mirrors
/// RecoveryDetailView.
struct StrainDetailView: View {
    let strain: StrainCalculator.Score
    /// All lift sessions — the trend + weekly load are derived from these.
    let sessions: [LiftSessionEntry]
    /// All daily rows — supply the per-day cardio signals for the trend.
    let dailies: [DailyEntry]

    @Environment(\.dismiss) private var dismiss

    private var tint: Color { LifeOSColor.Metric.strain }

    /// The strain history powering the trend + weekly comparison. Trailing
    /// 21 days ending today, chronological. Built once per render.
    private var series: [TrendPoint] {
        StrainCalculator.daySeries(sessions: sessions, dailies: dailies, days: 21, asOf: Date())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    hero
                    if !strain.components.isEmpty { driversCard }
                    trendCard
                    weeklyLoadCard
                    guidanceCard
                    tipsCard
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Strain")
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
                        progress: min(1, max(0, strain.value / 21.0)),
                        value: String(format: "%.1f", strain.value),
                        label: "STRAIN",
                        tint: tint,
                        size: 150
                    )
                }
                Text(headline)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(LifeOSColor.fg)
                Text(bandLabel)
                    .font(.system(size: 11, weight: .heavy)).tracking(1.0)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.15)))
                Text(oneLineRead)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var headline: String {
        switch strain.band {
        case .rest:     return "Rest day"
        case .light:    return "Light day"
        case .moderate: return "Moderate day"
        case .hard:     return "Hard day"
        case .allOut:   return "All-out day"
        }
    }

    private var bandLabel: String {
        switch strain.band {
        case .rest:     return "RECOVERY"
        case .light:    return "EASY LOAD"
        case .moderate: return "BALANCED LOAD"
        case .hard:     return "HIGH LOAD"
        case .allOut:   return "MAXIMAL LOAD"
        }
    }

    private var oneLineRead: String {
        switch strain.band {
        case .rest:     return "Barely any load today — your body is banking recovery."
        case .light:    return "A light day. Plenty of room left in the tank to push tomorrow."
        case .moderate: return "A solid, sustainable day of work — the kind you can repeat."
        case .hard:     return "A demanding day. Make tonight's recovery count."
        case .allOut:   return "You emptied the tank. Prioritize sleep, food, and an easy day next."
        }
    }

    // MARK: - What's driving it

    private var driversCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel("What's driving it")
                ForEach(strain.components) { component in
                    StrainComponentRow(component: component)
                }
                Text("Cardio and mechanical load combine in quadrature — a hard lift plus a long walk don't simply add up.")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Trend

    @ViewBuilder
    private var trendCard: some View {
        let pts = series
        if pts.count >= 3 {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Strain trend")
                    ScrubbableTrendChart(
                        points: pts,
                        tint: tint,
                        showPoints: pts.count <= 21,
                        valueFormat: { String(format: "%.1f", $0) },
                        yDomain: 0...21,
                        deltaCaption: true,
                        deltaHigherIsBetter: true
                    )
                    .frame(height: 120)
                    Text("Your daily load over the last few weeks — drag to read any day.")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    // MARK: - Weekly load

    @ViewBuilder
    private var weeklyLoadCard: some View {
        let pts = series
        let thisWeek = Array(pts.suffix(7))
        let lastWeek = Array(pts.dropLast(7).suffix(7))
        if !thisWeek.isEmpty {
            let thisTotal = thisWeek.reduce(0.0) { $0 + $1.value }
            let thisAvg = thisTotal / Double(thisWeek.count)
            let lastTotal = lastWeek.reduce(0.0) { $0 + $1.value }
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel("Weekly load")
                    HStack(spacing: 12) {
                        weeklyStat("7-DAY TOTAL", String(format: "%.0f", thisTotal))
                        weeklyStat("DAILY AVG", String(format: "%.1f", thisAvg))
                    }
                    if !lastWeek.isEmpty {
                        let delta = thisTotal - lastTotal
                        let pct = lastTotal > 0 ? delta / lastTotal * 100 : 0
                        HStack(spacing: 6) {
                            Image(systemName: delta >= 0 ? "arrow.up.right" : "arrow.down.right")
                                .font(.system(size: 11, weight: .bold))
                            Text(String(format: "%@%.0f%% vs last week", delta >= 0 ? "+" : "−", abs(pct)))
                                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                        }
                        .foregroundStyle(deltaTint(pct))
                    }
                    Text(weeklyRead(thisTotal: thisTotal, lastTotal: lastTotal, hasLast: !lastWeek.isEmpty))
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func weeklyStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded)).monospacedDigit()
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12).padding(.horizontal, 14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint.opacity(0.08))
        )
    }

    /// A meaningful weekly jump is a load-management red flag (acute spikes
    /// drive injury risk), so a rise here is NOT styled as "good" the way a
    /// single day's strain is — past ~30% up reads as caution.
    private func deltaTint(_ pct: Double) -> Color {
        if pct > 30 { return LifeOSColor.warning }
        if pct < -40 { return LifeOSColor.fg2 }
        return LifeOSColor.success
    }

    private func weeklyRead(thisTotal: Double, lastTotal: Double, hasLast: Bool) -> String {
        guard hasLast, lastTotal > 0 else {
            return "A baseline week. Two weeks of history unlocks the week-over-week comparison."
        }
        let pct = (thisTotal - lastTotal) / lastTotal * 100
        if pct > 40 {
            return "A sharp jump in load. Big week-over-week spikes are the classic injury setup — let recovery catch up before pushing further."
        }
        if pct > 15 {
            return "Load is trending up — a healthy progression as long as recovery keeps pace."
        }
        if pct < -40 {
            return "A much lighter week. If it wasn't a planned deload, you've got room to add work back in."
        }
        if pct < -15 {
            return "Load eased off this week — useful if you were stacking up fatigue."
        }
        return "Load is holding steady week over week — consistent training is what drives adaptation."
    }

    // MARK: - Band guidance

    private var guidanceCard: some View {
        Card(tint: tint) {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("How to train today")
                ForEach(Self.bands) { b in
                    BandGuideRow(band: b, active: b.matches(strain.value))
                }
            }
        }
    }

    /// The five strain bands with their 0...21 ranges + a recommendation,
    /// mirroring StrainCalculator's band cutoffs (<4 / 4–9 / 9–14 / 14–18 /
    /// 18+). The row matching today's value is highlighted.
    private static let bands: [BandGuide] = [
        BandGuide(name: "Rest", range: 0..<4,
                  detail: "Minimal load. A true recovery day — easy movement, mobility, a walk.",
                  tint: LifeOSColor.success),
        BandGuide(name: "Light", range: 4..<9,
                  detail: "Easy session or steady cardio. Builds your base without digging a hole.",
                  tint: LifeOSColor.Metric.steps),
        BandGuide(name: "Moderate", range: 9..<14,
                  detail: "A balanced, repeatable day of real work — the bread and butter of training.",
                  tint: LifeOSColor.warning),
        BandGuide(name: "Hard", range: 14..<18,
                  detail: "A demanding session. Worth it on a high-recovery day; back it up with sleep and fuel.",
                  tint: LifeOSColor.Metric.strain),
        BandGuide(name: "All-out", range: 18..<22,
                  detail: "Maximal effort. Sustainable only occasionally — follow it with deliberate recovery.",
                  tint: LifeOSColor.danger),
    ]

    // MARK: - Tips

    private var tipsCard: some View {
        let tips = StrainAdvisor.tips(strain: strain, series: series)
        return Card {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel("Managing strain")
                Text("Rule-based cues for balancing load against recovery.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .padding(.bottom, 6)
                ForEach(Array(tips.enumerated()), id: \.element.id) { idx, tip in
                    StrainTipRow(tip: tip)
                    if idx < tips.count - 1 {
                        Divider().overlay(LifeOSColor.stroke)
                    }
                }
            }
        }
    }
}

// MARK: - Band guide model + row

/// One strain band on the 0...21 scale with a training recommendation.
struct BandGuide: Identifiable {
    let id = UUID()
    let name: String
    let range: Range<Double>
    let detail: String
    let tint: Color

    func matches(_ value: Double) -> Bool { range.contains(value) }
}

private struct BandGuideRow: View {
    let band: BandGuide
    let active: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Text(String(format: "%g", band.range.lowerBound))
                    .font(.system(size: 13, weight: .bold, design: .rounded)).monospacedDigit()
                    .foregroundStyle(band.tint)
                Text("–\(Int(band.range.upperBound))")
                    .font(.system(size: 9, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(width: 34)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(band.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    if active {
                        Text("TODAY")
                            .font(.system(size: 8, weight: .heavy)).tracking(0.8)
                            .foregroundStyle(band.tint)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(band.tint.opacity(0.16)))
                    }
                }
                Text(band.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 3)
        .opacity(active ? 1 : 0.62)
    }
}

// MARK: - Component row

/// One strain driver: label + detail on top, a proportion bar tinted by the
/// component's color sized to its share of the combined load, with the
/// component's 0...21 value at the trailing edge.
private struct StrainComponentRow: View {
    let component: StrainCalculator.StrainComponent

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(component.label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Spacer()
                Text("\(Int((component.share * 100).rounded()))%")
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundStyle(component.tint)
            }
            GeometryReader { geo in
                Capsule()
                    .fill(LifeOSColor.stroke)
                    .frame(height: 6)
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(component.tint)
                            .frame(width: max(2, geo.size.width * component.share), height: 6)
                    }
            }
            .frame(height: 6)
            HStack {
                Text(component.detail)
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg2)
                Spacer()
                Text(String(format: "%.1f", component.value))
                    .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }
}

// MARK: - Strain advisor

/// One strain-management cue with the "why" behind it.
struct StrainTip: Identifiable {
    let id = UUID()
    let icon: String
    let tag: String
    let title: String
    let detail: String
    let tint: Color
}

/// Turns today's strain + the recent load series into prioritized,
/// rule-based strain-management cues — recovery balance, progressive
/// overload, deload timing. Purely rule-based: instant, offline, free, no
/// AI dependency. Mirrors RecoveryAdvisor's shape and voice.
enum StrainAdvisor {
    static func tips(strain: StrainCalculator.Score, series: [TrendPoint]) -> [StrainTip] {
        var tips: [StrainTip] = []

        let recent = series.suffix(7)
        let avg7 = recent.isEmpty ? 0 : recent.reduce(0.0) { $0 + $1.value } / Double(recent.count)

        // Count trailing consecutive demanding days (>= hard threshold) so we
        // can flag stacked load before recovery has caught up.
        var consecutiveHard = 0
        for p in series.reversed() {
            if p.value >= 14 { consecutiveHard += 1 } else { break }
        }
        // Trailing consecutive rest/near-rest days — the cue for adding load.
        var consecutiveEasy = 0
        for p in series.reversed() {
            if p.value < 4 { consecutiveEasy += 1 } else { break }
        }

        // 1) Today's load is high — recovery balance is the priority.
        if strain.band == .allOut || strain.band == .hard {
            tips.append(StrainTip(
                icon: "figure.cooldown", tag: "Recovery",
                title: "Bank recovery tonight",
                detail: "Today was a heavy day. Protein, hydration, and a full night's sleep are what turn that load into adaptation rather than fatigue.",
                tint: LifeOSColor.Metric.strain))
        }

        // 2) Multiple hard days stacked without a break.
        if consecutiveHard >= 3 {
            tips.append(StrainTip(
                icon: "exclamationmark.triangle.fill", tag: "Load",
                title: "Work in an easy day",
                detail: "You've stacked \(consecutiveHard) demanding days in a row. Fatigue compounds faster than fitness — an easy or rest day now protects the next hard one.",
                tint: LifeOSColor.warning))
        }

        // 3) Acute spike vs the trailing average.
        if avg7 > 0 && strain.value > avg7 * 1.6 && strain.value >= 9 {
            tips.append(StrainTip(
                icon: "chart.line.uptrend.xyaxis", tag: "Spike",
                title: "Mind the spike",
                detail: String(format: "Today's load is well above your ~%.0f average. Big single-day jumps are the classic injury setup — fine occasionally, risky as a habit.", avg7),
                tint: LifeOSColor.danger))
        }

        // 4) Lots of easy days — room to progress.
        if consecutiveEasy >= 3 {
            tips.append(StrainTip(
                icon: "arrow.up.forward", tag: "Overload",
                title: "Add load progressively",
                detail: "Several light days in a row. If you're feeling fresh, nudge volume or intensity up — gradual progressive overload is what drives adaptation.",
                tint: LifeOSColor.Metric.steps))
        }

        // 5) Sustained high weekly average — deload cue.
        if avg7 >= 14 {
            tips.append(StrainTip(
                icon: "calendar.badge.exclamationmark", tag: "Deload",
                title: "Consider a deload soon",
                detail: "Your daily load has run high all week. After 3–4 weeks of building, a planned deload week lets adaptations consolidate and dissipates accumulated fatigue.",
                tint: LifeOSColor.Metric.sleep))
        }

        // 6) Everything balanced — reinforce consistency.
        if tips.isEmpty {
            tips.append(StrainTip(
                icon: "checkmark.seal.fill", tag: "Balanced",
                title: "Load is well balanced",
                detail: "Your training load and recovery are in a good place. Stay consistent — repeatable moderate days beat heroic-then-burned-out cycles every time.",
                tint: LifeOSColor.success))
        }

        return tips
    }
}

/// One tip row: icon chip, the cue, a category tag, and the "why" — matches
/// RecoveryTipRow's layout so the two detail sheets read identically.
private struct StrainTipRow: View {
    let tip: StrainTip

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
