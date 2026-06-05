import SwiftUI
import SwiftData
import Charts

/// The Body screen — body-composition trajectory. Reached as a drill-in push
/// from AnalysisView's body-composition card. Computes its own snapshot off
/// @Query data and caches it; recompute on appear + on weigh-in count changes.
/// (Tape measurements + HealthKit body-fat/lean are a planned follow-up.)
struct BodyView: View {
    @Environment(\.modelContext) private var ctx
    @Query private var dailies: [DailyEntry]
    @Query private var settingsRows: [UserSettings]

    @State private var snapshot: BodyCompositionResult = .empty
    @State private var scrubWeight: TrendPoint?

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
                    bodyFatEmpty
                }
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 14).padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("Body")
        .navigationBarTitleDisplayMode(.large)
        .onAppear { refresh() }
        .onChange(of: dailies.count) { _, _ in refresh() }
        .onChange(of: goalLb) { _, _ in refresh() }
    }

    private func refresh() {
        snapshot = BodyCompositionEngine.compute(
            dailies: dailies, goalWeightLb: goalLb, heightCm: settingsRows.first?.heightCm)
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

    private var bodyFatEmpty: some View {
        EmptyStateCard(
            icon: "percent",
            title: "Body-fat tracking",
            subtitle: "Sync a smart scale to Apple Health and your body-fat % and lean-mass trends land here.",
            tint: LifeOSColor.Metric.fat)
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
}
