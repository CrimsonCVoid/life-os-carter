import SwiftUI
import Charts

/// A single labeled point on a daily time-series. The reusable trend
/// chart and its drill-in details all speak this shape.
struct TrendPoint: Identifiable, Hashable {
    let id: Date
    let day: Date
    let value: Double

    init(day: Date, value: Double) {
        self.id = day
        self.day = day
        self.value = value
    }
}

/// The shared scrubbable line/area chart — the generalization of the
/// HeartRateGraphView scrub interaction onto a daily series. Drag to
/// move a vertical RuleMark + a floating readout (date + value), with
/// `Haptics.tick()` firing once per distinct day crossed (debounced on
/// the resolved day, not pixels). Reduce-motion safe: the readout is a
/// static label, never animated state.
///
/// `onScrub` reports the currently-selected point (nil on release) so a
/// host card/detail can echo the value into its stats header.
struct ScrubbableTrendChart: View {
    let points: [TrendPoint]
    var tint: Color
    /// Optional second tint for the area-fill gradient base.
    var fillTint: Color?
    /// Dashed average reference line; nil hides it.
    var average: Double?
    var showArea: Bool = true
    var showPoints: Bool = false
    /// Format a value for the floating readout (e.g. "62 bpm", "8.4k").
    var valueFormat: (Double) -> String
    /// Y-axis tick formatter; defaults to integer rounding.
    var yAxisFormat: (Double) -> String = { "\(Int($0.rounded()))" }
    /// Explicit y-domain; nil = auto-pad off the data.
    var yDomain: ClosedRange<Double>?
    var onScrub: ((TrendPoint?) -> Void)?

    @State private var scrubDay: Date?
    @State private var lastHapticDay: Date?

    private var selected: TrendPoint? {
        guard let scrubDay else { return nil }
        return points.first { Calendar.current.isDate($0.day, inSameDayAs: scrubDay) }
    }

    private var resolvedYDomain: ClosedRange<Double> {
        if let yDomain { return yDomain }
        let values = points.map(\.value)
        guard let lo = values.min(), let hi = values.max() else { return 0...1 }
        if lo == hi { return (lo - 1)...(hi + 1) }
        let pad = (hi - lo) * 0.12
        return (lo - pad)...(hi + pad)
    }

    private var fill: Color { fillTint ?? tint }

    var body: some View {
        Chart {
            if showArea {
                ForEach(points) { p in
                    AreaMark(
                        x: .value("Day", p.day),
                        y: .value("Value", p.value)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [fill.opacity(0.55), fill.opacity(0.04)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                }
            }

            ForEach(points) { p in
                LineMark(
                    x: .value("Day", p.day),
                    y: .value("Value", p.value)
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(tint)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))

                if showPoints {
                    PointMark(
                        x: .value("Day", p.day),
                        y: .value("Value", p.value)
                    )
                    .foregroundStyle(tint)
                    .symbolSize(16)
                }
            }

            if let average {
                RuleMark(y: .value("Average", average))
                    .foregroundStyle(LifeOSColor.fg3.opacity(0.4))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3]))
                    .annotation(position: .topTrailing, alignment: .trailing, spacing: 2) {
                        Text("avg \(yAxisFormat(average))")
                            .font(.system(size: 9))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
            }

            if let p = selected {
                RuleMark(x: .value("Day", p.day))
                    .foregroundStyle(LifeOSColor.fg2.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1))
                PointMark(
                    x: .value("Day", p.day),
                    y: .value("Value", p.value)
                )
                .foregroundStyle(tint)
                .symbolSize(120)
            }
        }
        .chartYScale(domain: resolvedYDomain)
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(yAxisFormat(v)).foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
        .chartXAxis(.hidden)
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in handleScrub(v.location, proxy: proxy, geo: geo) }
                            .onEnded { _ in endScrub() }
                    )
                if let p = selected {
                    readout(for: p, proxy: proxy, geo: geo)
                }
            }
        }
    }

    // MARK: - Scrubbing

    private func handleScrub(_ location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        guard !points.isEmpty else { return }
        guard let plotAnchor = proxy.plotFrame else { return }
        let origin = geo[plotAnchor].origin
        let xInPlot = location.x - origin.x
        guard let rawDate: Date = proxy.value(atX: xInPlot) else { return }
        guard let nearest = nearestPoint(to: rawDate) else { return }

        if scrubDay == nil || !Calendar.current.isDate(scrubDay!, inSameDayAs: nearest.day) {
            scrubDay = nearest.day
            onScrub?(nearest)
        }
        if lastHapticDay == nil || !Calendar.current.isDate(lastHapticDay!, inSameDayAs: nearest.day) {
            lastHapticDay = nearest.day
            Haptics.tick()
        }
    }

    private func endScrub() {
        scrubDay = nil
        lastHapticDay = nil
        onScrub?(nil)
        Haptics.tap()
    }

    /// Nearest point by absolute time distance — points are sorted
    /// ascending so a linear scan is fine at these counts (≤365).
    private func nearestPoint(to date: Date) -> TrendPoint? {
        points.min { abs($0.day.timeIntervalSince(date)) < abs($1.day.timeIntervalSince(date)) }
    }

    // MARK: - Floating readout

    /// A small date + value chip that tracks the finger horizontally,
    /// clamped inside the plot so it never clips off-screen.
    @ViewBuilder
    private func readout(for p: TrendPoint, proxy: ChartProxy, geo: GeometryProxy) -> some View {
        if let plotAnchor = proxy.plotFrame,
           let x = proxy.position(forX: p.day) {
            let plot = geo[plotAnchor]
            let chipWidth: CGFloat = 96
            let raw = plot.origin.x + x
            let clamped = min(max(raw, plot.origin.x + chipWidth / 2),
                              plot.origin.x + plot.width - chipWidth / 2)
            VStack(spacing: 1) {
                Text(Self.dateLabel(p.day))
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg2)
                Text(valueFormat(p.value))
                    .font(.system(size: 13, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(LifeOSColor.elevated, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(tint.opacity(0.35), lineWidth: 0.5)
            )
            .frame(width: chipWidth)
            .position(x: clamped, y: plot.origin.y + 18)
            .allowsHitTesting(false)
        }
    }

    static func dateLabel(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: d)
    }
}
