import SwiftUI

/// Analysis-tab card surfacing `SleepQualityEngine`'s read on last night plus
/// the multi-night picture: a 0…100 quality score with a per-pillar breakdown
/// (duration / deep / REM / efficiency), a plain-language sleep-debt line, and
/// a scrubbable deep/REM architecture trend.
///
/// Inputs are injected (no @Query) so the orchestrator can place this wherever
/// the right `daily` + `history` live — typically the wake-day's DailyEntry as
/// `daily` and the trailing window (excluding that day) as `history`.
struct SleepQualityCard: View {
    let daily: DailyEntry?
    let history: [DailyEntry]
    let goalHours: Double

    /// Which architecture series the trend chart is showing.
    @State private var arch: ArchSeries = .deep

    private enum ArchSeries: String, CaseIterable {
        case deep = "Deep"
        case rem = "REM"
    }

    private var quality: SleepQuality? {
        guard let daily else { return nil }
        return SleepQualityEngine.score(for: daily, goalHours: goalHours)
    }

    var body: some View {
        Card(tint: LifeOSColor.Metric.sleep) {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let q = quality {
                    scoreRow(q)
                    componentBreakdown(q)
                    debtRow
                    consistencyRow
                    archTrend
                } else {
                    emptyState
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(
                    LinearGradient(
                        colors: [LifeOSColor.SleepStage.deep, LifeOSColor.SleepStage.rem],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
            }
            .frame(width: 22, height: 22)
            Text("SLEEP QUALITY")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
        }
    }

    // MARK: - Score + headline

    private func scoreRow(_ q: SleepQuality) -> some View {
        HStack(alignment: .center, spacing: 16) {
            scoreRing(q.score)
            VStack(alignment: .leading, spacing: 4) {
                Text(q.headline)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Last night")
                    .font(.system(size: 11, weight: .medium)).tracking(0.4)
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer(minLength: 0)
        }
    }

    private func scoreRing(_ score: Int) -> some View {
        let tint = scoreTint(score)
        return ZStack {
            Circle()
                .stroke(LifeOSColor.elevated, lineWidth: 6)
            Circle()
                .trim(from: 0, to: CGFloat(score) / 100)
                .stroke(
                    AngularGradient(
                        colors: [tint.opacity(0.7), tint],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)")
                    .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg)
                Text("/100")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .frame(width: 64, height: 64)
    }

    // MARK: - Component breakdown

    private func componentBreakdown(_ q: SleepQuality) -> some View {
        VStack(spacing: 10) {
            ForEach(q.components) { c in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(c.label)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg)
                        Spacer()
                        Text(c.detail)
                            .font(.system(size: 11, weight: .medium).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(LifeOSColor.elevated)
                            Capsule().fill(c.tint)
                                .frame(width: max(2, geo.size.width * CGFloat(c.value) / 100))
                        }
                    }
                    .frame(height: 6)
                }
            }
        }
    }

    // MARK: - Sleep debt

    private var debtRow: some View {
        let debt = SleepQualityEngine.debtHours(history: history, goalHours: goalHours)
        let read = SleepQualityEngine.debtRead(history: history, goalHours: goalHours)
        let tint = debtTint(debt)
        return HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(tint.opacity(0.15))
                Image(systemName: debt < 0.5 ? "checkmark" : "hourglass")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(tint)
            }
            .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("SLEEP DEBT")
                    .font(.system(size: 9, weight: .heavy)).tracking(1)
                    .foregroundStyle(LifeOSColor.fg3)
                Text(read)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 2)
    }

    // MARK: - Consistency

    @ViewBuilder
    private var consistencyRow: some View {
        if let read = SleepQualityEngine.consistencyRead(history: history, goalHours: goalHours),
           let score = SleepQualityEngine.consistencyScore(history: history, goalHours: goalHours) {
            let tint = scoreTint(score)
            HStack(alignment: .top, spacing: 10) {
                ZStack {
                    Circle().fill(tint.opacity(0.15))
                    Image(systemName: "calendar")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(tint)
                }
                .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("CONSISTENCY")
                            .font(.system(size: 9, weight: .heavy)).tracking(1)
                            .foregroundStyle(LifeOSColor.fg3)
                        Text("\(score)")
                            .font(.system(size: 9, weight: .heavy).monospacedDigit())
                            .foregroundStyle(tint)
                    }
                    Text(read)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - Architecture trend

    @ViewBuilder
    private var archTrend: some View {
        let points = arch == .deep
            ? SleepQualityEngine.deepTrend(history: trendHistory)
            : SleepQualityEngine.remTrend(history: trendHistory)

        if points.count >= 2 {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("ARCHITECTURE")
                        .font(.system(size: 9, weight: .heavy)).tracking(1)
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    archToggle
                }
                ScrubbableTrendChart(
                    points: points,
                    tint: arch == .deep ? LifeOSColor.SleepStage.deep : LifeOSColor.SleepStage.rem,
                    average: averageOf(points),
                    valueFormat: { "\(Int($0.rounded()))m" },
                    yAxisFormat: { "\(Int($0.rounded()))" },
                    deltaCaption: true,
                    deltaHigherIsBetter: true
                )
                .frame(height: 120)
            }
        }
    }

    private var archToggle: some View {
        HStack(spacing: 4) {
            ForEach(ArchSeries.allCases, id: \.self) { series in
                let active = arch == series
                let tint = series == .deep ? LifeOSColor.SleepStage.deep : LifeOSColor.SleepStage.rem
                Button {
                    Haptics.tap()
                    arch = series
                } label: {
                    Text(series.rawValue)
                        .font(.system(size: 10, weight: .bold)).tracking(0.4)
                        .foregroundStyle(active ? .white : LifeOSColor.fg3)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(
                            Capsule().fill(active ? tint : LifeOSColor.elevated)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        EmptyStateCard(
            icon: "moon.zzz.fill",
            title: "No sleep logged for this night",
            subtitle: "Once last night's sleep syncs, you'll see a quality score, the deep/REM breakdown, and how much sleep debt you're carrying.",
            tint: LifeOSColor.Metric.sleep
        )
    }

    // MARK: - Helpers

    /// The trend window combines the focused night with its history so the
    /// rightmost point on the chart is last night, not the night before.
    private var trendHistory: [DailyEntry] {
        guard let daily else { return history }
        return history + [daily]
    }

    private func averageOf(_ points: [TrendPoint]) -> Double? {
        guard !points.isEmpty else { return nil }
        return points.reduce(0.0) { $0 + $1.value } / Double(points.count)
    }

    /// 0…100 → red / amber / green, reusing the central recovery banding so
    /// score colors read identically across the app.
    private func scoreTint(_ score: Int) -> Color {
        LifeOSColor.recovery(score)
    }

    /// Debt colors invert: low debt is good (green), high debt is bad (red).
    private func debtTint(_ debt: Double) -> Color {
        switch debt {
        case ..<0.5:  return LifeOSColor.success
        case 0.5..<4: return LifeOSColor.warning
        default:      return LifeOSColor.danger
        }
    }
}
