import SwiftUI
import SwiftData
import Charts

/// The Body screen — body-composition trajectory + tape measurements. Reached
/// as a drill-in push from AnalysisView's body-composition card. Computes its
/// own snapshot off @Query data and caches it; recompute on appear + on
/// weigh-in / measurement count changes. Body-fat / lean cards stay empty until
/// a smart scale syncs to HealthKit.
struct BodyView: View {
    @Environment(\.modelContext) private var ctx
    @Query private var dailies: [DailyEntry]
    @Query(sort: \BodyMeasurement.loggedAt, order: .reverse) private var measurements: [BodyMeasurement]
    @Query private var settingsRows: [UserSettings]

    @State private var snapshot: BodyCompositionResult = .empty
    @State private var scrubWeight: TrendPoint?
    @State private var scrubBF: TrendPoint?
    @State private var showAddMeasurement = false

    private var unit: WeightUnit { WeightUnit.from(settingsRows.first?.weightUnit ?? "lb") }
    private var goalLb: Double? { settingsRows.first?.goalWeightLb }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if snapshot.weighInCount < 2 {
                    EmptyStateCard(
                        icon: "scalemass.fill",
                        title: "No trajectory yet",
                        subtitle: "Log a couple of weigh-ins and your smoothed weight trend, rate, and goal ETA appear here.",
                        tint: LifeOSColor.Metric.weight)
                } else {
                    heroCard
                    trajectoryCard
                    if let g = snapshot.goal { goalStrip(g) }
                    if snapshot.bmi != nil { bmiCard }
                    bodyFatCard
                    if !snapshot.leanMassTrend.isEmpty { leanMassCard }
                }
                measurementsCard          // always shown — its own empty state
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 14).padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("Body")
        .navigationBarTitleDisplayMode(.large)
        .onAppear { refresh() }
        .onChange(of: dailies.count) { _, _ in refresh() }
        .onChange(of: measurements.count) { _, _ in refresh() }
        .onChange(of: goalLb) { _, _ in refresh() }
        .sheet(isPresented: $showAddMeasurement) {
            AddMeasurementSheet(unit: unit)
        }
    }

    private func refresh() {
        snapshot = BodyCompositionEngine.compute(
            dailies: dailies,
            goalWeightLb: goalLb,
            heightCm: settingsRows.first?.heightCm,
            bodyFatSeries: dailies.compactMap { d in
                guard let v = d.bodyFatPct, let dt = Self.ymd.date(from: d.date) else { return nil }
                return (Calendar.current.startOfDay(for: dt), v * 100)   // fraction → %
            }.sorted { $0.0 < $1.0 },
            leanMassSeries: dailies.compactMap { d in
                guard let v = d.leanMassLb, let dt = Self.ymd.date(from: d.date) else { return nil }
                return (Calendar.current.startOfDay(for: dt), v)
            }.sorted { $0.0 < $1.0 })
    }

    // MARK: Hero

    @ViewBuilder private var heroCard: some View {
        let ema = snapshot.latestEmaLb ?? 0
        let shown = scrubWeight?.value ?? ema
        Card(tint: LifeOSColor.Metric.weight) {
            HStack(spacing: 18) {
                if let g = snapshot.goal {
                    ScoreRing(
                        progress: g.progressFraction,
                        value: String(format: "%.0f", unit.display(fromLb: shown)),
                        label: unit.label,
                        tint: LifeOSColor.Metric.weight, size: 132,
                        sublabel: "GOAL \(Int(unit.display(fromLb: g.goalLb)))")
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(scrubWeight != nil ? "SELECTED" : "TREND WEIGHT")
                            .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                            .foregroundStyle(LifeOSColor.Metric.weight)
                        Text(unit.formatted(fromLb: shown))
                            .font(.system(size: 48, weight: .bold, design: .rounded)).monospacedDigit()
                            .foregroundStyle(LifeOSColor.fg)
                            .contentTransition(.numericText())
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 8) {
                    ratePill
                    if let raw = snapshot.latestRawLb { statMini("LAST WEIGH-IN", unit.formatted(fromLb: raw)) }
                    statMini("WEIGH-INS", "\(snapshot.weighInCount)")
                }
            }
        }
    }

    @ViewBuilder private var ratePill: some View {
        if let r = snapshot.rateLbPerWeek {
            let losing = r < 0
            let c = abs(r) < 0.1 ? LifeOSColor.fg2 : (losing ? LifeOSColor.success : LifeOSColor.warning)
            HStack(spacing: 3) {
                Image(systemName: losing ? "arrow.down.right" : "arrow.up.right")
                    .font(.system(size: 11, weight: .bold))
                Text("\(String(format: "%+.1f", unit.display(fromLb: r))) \(unit.label)/wk")
                    .font(.system(size: 15, weight: .bold).monospacedDigit())
            }
            .foregroundStyle(c)
        } else {
            Text("rate pending").font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
        }
    }

    // MARK: Trajectory

    private var trajectoryCard: some View {
        let pts = snapshot.trajectory.map { TrendPoint(day: $0.day, value: $0.ema) }
        let rawPts = snapshot.trajectory.map { TrendPoint(day: $0.day, value: $0.raw) }
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                cardHeader("TRAJECTORY", "Smoothed weight trend", LifeOSColor.Metric.weight)
                Text("Bold line is your trend weight (4-day EMA); dots are daily weigh-ins.")
                    .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                Chart {
                    ForEach(rawPts) { p in
                        PointMark(x: .value("Day", p.day), y: .value("lb", unit.display(fromLb: p.value)))
                            .foregroundStyle(LifeOSColor.Metric.weight.opacity(0.25)).symbolSize(14)
                    }
                    ForEach(pts) { p in
                        AreaMark(x: .value("Day", p.day), y: .value("lb", unit.display(fromLb: p.value)))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(LifeOSGradient.metricFill(LifeOSColor.Metric.weight))
                    }
                    ForEach(pts) { p in
                        LineMark(x: .value("Day", p.day), y: .value("lb", unit.display(fromLb: p.value)))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(LifeOSColor.Metric.weight)
                            .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    }
                    if let g = goalLb {
                        RuleMark(y: .value("Goal", unit.display(fromLb: g)))
                            .foregroundStyle(LifeOSColor.success.opacity(0.6))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [5]))
                            .annotation(position: .topLeading, alignment: .leading, spacing: 2) {
                                Text("goal").font(.system(size: 9)).foregroundStyle(LifeOSColor.success)
                            }
                    }
                    if let p = scrubWeight {
                        RuleMark(x: .value("Day", p.day))
                            .foregroundStyle(LifeOSColor.fg2.opacity(0.5))
                            .lineStyle(StrokeStyle(lineWidth: 1))
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .chartXAxis(.hidden)
                .chartOverlay { proxy in
                    GeometryReader { geo in
                        Rectangle().fill(.clear).contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 0)
                                .onChanged { v in scrub(v.location, points: pts, proxy: proxy, geo: geo) }
                                .onEnded { _ in scrubWeight = nil; Haptics.tap() })
                    }
                }
                .frame(height: 200)
            }
        }
    }

    private func scrub(_ loc: CGPoint, points pts: [TrendPoint], proxy: ChartProxy, geo: GeometryProxy) {
        guard !pts.isEmpty, let anchor = proxy.plotFrame else { return }
        let x = loc.x - geo[anchor].origin.x
        guard let raw: Date = proxy.value(atX: x) else { return }
        guard let n = pts.min(by: { abs($0.day.timeIntervalSince(raw)) < abs($1.day.timeIntervalSince(raw)) }) else { return }
        if scrubWeight == nil || !Calendar.current.isDate(scrubWeight!.day, inSameDayAs: n.day) {
            scrubWeight = n; Haptics.tick()
        }
    }

    // MARK: Goal / BMI / body-fat

    private func goalStrip(_ g: BodyCompositionResult.GoalProjection) -> some View {
        Card {
            HStack(spacing: 12) {
                stat("REMAINING", unit.formatted(fromLb: abs(g.remainingLb)), LifeOSColor.Metric.weight)
                stat("ETA", g.etaDate.map(Self.shortDate) ?? "—", g.onPace ? LifeOSColor.success : LifeOSColor.fg2)
                stat("WEEKS", g.weeksToGoal.map { String(format: "%.0f", $0) } ?? "—", LifeOSColor.Metric.peak)
                stat("PACE", g.onPace ? "On track" : "Stalled", g.onPace ? LifeOSColor.success : LifeOSColor.warning)
            }
        }
    }

    @ViewBuilder private var bmiCard: some View {
        if let bmi = snapshot.bmi, let cat = snapshot.bmiCategory {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("BMI").font(.system(size: 10, weight: .heavy)).tracking(1.4).foregroundStyle(LifeOSColor.fg3)
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(String(format: "%.1f", bmi))
                            .font(.system(size: 38, weight: .bold, design: .rounded)).monospacedDigit()
                            .foregroundStyle(LifeOSColor.fg)
                        Text(cat.rawValue.uppercased())
                            .font(.system(size: 10, weight: .heavy)).tracking(1).foregroundStyle(cat.tint)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(cat.tint.opacity(0.14), in: Capsule())
                        Spacer(minLength: 0)
                    }
                    Text(snapshot.takeaway).font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                }
            }
        }
    }

    @ViewBuilder private var bodyFatCard: some View {
        let pts = snapshot.bodyFatTrend.map { TrendPoint(day: $0.day, value: $0.ema) }
        if pts.count < 2 {
            EmptyStateCard(
                icon: "percent",
                title: "No body-fat data",
                subtitle: "Sync a smart scale to Apple Health and your body-fat % trend lands here.",
                tint: LifeOSColor.Metric.fat)
        } else {
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    cardHeader("COMPOSITION", "Body fat %", LifeOSColor.Metric.fat)
                    ScrubbableTrendChart(
                        points: pts, tint: LifeOSColor.Metric.fat,
                        average: pts.map(\.value).reduce(0, +) / Double(pts.count),
                        showArea: true, showPoints: pts.count <= 45,
                        valueFormat: { String(format: "%.1f%%", $0) },
                        yAxisFormat: { String(format: "%.0f", $0) },
                        onScrub: { scrubBF = $0 })
                    .frame(height: 150)
                    HStack(spacing: 12) {
                        stat("CURRENT", snapshot.latestBodyFatPct.map { String(format: "%.1f%%", $0) } ?? "—", LifeOSColor.Metric.fat)
                        stat("RATE", snapshot.bodyFatRatePctPerMonth.map { String(format: "%+.1f%%/mo", $0) } ?? "—",
                             (snapshot.bodyFatRatePctPerMonth ?? 0) <= 0 ? LifeOSColor.success : LifeOSColor.warning)
                    }
                }
            }
        }
    }

    private var leanMassCard: some View {
        let pts = snapshot.leanMassTrend.map { TrendPoint(day: $0.day, value: unit.display(fromLb: $0.ema)) }
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                cardHeader("COMPOSITION", "Lean body mass", LifeOSColor.Metric.peak)
                ScrubbableTrendChart(
                    points: pts, tint: LifeOSColor.Metric.peak,
                    average: nil, showArea: false, showPoints: pts.count <= 45,
                    valueFormat: { String(format: "%.1f \(unit.label)", $0) },
                    yAxisFormat: { String(format: "%.0f", $0) })
                .frame(height: 140)
                stat("CURRENT", snapshot.latestLeanMassLb.map { unit.formatted(fromLb: $0) } ?? "—", LifeOSColor.Metric.peak)
            }
        }
    }

    private var measurementsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    cardHeader("MEASUREMENTS", "Tape log", LifeOSColor.accent)
                    Spacer()
                    Button { Haptics.tap(); showAddMeasurement = true } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus.circle.fill").font(.system(size: 13, weight: .semibold))
                            Text("Log").font(.system(size: 12, weight: .semibold))
                        }.foregroundStyle(LifeOSColor.accent)
                    }.buttonStyle(.plain)
                }
                if let latest = measurements.first {
                    let prior = measurements.dropFirst().first
                    ForEach(latest.presentSites, id: \.label) { site in
                        measurementRow(site, prior: prior)
                    }
                    Text("Last logged \(Self.shortDate(latest.loggedAt))")
                        .font(.system(size: 10)).foregroundStyle(LifeOSColor.fg3)
                } else {
                    Text("No measurements yet. Tap Log to record waist, chest, arms, and more — we'll track the deltas.")
                        .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                }
            }
        }
    }

    private func measurementRow(_ site: (label: String, cm: Double), prior: BodyMeasurement?) -> some View {
        let imperial = unit == .lb
        func fmt(_ cm: Double) -> String { imperial ? String(format: "%.1f in", cm / 2.54) : String(format: "%.1f cm", cm) }
        let priorCm = prior?.presentSites.first { $0.label == site.label }?.cm
        let delta = priorCm.map { site.cm - $0 }
        return HStack {
            Text(site.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
            Spacer()
            Text(fmt(site.cm)).font(.system(size: 14, weight: .bold).monospacedDigit()).foregroundStyle(LifeOSColor.fg)
            if let d = delta, abs(d) > 0.05 {
                Text("\(d < 0 ? "−" : "+")\(fmt(abs(d)))")
                    .font(.system(size: 10, weight: .semibold).monospacedDigit())
                    .foregroundStyle(d < 0 ? LifeOSColor.success : LifeOSColor.warning)
                    .frame(width: 64, alignment: .trailing)
            }
        }
    }

    // MARK: Shared

    private func cardHeader(_ kicker: String, _ title: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(kicker).font(.system(size: 10, weight: .heavy)).tracking(1.4).foregroundStyle(tint)
            Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
        }
    }
    private func stat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 8, weight: .semibold)).tracking(1).foregroundStyle(LifeOSColor.fg3)
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    private func statMini(_ label: String, _ value: String) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(label).font(.system(size: 8, weight: .semibold)).tracking(1).foregroundStyle(LifeOSColor.fg3)
            Text(value).font(.system(size: 14, weight: .bold).monospacedDigit()).foregroundStyle(LifeOSColor.fg)
        }
    }
    private static func shortDate(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "MMM d"; return f.string(from: d) }
    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
}
