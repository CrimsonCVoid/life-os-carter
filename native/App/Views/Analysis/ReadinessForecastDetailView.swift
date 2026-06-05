import SwiftUI
import Charts

/// Deep-dive for the readiness forecast — projected band + drivers, the 7-day
/// readiness calendar, HRV/RHR trajectory cones, and the sleep-debt curve.
/// Presented as a sheet wrapping its own NavigationStack (push-vs-sheet gotcha).
/// Every chart is continuous-axis-safe (Date x + Double y, no ordinal domain).
struct ReadinessForecastDetailView: View {
    let forecast: ReadinessForecast
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let t = forecast.tomorrow { heroCard(t); driversCard(t) }
                    calendarCard
                    if let h = forecast.hrvTrajectory { trajectoryCard("HRV trajectory", h, LifeOSColor.Metric.hrv) }
                    if let r = forecast.rhrTrajectory { trajectoryCard("Resting-HR trajectory", r, LifeOSColor.Metric.rhr) }
                    if let d = forecast.sleepDebt { debtCard(d) }
                    methodologyNote
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 14).padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Readiness Forecast")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { Haptics.tap(); dismiss() }.foregroundStyle(LifeOSColor.accent)
                }
            }
        }
    }

    // MARK: Hero

    private func heroCard(_ t: ReadinessForecast.ReadinessProjection) -> some View {
        let tint = LifeOSColor.recovery(Int(t.pointEstimate.rounded()))
        return Card(tint: tint) {
            VStack(spacing: 12) {
                Text("TOMORROW · PROJECTED").font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(tint)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(Int(t.low.rounded()))–\(Int(t.high.rounded()))")
                        .font(.system(size: 52, weight: .bold, design: .rounded)).monospacedDigit()
                        .foregroundStyle(LifeOSColor.fg)
                    Text("/ 100").font(.system(size: 16, weight: .medium)).foregroundStyle(LifeOSColor.fg3)
                }
                ForecastBandTrack(proj: t).padding(.horizontal, 8)
                Text(t.confidence.label.uppercased())
                    .font(.system(size: 10, weight: .heavy)).tracking(1.0).foregroundStyle(tint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.15)))
                Text("A range, not a number. Tonight's sleep and tomorrow's actual readings will land somewhere inside it — most likely near the midpoint (\(Int(t.pointEstimate.rounded()))).")
                    .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity)
        }
    }

    // MARK: Drivers — signed bars (vs recent mean)

    @ViewBuilder private func driversCard(_ t: ReadinessForecast.ReadinessProjection) -> some View {
        if !t.drivers.isEmpty {
            let maxMag = max(1, t.drivers.map { abs($0.delta) }.max() ?? 1)
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel("What's moving tomorrow's number")
                    ForEach(t.drivers) { d in driverRow(d, maxMag: maxMag) }
                }
            }
        }
    }

    private func driverRow(_ d: ReadinessForecast.ForecastDriver, maxMag: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(d.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
                Spacer()
                Text("\(d.delta >= 0 ? "+" : "−")\(String(format: "%.0f", abs(d.delta)))")
                    .font(.system(size: 13, weight: .bold).monospacedDigit()).foregroundStyle(d.tint)
            }
            GeometryReader { geo in
                let w = geo.size.width
                let half = w / 2
                let frac = abs(d.delta) / maxMag
                ZStack(alignment: .center) {
                    Capsule().fill(LifeOSColor.elevated).frame(height: 6)
                    HStack(spacing: 0) {
                        if d.delta < 0 {
                            Spacer(minLength: 0)
                            Capsule().fill(d.tint).frame(width: half * frac, height: 6)
                                .frame(width: half, alignment: .trailing)
                            Color.clear.frame(width: half, height: 6)
                        } else {
                            Color.clear.frame(width: half, height: 6)
                            Capsule().fill(d.tint).frame(width: half * frac, height: 6)
                                .frame(width: half, alignment: .leading)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            .frame(height: 8)
            Text(d.detail).font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Calendar

    private var calendarCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("7-day readiness + forecast")
                ReadinessCalendarStrip(cells: forecast.calendar, cellHeight: 50)
                Text("Solid cells are recovery you already logged. Hatched cells are projections that fade in confidence the further out they go.")
                    .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Trajectory

    private func trajectoryCard(_ title: String, _ traj: ReadinessForecast.Trajectory, _ tint: Color) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(title); Spacer()
                    Text(String(format: "%@%.0f %@ / %dd proj",
                                traj.slopePerDay >= 0 ? "+" : "−",
                                abs(traj.slopePerDay) * Double(traj.horizonDays), traj.unit, traj.horizonDays))
                        .font(.system(size: 11, weight: .semibold).monospacedDigit()).foregroundStyle(tint)
                }
                TrajectoryProjectionChart(traj: traj, tint: tint)
                Text("Projection assumes the last \(traj.history.count) days' trend continues (fit r²=\(String(format: "%.2f", traj.r2))). Real readings will wander inside the shaded cone — it widens the further out you look.")
                    .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Sleep debt

    private func debtCard(_ d: ReadinessForecast.DebtProjection) -> some View {
        Card(tint: LifeOSColor.Metric.sleep) {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Sleep-debt projection")
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(String(format: "%.1f", d.currentDebtHours))
                        .font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
                        .foregroundStyle(LifeOSColor.Metric.sleep)
                    Text("h debt").font(.system(size: 13)).foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    if let n = d.nightsToClear {
                        Text("~\(n) night\(n == 1 ? "" : "s") to clear")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(LifeOSColor.success)
                    }
                }
                DebtCurveChart(debt: d)
                Text(d.nightsToClear == nil
                     ? "You're keeping pace with your sleep goal — no meaningful debt to clear."
                     : "The dashed line is a projection: clearing your debt at roughly an hour over goal each night. Miss a night and the runway extends.")
                    .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var methodologyNote: some View {
        Card {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "info.circle.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(LifeOSColor.fg3)
                Text("These are projections, not predictions. They extrapolate your recent trends and today's load — they can't see tonight's sleep, tomorrow's training, stress, or illness. Treat the range as a planning aid, and trust the morning's actual recovery score over any forecast.")
                    .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Charts (private, continuous-axis-safe)

private struct TrajectoryProjectionChart: View {
    let traj: ReadinessForecast.Trajectory
    var tint: Color

    var body: some View {
        Chart {
            ForEach(Array(zip(traj.projLow, traj.projHigh).enumerated()), id: \.offset) { _, pair in
                AreaMark(
                    x: .value("Day", pair.0.day),
                    yStart: .value("Low", pair.0.value),
                    yEnd: .value("High", pair.1.value)
                )
                .foregroundStyle(tint.opacity(0.12))
                .interpolationMethod(.catmullRom)
            }
            ForEach(traj.history) { p in
                LineMark(x: .value("Day", p.day), y: .value("v", p.value), series: .value("s", "hist"))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(tint)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            }
            ForEach(traj.projection) { p in
                LineMark(x: .value("Day", p.day), y: .value("v", p.value), series: .value("s", "proj"))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(tint.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
            }
            if let lastHist = traj.history.last {
                RuleMark(x: .value("Now", lastHist.day))
                    .foregroundStyle(LifeOSColor.fg3.opacity(0.4))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text("now").font(.system(size: 8, weight: .semibold)).foregroundStyle(LifeOSColor.fg3)
                    }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 5)) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
            }
        }
        .frame(height: 150)
    }
}

private struct DebtCurveChart: View {
    let debt: ReadinessForecast.DebtProjection

    var body: some View {
        Chart {
            ForEach(debt.curve) { p in
                AreaMark(x: .value("Day", p.day), y: .value("Debt", p.value))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LinearGradient(
                        colors: [LifeOSColor.Metric.sleep.opacity(0.30), LifeOSColor.Metric.sleep.opacity(0.03)],
                        startPoint: .top, endPoint: .bottom))
            }
            ForEach(debt.curve) { p in
                LineMark(x: .value("Day", p.day), y: .value("Debt", p.value), series: .value("s", "obs"))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LifeOSColor.Metric.sleep)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            }
            ForEach(debt.projectedCurve) { p in
                LineMark(x: .value("Day", p.day), y: .value("Debt", p.value), series: .value("s", "proj"))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LifeOSColor.success.opacity(0.8))
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
            }
            RuleMark(y: .value("Clear", 0))
                .foregroundStyle(LifeOSColor.fg3.opacity(0.3))
                .lineStyle(StrokeStyle(lineWidth: 0.5))
        }
        .chartYScale(domain: 0...(max(1, (debt.curve.map(\.value).max() ?? 1) * 1.1)))
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 4)) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
            }
        }
        .frame(height: 130)
    }
}
