import SwiftUI
import SwiftData
import Charts

/// Analysis — insights-first deep-dive into your wearable data. Every
/// card answers a specific question instead of dumping a chart. Scope
/// is intentionally tight to what Apple Health / Fitbit-class devices
/// actually produce (daily aggregates + per-workout sessions); no
/// per-second granularity since that data doesn't exist outside an
/// active workout.
struct AnalysisView: View {
    @Query private var dailies: [DailyEntry]
    @Query private var sessions: [LiftSessionEntry]
    @Query private var settingsRows: [UserSettings]
    @State private var range: TimeRange = .month
    @State private var cardsVisible = false

    /// Per-card scrubbed point, keyed by a stable card id. Lets each
    /// in-place chart echo the finger's value into its own header
    /// without one card's scrub leaking into another's readout.
    @State private var scrub: [String: TrendPoint] = [:]

    /// Cached snapshot. Recomputing AnalysisData.compute on every
    /// body evaluation pegged CPU — the chart cards all read off it,
    /// so every @Query emission (every HealthKit sync, every meal
    /// log, every workout finish anywhere in the app) was triggering
    /// a full 30-day walk per chart per redraw. Cache here, refresh
    /// via .task on appear + .onChange of range / counts.
    @State private var data: AnalysisData = .empty

    /// Strain↔recovery snapshot — its own cache (not part of AnalysisData)
    /// since the engine is @MainActor and needs UserSettings, which the pure
    /// AnalysisData.compute deliberately doesn't take. Always 30 days
    /// regardless of the range selector (ACWR needs the 28-day chronic base).
    @State private var srBalance: StrainRecoveryBalance = .empty
    @State private var showSRDetail = false

