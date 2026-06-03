import SwiftUI
import Charts

/// The strain↔recovery deep dive (presented as a sheet; wraps itself in a
/// NavigationStack like the other detail views). Four surfaces:
///   - a dual-axis overlay (strain bars + recovery line) showing the
///     next-morning relationship,
///   - a recovery×strain quadrant scatter,
///   - the ACWR load-ramp gauge,
///   - the lagged "after your hardest days" callout.
///
/// Chart-safety: NO chart here uses an ordinal/array y-domain (the documented
/// main-thread hang). The overlay is a continuous 0…1 axis (BarMark + LineMark);
/// the scatter is continuous 0…100 × 0…21 (RectangleMark + PointMark, no
/// LineMark); the gauge is plain SwiftUI shapes.
struct StrainRecoveryDetailView: View {
    let balance: StrainRecoveryBalance
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    overlayCard
                    scatterCard
                    acwrCard
                    if balance.lag?.isMeaningful == true { lagCard }
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Strain & Recovery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { Haptics.tap(); dismiss() }
                        .foregroundStyle(LifeOSColor.accent)
                }
            }
        }
    }

    private var lastPairedID: Date? {
        balance.series.last { $0.recovery != nil }?.id
    }

    // MARK: - 2a. Dual-axis overlay

    @ViewBuilder
    private var overlayCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Strain vs next-day recovery")
                if balance.pairedDayCount < 5 {
                    metricEmpty(
                        icon: "chart.bar.xaxis",
                        "Once you've logged about a week of activity alongside overnight recovery, you'll see how each day's load lands on the next morning's recovery."
                    )
                } else {
                    HStack(alignment: .top, spacing: 8) {
                        axisGutter(["21", "14", "7", "0"], tint: LifeOSColor.Metric.strain)
                        overlayChart
                        axisGutter(["100", "50", "0"], tint: LifeOSColor.Metric.peak)
                    }
                    .frame(height: 200)
                    legendRow
                    Text("Bars are daily strain (0–21). The line is recovery (0–100). Watch how a tall bar tends to be followed by a dip in the line the next morning.")
                        .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var overlayChart: some View {
        Chart {
            ForEach(balance.series) { p in
                BarMark(
                    x: .value("Day", p.day, unit: .day),
                    y: .value("Strain", p.strain / 21.0),
                    width: .ratio(0.55)
                )
                .foregroundStyle(LifeOSColor.Metric.strain.opacity(0.45))
                .cornerRadius(2)
            }
            ForEach(balance.series.filter { $0.recovery != nil }) { p in
                LineMark(
                    x: .value("Day", p.day, unit: .day),
                    y: .value("Recovery", Double(p.recovery ?? 0) / 100.0),
                    series: .value("M", "recovery")
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(LifeOSColor.Metric.peak)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            }
            ForEach(balance.series.filter { $0.recovery != nil }) { p in
                PointMark(
                    x: .value("Day", p.day, unit: .day),
                    y: .value("Recovery", Double(p.recovery ?? 0) / 100.0)
                )
                .foregroundStyle(LifeOSColor.Metric.peak)
                .symbolSize(14)
            }
        }
        .chartYScale(domain: 0...1)
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
            }
        }
    }

    /// A vertical column of unit labels, evenly spaced top→bottom, aligned to
    /// the plot floor. Pure Text — no chart, no marks.
    private func axisGutter(_ labels: [String], tint: Color) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            ForEach(labels.indices, id: \.self) { i in
                Text(labels[i])
                    .font(.system(size: 9, weight: .semibold).monospacedDigit())
                    .foregroundStyle(tint.opacity(0.8))
                if i < labels.count - 1 { Spacer(minLength: 0) }
            }
        }
        .frame(width: 24)
        .padding(.bottom, 18)   // clears the x-axis label band so 0 sits on the floor
    }

    private var legendRow: some View {
        HStack(spacing: 10) {
            legendChip("Strain", tint: LifeOSColor.Metric.strain)
            legendChip("Recovery", tint: LifeOSColor.Metric.peak)
            Spacer()
        }
    }

    // MARK: - 2b. Quadrant scatter

    @ViewBuilder
    private var scatterCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Recovery vs strain — every day")
                if balance.pairedDayCount < 5 {
                    metricEmpty(
                        icon: "circle.grid.cross",
                        "Log activity and let recovery score for about a week — then every day plots here against the strain your recovery green-lit."
                    )
                } else {
                    scatterChart.frame(height: 260)
                    scatterLegend
                    Text("Each dot is a day: recovery across the bottom, that day's strain up the side. The shaded corridor is the strain your recovery actually green-lit. Dots above it on the left are the days you overreached.")
                        .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var scatterChart: some View {
        let lastID = lastPairedID
        return Chart {
            // Recommended-strain corridor — stairstep slabs per recovery
            // bucket. RectangleMark on CONTINUOUS axes, no LineMark → safe.
            ForEach(QuadrantGeometry.recommendedSlabs) { slab in
                RectangleMark(
                    xStart: .value("rLo", slab.recLow),
                    xEnd:   .value("rHi", slab.recHigh),
                    yStart: .value("sLo", slab.strainLow),
                    yEnd:   .value("sHi", slab.strainHigh)
                )
                .foregroundStyle(LifeOSColor.Metric.peak.opacity(0.10))
            }
            // Quadrant tint wash.
            ForEach(QuadrantGeometry.quadrantRects) { r in
                RectangleMark(
                    xStart: .value("xLo", r.xRange.lowerBound),
                    xEnd:   .value("xHi", r.xRange.upperBound),
                    yStart: .value("yLo", r.yRange.lowerBound),
                    yEnd:   .value("yHi", r.yRange.upperBound)
                )
                .foregroundStyle(QuadrantGlyph.tint(r.quadrant).opacity(0.05))
            }
            // The day dots — colored by quadrant; today drawn larger.
            ForEach(balance.series.filter { $0.recovery != nil }) { p in
                PointMark(
                    x: .value("Recovery", p.recovery ?? 0),
                    y: .value("Strain", p.strain)
                )
                .foregroundStyle(QuadrantGlyph.tint(p.quadrant))
                .symbolSize(p.id == lastID ? 130 : 55)
            }
        }
        .chartXScale(domain: 0...100)
        .chartYScale(domain: 0...21)
        .chartXAxisLabel("Recovery", position: .bottom, alignment: .center, spacing: 4)
        .chartYAxisLabel("Strain", position: .leading, alignment: .center, spacing: 4)
        .chartXAxis {
            AxisMarks(values: [0, 34, 67, 100]) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
            }
        }
        .chartYAxis {
            AxisMarks(values: [0, 9, 14, 21]) { _ in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private var scatterLegend: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                legendChip("Smart push", tint: QuadrantGlyph.tint(.primedAndPushed))
                legendChip("Overreaching", tint: QuadrantGlyph.tint(.drainedButPushed))
                Spacer()
            }
            HStack(spacing: 10) {
                legendChip("Room to push", tint: QuadrantGlyph.tint(.primedAndRested))
                legendChip("Recommended zone", tint: LifeOSColor.Metric.peak)
                Spacer()
            }
        }
    }

    // MARK: - 2c. ACWR gauge

    private var acwrCard: some View {
        Card(tint: acwrTint) {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Load ramp (ACWR)")
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(balance.acwr.map { String(format: "%.2f", $0) } ?? "—")
                        .font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
                        .foregroundStyle(acwrTint)
                    ACWRBandPill(band: balance.acwrBand)
                }
                ACWRTrack(acwr: balance.acwr, height: 14)
                HStack {
                    Text("0.8").frame(maxWidth: .infinity, alignment: .leading)
                    Text("1.3").frame(maxWidth: .infinity, alignment: .center)
                    Text("1.5").frame(maxWidth: .infinity, alignment: .trailing)
                }
                .font(.system(size: 9, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg3)
                Text(acwrGuidance)
                    .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var acwrTint: Color {
        switch balance.acwrBand {
        case .sweetSpot:  return LifeOSColor.success
        case .caution:    return LifeOSColor.warning
        case .danger:     return LifeOSColor.danger
        case .detraining: return LifeOSColor.fg2
        case .unknown:    return LifeOSColor.fg3
        }
    }

    private var acwrGuidance: String {
        switch balance.acwrBand {
        case .sweetSpot:
            return "Your last 7 days of load sit right against your 28-day base — the ramp sports science calls the safe zone for building fitness."
        case .caution:
            return "Acute load is outrunning your base. Fine for a planned overload block; don't let it ride for weeks."
        case .danger:
            return "Acute load is well above your chronic base — the classic spike associated with overuse injury. Pull back or insert an easy week."
        case .detraining:
            return "Recent load is well under your base. If this wasn't a planned deload, there's room to add work back in."
        case .unknown:
            return "Needs about three weeks of logged activity to compare your recent load against your baseline."
        }
    }

    // MARK: - 2d. Lagged callout

    @ViewBuilder
    private var lagCard: some View {
        if let lag = balance.lag {
            let pct = Int((abs(lag.pctChange) * 100).rounded())
            let lower = lag.deltaPoints < 0
            let tint = lower ? LifeOSColor.warning : LifeOSColor.success
            Card(tint: tint) {
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        Circle().fill(tint.opacity(0.16))
                        Image(systemName: lower ? "arrow.down.right.circle.fill" : "checkmark.seal.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(tint)
                    }
                    .frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(lower
                             ? "Recovery runs \(pct)% lower after your hardest days"
                             : "Recovery holds after your hardest days")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(lower
                             ? "Across your \(lag.hardDayCount) heaviest-strain days, the next morning's recovery averaged \(pct)% below your easy-day mornings. Plan recovery into the day after you go hard."
                             : "Across your \(lag.hardDayCount) heaviest-strain days, next-morning recovery held up — your recovery is keeping pace with the load you're putting on it.")
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    // MARK: - Shared bits

    private func legendChip(_ label: String, tint: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(tint).frame(width: 7, height: 7)
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(LifeOSColor.fg2)
        }
    }

    private func metricEmpty(icon: String, _ message: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(LifeOSColor.Metric.peak.opacity(0.14))
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(LifeOSColor.Metric.peak)
            }
            .frame(width: 38, height: 38)
            Text(message)
                .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
    }
}

// MARK: - Quadrant geometry (restates StrainRecoveryEngine cutoffs)

enum QuadrantGeometry {
    static let recLow = 34.0, recHigh = 67.0
    static let strainLow = 9.0, strainHigh = 14.0

    struct QuadRect: Identifiable {
        let id = UUID()
        let xRange: ClosedRange<Double>   // recovery
        let yRange: ClosedRange<Double>   // strain
        let quadrant: StrainRecoveryBalance.Quadrant
    }
    static let quadrantRects: [QuadRect] = [
        QuadRect(xRange: recHigh...100, yRange: strainHigh...21, quadrant: .primedAndPushed),
        QuadRect(xRange: recHigh...100, yRange: 0...strainLow,   quadrant: .primedAndRested),
        QuadRect(xRange: 0...recLow,    yRange: strainHigh...21, quadrant: .drainedButPushed),
    ]

    struct Slab: Identifiable {
        let id = UUID()
        let recLow: Double; let recHigh: Double
        let strainLow: Double; let strainHigh: Double
    }
    // Mirrors RecoveryEngine.recommendedStrain(for:) band ranges.
    static let recommendedSlabs: [Slab] = [
        Slab(recLow: 0,  recHigh: 34,  strainLow: 0,  strainHigh: 8),
        Slab(recLow: 34, recHigh: 50,  strainLow: 6,  strainHigh: 11),
        Slab(recLow: 50, recHigh: 67,  strainLow: 9,  strainHigh: 14),
        Slab(recLow: 67, recHigh: 85,  strainLow: 12, strainHigh: 17),
        Slab(recLow: 85, recHigh: 100, strainLow: 15, strainHigh: 21),
    ]
}

// MARK: - Shared ACWR widgets (used by the card + the detail gauge)

/// Horizontal zoned track on a 0…2 ACWR domain with a marker at the current
/// value. Plain SwiftUI shapes — reduce-motion safe, no chart.
struct ACWRTrack: View {
    let acwr: Double?
    var height: CGFloat = 14

    private let domainMax = 2.0
    private var zones: [(span: Double, color: Color)] {
        [
            (0.8,        LifeOSColor.fg3),       // 0.0–0.8 detraining
            (1.3 - 0.8,  LifeOSColor.success),    // sweet spot
            (1.5 - 1.3,  LifeOSColor.warning),    // caution
            (2.0 - 1.5,  LifeOSColor.danger),     // danger
        ]
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(zones.indices, id: \.self) { i in
                        Rectangle()
                            .fill(zones[i].color.opacity(0.28))
                            .frame(width: w * zones[i].span / domainMax)
                    }
                }
                .clipShape(Capsule())
                Capsule()
                    .stroke(LifeOSColor.success.opacity(0.5), lineWidth: 0.5)
                    .frame(width: w * (1.3 - 0.8) / domainMax)
                    .offset(x: w * 0.8 / domainMax)
                if let acwr {
                    let x = w * min(max(acwr, 0), domainMax) / domainMax
                    Capsule()
                        .fill(LifeOSColor.fg)
                        .frame(width: 3, height: height + 6)
                        .offset(x: min(max(x - 1.5, 0), w - 3))
                }
            }
        }
        .frame(height: height)
    }
}

struct ACWRBandPill: View {
    let band: StrainRecoveryBalance.ACWRBand
    var body: some View {
        let (text, c): (String, Color) = {
            switch band {
            case .sweetSpot:  return ("SWEET SPOT", LifeOSColor.success)
            case .caution:    return ("CAUTION", LifeOSColor.warning)
            case .danger:     return ("DANGER", LifeOSColor.danger)
            case .detraining: return ("DETRAINING", LifeOSColor.fg2)
            case .unknown:    return ("LEARNING", LifeOSColor.fg3)
            }
        }()
        return Text(text)
            .font(.system(size: 9, weight: .heavy)).tracking(0.8)
            .foregroundStyle(c)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(c.opacity(0.15)))
    }
}
