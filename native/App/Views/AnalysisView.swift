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
    @State private var range: TimeRange = .month
    @State private var cardsVisible = false

    /// Cached snapshot. Recomputing AnalysisData.compute on every
    /// body evaluation pegged CPU — the chart cards all read off it,
    /// so every @Query emission (every HealthKit sync, every meal
    /// log, every workout finish anywhere in the app) was triggering
    /// a full 30-day walk per chart per redraw. Cache here, refresh
    /// via .task on appear + .onChange of range / counts.
    @State private var data: AnalysisData = .empty

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
                    revealCard(delay: 0.01) { CorrelationsCard() }
                    revealCard(delay: 0.02) { performanceHero }
                    revealCard(delay: 0.04) { sleepArchitectureCard }
                    revealCard(delay: 0.08) { heartHealthCard }
                    revealCard(delay: 0.12) { hrvSleepCorrelation }
                    revealCard(delay: 0.16) { workoutConsistency }
                    revealCard(delay: 0.20) { heartRateZonesCard }
                    revealCard(delay: 0.24) { activityByDayOfWeek }
                    revealCard(delay: 0.28) { bodyCompositionCard }
                    revealCard(delay: 0.32) { cardioFitnessCard }
                    revealCard(delay: 0.36) { patternsCard }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
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
    }

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
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("PERFORMANCE SCORE")
                            .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                            .foregroundStyle(LifeOSColor.Metric.peak)
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(data.performanceLatest)")
                                .font(.system(size: 56, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(.white)
                                .contentTransition(.numericText())
                            Text("/ 100")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    Spacer()
                    deltaPill(delta: data.performanceDelta, label: "vs prior \(range.dayCount)d")
                }
                Chart(data.performanceTrend, id: \.day) { item in
                    AreaMark(
                        x: .value("Day", item.day),
                        y: .value("Score", item.score)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        LinearGradient(colors: [LifeOSColor.Metric.peak.opacity(0.6),
                                                LifeOSColor.Metric.peak.opacity(0.05)],
                                       startPoint: .top, endPoint: .bottom)
                    )
                    LineMark(
                        x: .value("Day", item.day),
                        y: .value("Score", item.score)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.peak)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))

                    RuleMark(y: .value("Average", data.performanceAvg))
                        .foregroundStyle(LifeOSColor.fg3.opacity(0.4))
                        .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3]))
                        .annotation(position: .topTrailing, alignment: .trailing, spacing: 2) {
                            Text("avg \(Int(data.performanceAvg))")
                                .font(.system(size: 9))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                }
                .chartYScale(domain: 40...100)
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(values: [50, 75, 100]) { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                    }
                }
                .frame(height: 120)

                HStack(spacing: 8) {
                    contributor("Sleep",    pct: 28, tint: LifeOSColor.Metric.sleep)
                    contributor("Activity", pct: 24, tint: LifeOSColor.Metric.steps)
                    contributor("Recovery", pct: 17, tint: LifeOSColor.Metric.peak)
                    contributor("Strain",   pct: 9,  tint: LifeOSColor.Metric.strain)
                }
            }
        }
    }

    private func contributor(_ name: String, pct: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(name.uppercased())
                .font(.system(size: 8, weight: .semibold)).tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
            Text("+\(pct)")
                .font(.system(size: 14, weight: .bold).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    // MARK: - Sleep architecture (stacked area)

    private var sleepArchitectureCard: some View {
        analysisCard(
            kicker: "SLEEP",
            title: "How's your sleep architecture trending?",
            tint: LifeOSColor.Metric.sleep
        ) {
            Chart(data.sleepStageSeries, id: \.id) { item in
                AreaMark(
                    x: .value("Day", item.day),
                    y: .value("Minutes", item.minutes)
                )
                .interpolationMethod(.monotone)
                .foregroundStyle(by: .value("Stage", item.stage))
                .position(by: .value("Stage", item.stage))
            }
            .chartForegroundStyleScale([
                "Deep":  Color(hex: 0x1E40AF),
                "Core":  Color(hex: 0x60A5FA),
                "REM":   Color(hex: 0xA78BFA),
                "Awake": Color(hex: 0xF43F5E),
            ])
            .chartLegend(position: .bottom, alignment: .center, spacing: 8)
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                }
            }
            .frame(height: 160)

            HStack {
                takeaway(label: "AVG TOTAL",  value: hm(data.avgSleepTotalMin))
                takeaway(label: "AVG DEEP",   value: hm(data.avgSleepDeepMin))
                takeaway(label: "AVG REM",    value: hm(data.avgSleepREMMin))
                takeaway(label: "EFFICIENCY", value: efficiencyLabel)
            }
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
            tint: LifeOSColor.Metric.mood
        ) {
            Chart {
                ForEach(data.rhrTrend, id: \.day) { item in
                    LineMark(
                        x: .value("Day", item.day),
                        y: .value("RHR", item.value),
                        series: .value("Metric", "RHR")
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.mood)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                }
                ForEach(data.hrvTrend, id: \.day) { item in
                    LineMark(
                        x: .value("Day", item.day),
                        y: .value("HRV", item.value),
                        series: .value("Metric", "HRV")
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.sleep)
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
                metricBig(
                    label: "Resting HR",
                    value: data.rhrLatest.map { "\(Int($0.rounded()))" } ?? "—",
                    unit: "bpm",
                    delta: signedDelta(data.rhrDelta, suffix: " vs prior"),
                    tint: LifeOSColor.Metric.mood
                )
                metricBig(
                    label: "HRV (rMSSD)",
                    value: data.hrvLatest.map { "\(Int($0.rounded()))" } ?? "—",
                    unit: "ms",
                    delta: signedDelta(data.hrvDelta, suffix: " vs prior"),
                    tint: LifeOSColor.Metric.sleep
                )
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

    // MARK: - Heart rate zones donut

    private var heartRateZonesCard: some View {
        analysisCard(
            kicker: "INTENSITY",
            title: "Time in heart rate zones",
            tint: LifeOSColor.danger
        ) {
            Chart(Sample.hrZones, id: \.zone) { item in
                SectorMark(
                    angle: .value("Minutes", item.minutes),
                    innerRadius: .ratio(0.55),
                    angularInset: 2
                )
                .cornerRadius(4)
                .foregroundStyle(by: .value("Zone", item.zone))
            }
            .chartForegroundStyleScale([
                "Easy":     Color(hex: 0x10B981),
                "Fat burn": Color(hex: 0x84CC16),
                "Cardio":   Color(hex: 0xF59E0B),
                "Peak":     Color(hex: 0xF43F5E),
            ])
            .chartLegend(position: .trailing, alignment: .center, spacing: 8)
            .frame(height: 160)

            calloutText(
                "Most of your time sits in Easy + Fat burn. Add 1 cardio session per week to hit the 150 min/week Zone 2-3 target."
            )
        }
    }

    // MARK: - Activity by day of week (heat strip)

    private var activityByDayOfWeek: some View {
        analysisCard(
            kicker: "PATTERNS",
            title: "When are you most active?",
            tint: LifeOSColor.Metric.steps
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
        analysisCard(
            kicker: "BODY",
            title: "Weight & lean mass trend",
            tint: LifeOSColor.Metric.weight
        ) {
            Chart {
                ForEach(data.weightTrend, id: \.day) { item in
                    LineMark(
                        x: .value("Day", item.day),
                        y: .value("Weight", item.weight),
                        series: .value("M", "Weight")
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.weight)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                    PointMark(
                        x: .value("Day", item.day),
                        y: .value("Weight", item.weight)
                    )
                    .foregroundStyle(LifeOSColor.Metric.weight)
                    .symbolSize(16)
                }
            }
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                }
            }
            .chartXAxis(.hidden)
            .frame(height: 140)

            HStack(spacing: 12) {
                metricBig(
                    label: "Current",
                    value: data.weightTrend.last.map { String(format: "%.1f", $0.weight) } ?? "—",
                    unit: "lb",
                    delta: weightDeltaLabel,
                    tint: LifeOSColor.Metric.weight
                )
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

    // MARK: - Cardio fitness gauge

    private var cardioFitnessCard: some View {
        analysisCard(
            kicker: "CARDIO FITNESS",
            title: "VO₂ max estimate",
            tint: LifeOSColor.Metric.steps
        ) {
            HStack(spacing: 18) {
                Gauge(value: 42, in: 20...60) {
                    Text("VO₂")
                } currentValueLabel: {
                    Text("42")
                        .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                } minimumValueLabel: {
                    Text("20").font(.system(size: 9)).foregroundStyle(LifeOSColor.fg3)
                } maximumValueLabel: {
                    Text("60").font(.system(size: 9)).foregroundStyle(LifeOSColor.fg3)
                }
                .gaugeStyle(.accessoryCircular)
                .tint(
                    Gradient(colors: [LifeOSColor.warning, LifeOSColor.success])
                )
                .scaleEffect(1.6)
                .frame(width: 110, height: 110)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 4) {
                        Circle().fill(LifeOSColor.success).frame(width: 6, height: 6)
                        Text("ABOVE AVERAGE")
                            .font(.system(size: 9, weight: .bold)).tracking(1.1)
                            .foregroundStyle(LifeOSColor.success)
                    }
                    Text("Top 30% for your age + sex bracket. A 7 ml/kg/min lift over the last year.")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
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
                observation(
                    icon: "figure.run",
                    tint: LifeOSColor.Metric.strain,
                    text: "Cardio sessions are clustered Wed/Sat. Strain spikes 18 on those days; recovery dips 6%."
                )
            }
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
        @ViewBuilder content: () -> Content
    ) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Text(kicker)
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(tint)
                    Spacer()
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

// MARK: - Sample data — replace with HealthKit/Fitbit reads

private enum Sample {
    struct DailyValue { let day: Int; let value: Double }
    struct DailyScore { let day: Int; let score: Double }
    struct DailyWeight { let day: Int; let weight: Double }
    struct ScatterPoint: Identifiable { let id = UUID(); let sleepHours: Double; let hrv: Double }
    struct StageRow: Identifiable { let id = UUID(); let day: Int; let stage: String; let minutes: Double }
    struct HRZone { let zone: String; let minutes: Double }
    struct DOWBar { let day: String; let steps: Double }

    static let performanceTrend: [DailyScore] = (0..<30).map { i in
        let base = 75 + sin(Double(i) / 3) * 6 + Double(i) * 0.2
        return DailyScore(day: i, score: min(95, max(50, base)))
    }
    static let performanceAvg: Double = 78

    static let rhrTrend: [DailyValue] = (0..<30).map { i in
        DailyValue(day: i, value: 60 + sin(Double(i) / 4) * 2 - Double(i) * 0.05)
    }
    static let hrvTrend: [DailyValue] = (0..<30).map { i in
        DailyValue(day: i, value: 56 + sin(Double(i) / 3) * 4 + Double(i) * 0.08)
    }

    static let sleepStageSeries: [StageRow] = (0..<14).flatMap { i -> [StageRow] in
        let base = 420.0 + sin(Double(i) / 2) * 25
        return [
            StageRow(day: i, stage: "Deep",  minutes: base * 0.20),
            StageRow(day: i, stage: "Core",  minutes: base * 0.55),
            StageRow(day: i, stage: "REM",   minutes: base * 0.22),
            StageRow(day: i, stage: "Awake", minutes: base * 0.03),
        ]
    }

    static let hrvVsSleep: [ScatterPoint] = (0..<25).map { i in
        let sleep = 5.5 + Double(i % 7) * 0.4
        let hrv = 38 + sleep * 5.2 + Double.random(in: -4...4)
        return ScatterPoint(sleepHours: sleep, hrv: hrv)
    }

    static let workoutDays: [Date: Double] = {
        var dict: [Date: Double] = [:]
        for offset in -69...0 {
            guard let d = Calendar.current.date(byAdding: .day, value: offset, to: Date()) else { continue }
            let day = Calendar.current.startOfDay(for: d)
            let weekday = Calendar.current.component(.weekday, from: day)
            if [2, 3, 5, 6, 7].contains(weekday) {
                dict[day] = Double.random(in: 0.4...1)
            } else {
                dict[day] = Double.random(in: 0...0.2)
            }
        }
        return dict
    }()

    static let hrZones: [HRZone] = [
        .init(zone: "Easy",     minutes: 480),
        .init(zone: "Fat burn", minutes: 220),
        .init(zone: "Cardio",   minutes: 95),
        .init(zone: "Peak",     minutes: 18),
    ]

    static let stepsByDOW: [DOWBar] = [
        .init(day: "Mon", steps: 5800),
        .init(day: "Tue", steps: 7200),
        .init(day: "Wed", steps: 8900),
        .init(day: "Thu", steps: 7800),
        .init(day: "Fri", steps: 9400),
        .init(day: "Sat", steps: 11200),
        .init(day: "Sun", steps: 6500),
    ]

    static let weightTrend: [DailyWeight] = (0..<30).map { i in
        DailyWeight(day: i, weight: 178.5 - Double(i) * 0.07 + sin(Double(i) / 5) * 0.4)
    }
}