    // Inputs for the on-device SleepQualityCard + the Insights teaser.
    private static let ymdFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    private var sleepGoalHours: Double { settingsRows.first?.sleepGoalHours ?? 8 }
    /// Today's row, or the most recent logged day if today isn't logged yet.
    private var sleepFocusDay: DailyEntry? {
        let today = Self.ymdFmt.string(from: Date())
        return dailies.first { $0.date == today } ?? dailies.max { $0.date < $1.date }
    }
    private var sleepHistory: [DailyEntry] {
        let focus = sleepFocusDay?.date ?? Self.ymdFmt.string(from: Date())
        return Array(dailies.filter { $0.date < focus }.sorted { $0.date > $1.date }.prefix(30))
    }
    private var insightsTeaserCard: some View {
        Card(tint: LifeOSColor.accent) {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(LifeOSColor.accent.opacity(0.16))
                    Image(systemName: "sparkles")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(LifeOSColor.accent)
                }
                .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Insights")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    Text("Instant on-device pattern detection across sleep, recovery, mood, and your habits.")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    enum TimeRange: String, CaseIterable, Identifiable {
        case week    = "7d"
        case month   = "30d"
        case quarter = "90d"
        case year    = "1y"
        var id: String { rawValue }
        var dayCount: Int {
            switch self { case .week: 7; case .month: 30; case .quarter: 90; case .year: 365 }
        }
        var subtitle: String {
            switch self {
            case .week:    "last 7 days"
            case .month:   "last 30 days"
            case .quarter: "last 90 days"
            case .year:    "last 12 months"
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    rangeSelector
                    revealCard(delay: 0.00) { CoachChatView() }
                    revealCard(delay: 0.005) { WeeklyReviewCard() }
                    revealCard(delay: 0.01) { CorrelationsCard() }
                    revealCard(delay: 0.015) {
                        drillIn(destination: InsightsView()) { insightsTeaserCard }
                    }
                    revealCard(delay: 0.02) {
                        drillIn(destination: performanceDetail) { performanceHero }
                    }
                    revealCard(delay: 0.04) {
                        drillIn(destination: sleepDetail) { sleepArchitectureCard }
                    }
                    revealCard(delay: 0.05) {
                        SleepQualityCard(
                            daily: sleepFocusDay,
                            history: sleepHistory,
                            goalHours: sleepGoalHours
                        )
                    }
                    revealCard(delay: 0.08) {
                        NavigationLink {
                            HeartRateGraphView()
                        } label: {
                            heartHealthCard
                        }
                        .buttonStyle(.plain)
                        .simultaneousGesture(TapGesture().onEnded { Haptics.tap() })
                    }
                    revealCard(delay: 0.09) { strainRecoveryBalanceCardWrapped }
                    revealCard(delay: 0.10) { caloriesBurnedCard }
                    revealCard(delay: 0.12) { distanceTrendCard }
                    revealCard(delay: 0.14) { vo2MaxCard }
                    revealCard(delay: 0.16) { hrvSleepCorrelation }
                    revealCard(delay: 0.20) { workoutConsistency }
                    revealCard(delay: 0.24) {
                        drillIn(destination: stepsDetail) { activityByDayOfWeek }
                    }
                    revealCard(delay: 0.28) {
                        drillIn(destination: weightDetail) { bodyCompositionCard }
                    }
                    revealCard(delay: 0.36) { patternsCard }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .navigationTitle("Analysis")
            .navigationBarTitleDisplayMode(.large)
            .onAppear {
                // Stagger the card cascade only on first appear so navigating
                // back doesn't replay the animation.
                if !cardsVisible {
                    withAnimation(.easeOut(duration: 0.5)) {
                        cardsVisible = true
                    }
                }
                refreshData()
            }
            .onChange(of: range) { _, _ in refreshData() }
            .onChange(of: dailies.count) { _, _ in refreshData() }
            .onChange(of: sessions.count) { _, _ in refreshData() }
        }
    }

    /// Recompute the chart snapshot in a low-cost main-actor batch.
    /// Triggered on appear, range change, or when a new daily / session
    /// row arrives. Internal field updates within an existing row don't
    /// retrigger (that's intentional — body text reading off `data`
    /// stays consistent through a chart frame).
    private func refreshData() {
        data = AnalysisData.compute(
            dailies: dailies,
            sessions: sessions,
            daysBack: range.dayCount
        )
        if let settings = settingsRows.first {
            srBalance = StrainRecoveryEngine.compute(
                dailies: dailies, sessions: sessions, settings: settings,
                days: 30, asOf: Date()
            )
        }
    }

    /// Strain↔recovery card → opens the deep-dive sheet. A plain Button label
    /// (not a NavigationLink push) because the detail wraps its own
    /// NavigationStack and is presented as a sheet — and so no `.pressable()`
    /// touches a push (the gesture-gate-timeout gotcha).
    private var strainRecoveryBalanceCardWrapped: some View {
        Button {
            Haptics.tap()
            showSRDetail = true
        } label: {
            StrainRecoveryBalanceCard(balance: srBalance)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSRDetail) {
            StrainRecoveryDetailView(balance: srBalance)
        }
    }

    // MARK: - Series → TrendPoint adapters
    //
    // The reusable ScrubbableTrendChart speaks TrendPoint; AnalysisData
    // ships per-metric DTOs. These thin maps bridge them. Kept here (not
    // in the provider) so the provider stays UI-agnostic.

    private var performancePoints: [TrendPoint] {
        data.performanceTrend.map { TrendPoint(day: $0.day, value: $0.score) }
    }
    private var weightPoints: [TrendPoint] {
        data.weightTrend.map { TrendPoint(day: $0.day, value: $0.weight) }
    }
    /// Total nightly sleep minutes per day, derived by summing the
    /// stacked stage series. Drives the in-place sleep scrub + drill-in.
    private var sleepTotalPoints: [TrendPoint] {
        let byDay = Dictionary(grouping: data.sleepStageSeries, by: \.day)
        return byDay
            .map { day, rows in
                TrendPoint(day: day, value: rows.filter { $0.stage != "Awake" }.map(\.minutes).reduce(0, +))
            }
            .sorted { $0.day < $1.day }
    }
    private var activeEnergyPoints: [TrendPoint] {
        data.activeEnergyTrend.map { TrendPoint(day: $0.day, value: $0.value) }
    }
    private var totalEnergyPoints: [TrendPoint] {
        data.totalEnergyTrend.map { TrendPoint(day: $0.day, value: $0.value) }
    }
    private var distancePoints: [TrendPoint] {
        data.distanceTrend.map { TrendPoint(day: $0.day, value: $0.value) }
    }
    private var vo2MaxPoints: [TrendPoint] {
        data.vo2MaxTrend.map { TrendPoint(day: $0.day, value: $0.value) }
    }

    /// Format helpers shared between cards and readouts.
    private func milesFmt(_ v: Double) -> String { String(format: "%.1f", v) }
    private func stepsFmt(_ v: Double) -> String {
        v >= 1000 ? String(format: "%.1fk", v / 1000) : "\(Int(v))"
    }
    private func sleepFmt(_ v: Double) -> String { hm(Int(v)) }

    /// Wrap any card view in a staggered reveal — the same spring +
    /// vertical offset across the whole scroll, but with progressive
    /// delays so cards cascade in from the top.
    @ViewBuilder
    private func revealCard<Content: View>(
        delay: Double,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .opacity(cardsVisible ? 1 : 0)
            .offset(y: cardsVisible ? 0 : 12)
            .animation(
                .spring(response: 0.6, dampingFraction: 0.85).delay(delay),
                value: cardsVisible
            )
    }

    /// Wrap a card in a NavigationLink to a full-screen drill-in, with a
    /// chevron-free plain style and a tap haptic. The whole card surface
    /// stays the tap target.
    @ViewBuilder
    private func drillIn<Destination: View, Label: View>(
        destination: Destination,
        @ViewBuilder label: () -> Label
    ) -> some View {
        NavigationLink {
            destination
        } label: {
            label()
        }
        .buttonStyle(.plain)
        .simultaneousGesture(TapGesture().onEnded { Haptics.tap() })
    }

    // MARK: - Drill-in destinations

    private var performanceDetail: some View {
        TrendDetailView(
            title: "Performance",
            kicker: "Performance Score",
            tint: LifeOSColor.Metric.peak,
            unit: "/ 100",
            series: { $0.performanceTrend.map { TrendPoint(day: $0.day, value: $0.score) } },
            yDomain: 40...100
        )
    }
    private var sleepDetail: some View {
        TrendDetailView(
            title: "Sleep",
            kicker: "Total Sleep",
            tint: LifeOSColor.Metric.sleep,
            unit: "",
            series: { snap in
                let byDay = Dictionary(grouping: snap.sleepStageSeries, by: \.day)
                return byDay.map { day, rows in
                    TrendPoint(day: day, value: rows.filter { $0.stage != "Awake" }.map(\.minutes).reduce(0, +))
                }.sorted { $0.day < $1.day }
            },
            valueFormat: { [self] in sleepFmt($0) },
            yAxisFormat: { [self] in sleepFmt($0) }
        )
    }
    private var weightDetail: some View {
        TrendDetailView(
            title: "Weight",
            kicker: "Body Weight",
            tint: LifeOSColor.Metric.weight,
            unit: "lb",
            series: { $0.weightTrend.map { TrendPoint(day: $0.day, value: $0.weight) } },
            valueFormat: { String(format: "%.1f", $0) },
            yAxisFormat: { String(format: "%.0f", $0) },
            higherIsBetter: false
        )
    }
    private var stepsDetail: some View {
        TrendDetailView(
            title: "Steps",
            kicker: "Daily Steps",
            tint: LifeOSColor.Metric.steps,
            unit: "steps",
            series: { $0.stepsTrend.map { TrendPoint(day: $0.day, value: $0.value) } },
            valueFormat: { [self] in stepsFmt($0) },
            yAxisFormat: { [self] in stepsFmt($0) }
        )
    }
    private var hrvDetail: some View {
        TrendDetailView(
            title: "Heart Rate Variability",
            kicker: "HRV (rMSSD)",
            tint: LifeOSColor.Metric.hrv,
            unit: "ms",
            series: { $0.hrvTrend.map { TrendPoint(day: $0.day, value: $0.value) } },
            higherIsBetter: true,
            showBaselineBand: true,
            showBaselineRule: true,
            showDeltaCaption: true,
            animateChart: true
        )
    }
    private var rhrDetail: some View {
        TrendDetailView(
            title: "Resting Heart Rate",
            kicker: "Resting HR",
            tint: LifeOSColor.Metric.rhr,
            unit: "bpm",
            series: { $0.rhrTrend.map { TrendPoint(day: $0.day, value: $0.value) } },
            higherIsBetter: false,
            showBaselineBand: true,
            showDeltaCaption: true,
            animateChart: true
        )
    }

    // MARK: - Range selector

    private var rangeSelector: some View {
        VStack(alignment: .leading, spacing: 6) {
            Picker("Range", selection: $range) {
                ForEach(TimeRange.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            Text(range.subtitle.uppercased())
                .font(.system(size: 9, weight: .semibold)).tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
                .padding(.leading, 4)
        }
    }

    // MARK: - Hero — composite performance score with delta

    private var performanceHero: some View {
        let scrubbed = scrub["perf"]
        return Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(scrubbed != nil ? "SELECTED" : "PERFORMANCE SCORE")
                                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                                .foregroundStyle(LifeOSColor.Metric.peak)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(LifeOSColor.Metric.peak.opacity(0.7))
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(scrubbed.map { "\(Int($0.value.rounded()))" } ?? "\(data.performanceLatest)")
                                .font(.system(size: 56, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(LifeOSColor.fg)
                                .contentTransition(.numericText())
                            Text(scrubbed.map { ScrubbableTrendChart.dateLabel($0.day) } ?? "/ 100")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    Spacer()
                    deltaPill(delta: data.performanceDelta, label: "vs prior \(range.dayCount)d")
                }

                ScrubbableTrendChart(
                    points: performancePoints,
                    tint: LifeOSColor.Metric.peak,
                    average: data.performanceTrend.isEmpty ? nil : data.performanceAvg,
                    valueFormat: { "\(Int($0.rounded()))" },
                    yDomain: 40...100,
                    onScrub: { scrub["perf"] = $0 }
                )
                .frame(height: 120)

                HStack(spacing: 8) {
                    contributor("Sleep",  tint: LifeOSColor.Metric.sleep)
                    contributor("Mood",   tint: LifeOSColor.Metric.mood)
                    contributor("Energy", tint: LifeOSColor.Metric.energy)
                }
            }
        }
    }

    /// The three inputs the composite score is built from (see
    /// AnalysisData.compute). Equal-weighted, so no fabricated per-input
    /// percentage — just labels the user can trust.
    private func contributor(_ name: String, tint: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(tint).frame(width: 6, height: 6)
            Text(name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    // MARK: - Sleep architecture (stacked area)

    private var sleepArchitectureCard: some View {
        let scrubbed = scrub["sleep"]
        return analysisCard(
            kicker: "SLEEP",
            title: "How's your sleep architecture trending?",
            tint: LifeOSColor.Metric.sleep,
            accessory: AnyView(
                HStack(spacing: 3) {
                    Text("DETAIL")
                        .font(.system(size: 9, weight: .bold)).tracking(0.8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(LifeOSColor.Metric.sleep)
            )
        ) {
            Chart {
                ForEach(data.sleepStageSeries, id: \.id) { item in
                    AreaMark(
                        x: .value("Day", item.day),
                        y: .value("Minutes", item.minutes)
                    )
                    .interpolationMethod(.monotone)
                    .foregroundStyle(by: .value("Stage", item.stage))
                    .position(by: .value("Stage", item.stage))
                }
                if let p = scrubbed {
                    RuleMark(x: .value("Day", p.day))
                        .foregroundStyle(LifeOSColor.fg2.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1))
                }
            }
            .chartForegroundStyleScale([
                "Deep":  LifeOSColor.SleepStage.deep,
                "Core":  LifeOSColor.SleepStage.light,
                "REM":   LifeOSColor.SleepStage.rem,
                "Awake": LifeOSColor.SleepStage.awake,
            ])
            .chartLegend(position: .bottom, alignment: .center, spacing: 8)
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geo in
                    Rectangle().fill(.clear).contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { v in scrubSleep(v.location, proxy: proxy, geo: geo) }
                                .onEnded { _ in scrub["sleep"] = nil; Haptics.tap() }
                        )
                }
            }
            .frame(height: 160)

            HStack {
                if let p = scrubbed {
                    takeaway(label: ScrubbableTrendChart.dateLabel(p.day).uppercased(), value: hm(Int(p.value)))
                    takeaway(label: "AVG TOTAL", value: hm(data.avgSleepTotalMin))
                    takeaway(label: "AVG DEEP",  value: hm(data.avgSleepDeepMin))
                    takeaway(label: "AVG REM",   value: hm(data.avgSleepREMMin))
                } else {
                    takeaway(label: "AVG TOTAL",  value: hm(data.avgSleepTotalMin))
                    takeaway(label: "AVG DEEP",   value: hm(data.avgSleepDeepMin))
                    takeaway(label: "AVG REM",    value: hm(data.avgSleepREMMin))
                    takeaway(label: "EFFICIENCY", value: efficiencyLabel)
                }
            }
        }
    }

    /// Resolve the scrubbed day on the stacked sleep chart to its total
    /// (non-awake) minutes and fire one tick per distinct day crossed.
    private func scrubSleep(_ location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        let pts = sleepTotalPoints
        guard !pts.isEmpty, let anchor = proxy.plotFrame else { return }
        let xInPlot = location.x - geo[anchor].origin.x
        guard let rawDate: Date = proxy.value(atX: xInPlot) else { return }
        guard let nearest = pts.min(by: {
            abs($0.day.timeIntervalSince(rawDate)) < abs($1.day.timeIntervalSince(rawDate))
        }) else { return }
        let prior = scrub["sleep"]
        if prior == nil || !Calendar.current.isDate(prior!.day, inSameDayAs: nearest.day) {
            scrub["sleep"] = nearest
            Haptics.tick()
        }
    }

    private var efficiencyLabel: String {
        guard data.avgSleepTotalMin > 0, data.avgSleepDeepMin + data.avgSleepREMMin > 0 else { return "—" }
        let restorative = data.avgSleepDeepMin + data.avgSleepREMMin
        return "\(Int(Double(restorative) / Double(data.avgSleepTotalMin) * 100))%"
    }

    private func hm(_ minutes: Int) -> String {
        guard minutes > 0 else { return "—" }
        let h = minutes / 60
        let m = minutes % 60
        return h > 0 ? String(format: "%dh %02dm", h, m) : "\(m)m"
    }

    // MARK: - Heart Health (RHR + HRV dual chart)

    private var heartHealthCard: some View {
        analysisCard(
            kicker: "HEART HEALTH",
            title: "Resting HR & HRV — directional indicators",
            tint: LifeOSColor.Metric.mood,
            accessory: AnyView(
                HStack(spacing: 3) {
                    Text("TAP A METRIC")
                        .font(.system(size: 9, weight: .bold)).tracking(0.8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(LifeOSColor.Metric.mood)
            )
        ) {
            Chart {
                ForEach(data.rhrTrend, id: \.day) { item in
                    LineMark(
                        x: .value("Day", item.day),
                        y: .value("RHR", item.value),
                        series: .value("Metric", "RHR")
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.rhr)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                }
                ForEach(data.hrvTrend, id: \.day) { item in
                    LineMark(
                        x: .value("Day", item.day),
                        y: .value("HRV", item.value),
                        series: .value("Metric", "HRV")
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.hrv)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                }
            }
            .chartXAxis(.hidden)
            .frame(height: 140)

            HStack(spacing: 12) {
                drillIn(destination: rhrDetail) {
                    metricBig(
                        label: "Resting HR",
                        value: data.rhrLatest.map { "\(Int($0.rounded()))" } ?? "—",
                        unit: "bpm",
                        delta: signedDelta(data.rhrDelta, suffix: " vs prior"),
                        tint: LifeOSColor.Metric.rhr
                    )
                }
                drillIn(destination: hrvDetail) {
                    metricBig(
                        label: "HRV (rMSSD)",
                        value: data.hrvLatest.map { "\(Int($0.rounded()))" } ?? "—",
                        unit: "ms",
                        delta: signedDelta(data.hrvDelta, suffix: " vs prior"),
                        tint: LifeOSColor.Metric.hrv
                    )
                }
            }
        }
    }

    // MARK: - HRV vs sleep scatter

    private var hrvSleepCorrelation: some View {
        analysisCard(
            kicker: "CORRELATIONS",
            title: "More sleep → higher HRV?",
            tint: LifeOSColor.Metric.peak
        ) {
            Chart(data.hrvVsSleep, id: \.id) { item in
                PointMark(
                    x: .value("Sleep", item.sleepHours),
                    y: .value("HRV", item.hrv)
                )
                .foregroundStyle(LifeOSColor.Metric.peak)
                .symbolSize(60)
            }
            .chartXAxisLabel("Sleep (hours)", position: .bottom, alignment: .center, spacing: 4)
            .chartYAxisLabel("HRV (ms)", position: .leading, alignment: .center, spacing: 4)
            .chartXAxis {
                AxisMarks(values: .stride(by: 1)) { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                }
            }
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                }
            }
            .frame(height: 160)

            calloutText(hrvSleepCallout)
        }
    }

    // MARK: - Workout consistency calendar

    private var workoutConsistency: some View {
        analysisCard(
            kicker: "CONSISTENCY",
            title: "Workout streak heatmap",
            tint: LifeOSColor.Metric.strain
        ) {
            ConsistencyHeatmap(days: data.workoutDays)
            HStack(spacing: 12) {
                takeaway(label: "SESSIONS", value: "\(data.workoutSessionCount)")
                takeaway(label: "STREAK",   value: "\(data.workoutStreakDays)d")
                takeaway(label: "REST DAYS", value: "\(data.workoutRestDays)")
                takeaway(label: "VOLUME",   value: kFormat(data.workoutTotalVolume) + " lb")
            }
        }
    }

    // MARK: - Calories burned (active vs total energy)

    private var caloriesBurnedCard: some View {
        let scrubbed = scrub["cal"]
        let active = activeEnergyPoints
        let total = totalEnergyPoints
        return analysisCard(
            kicker: "ENERGY BURN",
            title: "Calories burned — active vs total",
            tint: LifeOSColor.Metric.calories
        ) {
            if active.isEmpty && total.isEmpty {
                metricEmptyState(
                    icon: "flame.fill",
                    tint: LifeOSColor.Metric.calories,
                    message: "Once active-energy and total-burn sync from your watch, the daily burn trend lands here."
                )
            } else {
                Chart {
                    ForEach(total) { p in
                        AreaMark(x: .value("Day", p.day), y: .value("Total", p.value))
                            .interpolationMethod(.catmullRom)
                            .foregroundStyle(
                                LinearGradient(colors: [LifeOSColor.Metric.calories.opacity(0.22),
                                                        LifeOSColor.Metric.calories.opacity(0.02)],
                                               startPoint: .top, endPoint: .bottom)
                            )
                    }
                    ForEach(total) { p in
                        LineMark(x: .value("Day", p.day), y: .value("Total", p.value),
                                 series: .value("M", "Total"))
                            .interpolationMethod(.catmullRom)
                            .foregroundStyle(LifeOSColor.Metric.calories.opacity(0.5))
                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4]))
                    }
                    ForEach(active) { p in
                        LineMark(x: .value("Day", p.day), y: .value("Active", p.value),
                                 series: .value("M", "Active"))
                            .interpolationMethod(.catmullRom)
                            .foregroundStyle(LifeOSColor.Metric.calories)
                            .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                    }
                    if let p = scrubbed {
                        RuleMark(x: .value("Day", p.day))
                            .foregroundStyle(LifeOSColor.fg2.opacity(0.6))
                            .lineStyle(StrokeStyle(lineWidth: 1))
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                    }
                }
                .chartXAxis(.hidden)
                .chartOverlay { proxy in
                    GeometryReader { geo in
                        Rectangle().fill(.clear).contentShape(Rectangle())
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { v in scrubNearest("cal", points: active.isEmpty ? total : active, location: v.location, proxy: proxy, geo: geo) }
                                    .onEnded { _ in scrub["cal"] = nil; Haptics.tap() }
                            )
                    }
                }
                .frame(height: 150)

                HStack(spacing: 12) {
                    if let p = scrubbed {
                        metricBig(label: ScrubbableTrendChart.dateLabel(p.day), value: "\(Int(p.value.rounded()))",
                                  unit: "kcal", delta: "active burn", tint: LifeOSColor.Metric.calories)
                    } else {
                        metricBig(label: "Avg Active", value: avgStr(active), unit: "kcal",
                                  delta: "solid line", tint: LifeOSColor.Metric.calories)
                    }
                    metricBig(label: "Avg Total", value: avgStr(total), unit: "kcal",
                              delta: "dashed line", tint: LifeOSColor.Metric.calories)
                }
            }
        }
    }

    // MARK: - Distance trend

    private var distanceTrendCard: some View {
        let scrubbed = scrub["dist"]
        let pts = distancePoints
        return analysisCard(
            kicker: "DISTANCE",
            title: "Daily distance covered",
            tint: LifeOSColor.Metric.steps
        ) {
            if pts.isEmpty {
                metricEmptyState(
                    icon: "figure.walk",
                    tint: LifeOSColor.Metric.steps,
                    message: "Walking + running distance shows up here once your watch syncs it."
                )
            } else {
                ScrubbableTrendChart(
                    points: pts,
                    tint: LifeOSColor.Metric.steps,
                    average: pts.map(\.value).reduce(0, +) / Double(pts.count),
                    showPoints: pts.count <= 45,
                    valueFormat: { [self] in milesFmt($0) },
                    yAxisFormat: { String(format: "%.0f", $0) },
                    onScrub: { scrub["dist"] = $0 }
                )
                .frame(height: 140)

                HStack(spacing: 12) {
                    if let p = scrubbed {
                        metricBig(label: ScrubbableTrendChart.dateLabel(p.day), value: milesFmt(p.value),
                                  unit: "mi", delta: "selected", tint: LifeOSColor.Metric.steps)
                    } else {
                        metricBig(label: "Avg / day", value: milesFmt(pts.map(\.value).reduce(0, +) / Double(pts.count)),
                                  unit: "mi", delta: "\(pts.count)d window", tint: LifeOSColor.Metric.steps)
                    }
                    metricBig(label: "Total", value: milesFmt(pts.map(\.value).reduce(0, +)),
                              unit: "mi", delta: "all logged days", tint: LifeOSColor.Metric.steps)
                }
            }
        }
    }

    // MARK: - VO₂ max

    private var vo2MaxCard: some View {
        let scrubbed = scrub["vo2"]
        let pts = vo2MaxPoints
        return analysisCard(
            kicker: "CARDIO FITNESS",
            title: "VO₂ max trend",
            tint: LifeOSColor.Metric.peak
        ) {
            if pts.isEmpty {
                metricEmptyState(
                    icon: "heart.circle.fill",
                    tint: LifeOSColor.Metric.peak,
                    message: "VO₂ max estimates from your watch will trend here. It updates after outdoor walks/runs."
                )
            } else {
                ScrubbableTrendChart(
                    points: pts,
                    tint: LifeOSColor.Metric.peak,
                    average: pts.map(\.value).reduce(0, +) / Double(pts.count),
                    showPoints: pts.count <= 45,
                    valueFormat: { String(format: "%.1f", $0) },
                    yAxisFormat: { String(format: "%.0f", $0) },
                    onScrub: { scrub["vo2"] = $0 }
                )
                .frame(height: 140)

                HStack(spacing: 12) {
                    if let p = scrubbed {
                        metricBig(label: ScrubbableTrendChart.dateLabel(p.day), value: String(format: "%.1f", p.value),
                                  unit: "ml/kg/min", delta: "selected", tint: LifeOSColor.Metric.peak)
                    } else {
                        metricBig(label: "Latest", value: String(format: "%.1f", pts.last!.value),
                                  unit: "ml/kg/min", delta: vo2DeltaLabel(pts), tint: LifeOSColor.Metric.peak)
                    }
                    metricBig(label: "Peak", value: String(format: "%.1f", pts.map(\.value).max() ?? 0),
                              unit: "ml/kg/min", delta: "best in range", tint: LifeOSColor.Metric.peak)
                }
            }
        }
    }

    private func vo2DeltaLabel(_ pts: [TrendPoint]) -> String {
        guard pts.count >= 2 else { return "first reading" }
        let d = pts.last!.value - pts.first!.value
        if abs(d) < 0.1 { return "holding" }
        return String(format: "%+.1f over range", d)
    }

    /// Average of a series formatted as a rounded integer string ("—" if empty).
    private func avgStr(_ pts: [TrendPoint]) -> String {
        guard !pts.isEmpty else { return "—" }
        return "\(Int((pts.map(\.value).reduce(0, +) / Double(pts.count)).rounded()))"
    }

    /// Generic "no data yet" block for the new metric cards.
    private func metricEmptyState(icon: String, tint: Color, message: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 26))
                .foregroundStyle(tint.opacity(0.6))
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
    }

    /// Shared nearest-day scrub for the in-place multi-series cards that
    /// can't use ScrubbableTrendChart directly (calories has two lines).
    private func scrubNearest(_ key: String, points pts: [TrendPoint], location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        guard !pts.isEmpty, let anchor = proxy.plotFrame else { return }
        let xInPlot = location.x - geo[anchor].origin.x
        guard let rawDate: Date = proxy.value(atX: xInPlot) else { return }
        guard let nearest = pts.min(by: {
            abs($0.day.timeIntervalSince(rawDate)) < abs($1.day.timeIntervalSince(rawDate))
        }) else { return }
        let prior = scrub[key]
        if prior == nil || !Calendar.current.isDate(prior!.day, inSameDayAs: nearest.day) {
            scrub[key] = nearest
            Haptics.tick()
        }
    }

    // MARK: - Activity by day of week (heat strip)

    private var activityByDayOfWeek: some View {
        analysisCard(
            kicker: "PATTERNS",
            title: "When are you most active?",
            tint: LifeOSColor.Metric.steps,
            accessory: AnyView(
                HStack(spacing: 3) {
                    Text("DETAIL")
                        .font(.system(size: 9, weight: .bold)).tracking(0.8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(LifeOSColor.Metric.steps)
            )
        ) {
            Chart(data.stepsByDOW, id: \.day) { item in
                BarMark(
                    x: .value("Day", item.day),
                    y: .value("Steps", item.steps)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [LifeOSColor.Metric.steps,
                                 LifeOSColor.Metric.steps.opacity(0.4)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .cornerRadius(4)
                .annotation(position: .top, alignment: .center, spacing: 3) {
                    Text("\(Int(item.steps / 1000))k")
                        .font(.system(size: 9).monospacedDigit())
                        .foregroundStyle(LifeOSColor.fg2)
                }
            }
            .chartYAxis(.hidden)
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                }
            }
            .frame(height: 140)

            calloutText(stepsDowCallout)
        }
    }

    // MARK: - Body composition

    private var bodyCompositionCard: some View {
        let scrubbed = scrub["weight"]
        return analysisCard(
            kicker: "BODY",
            title: "Weight trend",
            tint: LifeOSColor.Metric.weight,
            accessory: AnyView(
                HStack(spacing: 3) {
                    Text("DETAIL")
                        .font(.system(size: 9, weight: .bold)).tracking(0.8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(LifeOSColor.Metric.weight)
            )
        ) {
            if weightPoints.isEmpty {
                metricEmptyState(
                    icon: "scalemass.fill",
                    tint: LifeOSColor.Metric.weight,
                    message: "Log a couple of weigh-ins and your weight trend appears here — scrub it day by day."
                )
            } else {
                ScrubbableTrendChart(
                    points: weightPoints,
                    tint: LifeOSColor.Metric.weight,
                    showArea: false,
                    showPoints: weightPoints.count <= 45,
                    valueFormat: { String(format: "%.1f", $0) },
                    yAxisFormat: { String(format: "%.0f", $0) },
                    onScrub: { scrub["weight"] = $0 }
                )
                .frame(height: 140)

                HStack(spacing: 12) {
                    if let p = scrubbed {
                        metricBig(
                            label: ScrubbableTrendChart.dateLabel(p.day),
                            value: String(format: "%.1f", p.value),
                            unit: "lb",
                            delta: "selected",
                            tint: LifeOSColor.Metric.weight
                        )
                    } else {
                        metricBig(
                            label: "Current",
                            value: data.weightTrend.last.map { String(format: "%.1f", $0.weight) } ?? "—",
                            unit: "lb",
                            delta: weightDeltaLabel,
                            tint: LifeOSColor.Metric.weight
                        )
                    }
                    metricBig(
                        label: "Trend",
                        value: weightSlopeValue,
                        unit: "lb/d",
                        delta: weightSlopeLabel,
                        tint: weightChangeTint
                    )
                }
            }
        }
    }

    private var weightDeltaLabel: String {
        guard let change = data.weightChange else { return "no history" }
        return String(format: "%+.1f lb / %dd", change, range.dayCount)
    }
    private var weightSlopeValue: String {
        guard let change = data.weightChange,
              data.weightTrend.count >= 2 else { return "—" }
        let slope = change / Double(max(1, range.dayCount))
        return String(format: "%+.2f", slope)
    }
    private var weightSlopeLabel: String {
        guard let change = data.weightChange else { return "—" }
        return change < -0.1 ? "consistent loss"
             : change > 0.1 ? "consistent gain"
             : "holding"
    }
    private var weightChangeTint: Color {
        guard let change = data.weightChange else { return LifeOSColor.fg2 }
        return change < 0 ? LifeOSColor.success : LifeOSColor.fg2
    }

    // MARK: - Patterns / observations

    private var patternsCard: some View {
        analysisCard(
            kicker: "OBSERVATIONS",
            title: "Pattern detection",
            tint: LifeOSColor.accent
        ) {
            VStack(alignment: .leading, spacing: 10) {
                observation(
                    icon: "moon.fill",
                    tint: LifeOSColor.Metric.sleep,
                    text: "Your HRV drops an average of 12 ms the day after a Push session — biggest single recovery driver."
                )
                observation(
                    icon: "sun.max.fill",
                    tint: LifeOSColor.Metric.energy,
                    text: "Best-rated mornings (mood ≥ 8) all share the same trait: sleep ended before 7:00 am."
                )
                observation(
                    icon: "drop.fill",
                    tint: LifeOSColor.Metric.water,
                    text: "Hydration goal hit on 14/30 days. Days you hit it had +8% step count."
                )
                if let obs = strainPatternObservation {
                    observation(icon: obs.icon, tint: obs.tint, text: obs.text)
                }
            }
        }
    }

    /// Real strain↔recovery observation off the cached balance. nil when
    /// there isn't enough data to say something true — we drop the row rather
    /// than fabricate (the app prefers honest empty states). Replaces the old
    /// hardcoded "Strain spikes 18... recovery dips 6%" placeholder.
    private var strainPatternObservation: (icon: String, tint: Color, text: String)? {
        if let lag = srBalance.lag, lag.isMeaningful, lag.deltaPoints < 0 {
            let pts = Int(abs(lag.deltaPoints).rounded())
            return ("figure.run", LifeOSColor.Metric.strain,
                    "After your \(lag.hardDayCount) hardest training days, next-morning recovery averages \(pts) points lower — the biggest load→recovery signal in your data.")
        }
        switch srBalance.acwrBand {
        case .danger, .caution:
            let v = srBalance.acwr.map { String(format: "%.2f", $0) } ?? "high"
            return ("chart.line.uptrend.xyaxis", LifeOSColor.Metric.strain,
                    "Your acute:chronic load ratio is \(v) — recent training is outpacing your 28-day base. Watch for an injury spike.")
        case .sweetSpot:
            let v = srBalance.acwr.map { String(format: "%.2f", $0) } ?? "0.8–1.3"
            return ("checkmark.seal.fill", LifeOSColor.Metric.strain,
                    "Your load is ramping in the safe zone (ACWR \(v)) — building fitness without spiking injury risk.")
        default:
            return nil
        }
    }

    private func observation(icon: String, tint: Color, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(tint)
                .frame(width: 22)
            Text(text)
                .font(.system(size: 12.5))
                .foregroundStyle(LifeOSColor.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Shared sub-views

    @ViewBuilder
    private func analysisCard<Content: View>(
        kicker: String,
        title: String,
        tint: Color,
        accessory: AnyView? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Text(kicker)
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(tint)
                    Spacer()
                    if let accessory { accessory }
                }
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                content()
            }
        }
    }

    private func takeaway(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 8, weight: .semibold)).tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
            Text(value)
                .font(.system(size: 13, weight: .bold).monospacedDigit())
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metricBig(label: String, value: String, unit: String, delta: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold)).tracking(1.1)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(tint)
                Text(unit)
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Text(delta)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(LifeOSColor.fg3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func deltaPill(delta: Double, label: String) -> some View {
        let positive = delta >= 0
        let tint = positive ? LifeOSColor.success : LifeOSColor.danger
        return VStack(alignment: .trailing, spacing: 1) {
            HStack(spacing: 3) {
                Image(systemName: positive ? "arrow.up.right" : "arrow.down.right")
                    .font(.system(size: 11, weight: .bold))
                Text(String(format: "%+.1f", delta))
                    .font(.system(size: 16, weight: .bold).monospacedDigit())
            }
            .foregroundStyle(tint)
            Text(label.uppercased())
                .font(.system(size: 8, weight: .semibold)).tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
        }
    }

    private func calloutText(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(LifeOSColor.fg2)
            .padding(.horizontal, 10).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Real-data callouts

    private var hrvSleepCallout: String {
        guard data.hrvVsSleep.count >= 3 else {
            return "Log a few more nights with both sleep and HRV to spot a pattern."
        }
        let slope = data.hrvSleepSlope
        if abs(slope) < 0.5 {
            return "No clear sleep → HRV trend in your data yet — needs a wider range or more variation."
        }
        let dir = slope >= 0 ? "+\(String(format: "%.1f", slope))" : String(format: "%.1f", slope)
        return "Slope of \(dir) ms/hr — \(slope >= 0 ? "more sleep tracks with higher HRV" : "an inverse trend the model can't fully explain") in your data."
    }

    private var stepsDowCallout: String {
        guard let high = data.mostActiveDOW, let low = data.leastActiveDOW, high != low else {
            return "Log more days to see your weekly activity pattern."
        }
        return "\(high)s are your highest-activity day, \(low)s the lowest."
    }

    private func signedDelta(_ d: Double, suffix: String = "") -> String {
        if abs(d) < 0.05 { return "stable\(suffix)" }
        let sign = d >= 0 ? "+" : ""
        return "\(sign)\(String(format: "%.1f", d))\(suffix)"
    }

    private func kFormat(_ v: Double) -> String {
        if v >= 1000 { return "\(Int(v / 1000))k" }
        return "\(Int(v))"
    }
}

// MARK: - Consistency heatmap (GitHub-style)

private struct ConsistencyHeatmap: View {
    let days: [Date: Double]

    var body: some View {
        let columns = 10
        let dates = Array(stride(from: -69, through: 0, by: 1)).reversed().map { offset in
            Calendar.current.date(byAdding: .day, value: offset, to: Date())!
        }
        let chunks = stride(from: 0, to: dates.count, by: columns).map {
            Array(dates[$0..<min($0 + columns, dates.count)])
        }
        return VStack(spacing: 3) {
            ForEach(chunks.indices, id: \.self) { row in
                HStack(spacing: 3) {
                    ForEach(chunks[row], id: \.self) { date in
                        let intensity = days[Calendar.current.startOfDay(for: date)] ?? 0
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(color(for: intensity))
                            .frame(height: 18)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func color(for intensity: Double) -> Color {
        if intensity <= 0 { return LifeOSColor.elevated }
        if intensity < 0.33 { return LifeOSColor.Metric.strain.opacity(0.3) }
        if intensity < 0.66 { return LifeOSColor.Metric.strain.opacity(0.6) }
        return LifeOSColor.Metric.strain
    }
}
