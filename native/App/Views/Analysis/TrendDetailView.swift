import SwiftUI
import SwiftData
import Charts

/// Full-screen drill-in for any daily trend metric, pushed from an
/// Analysis card. Mirrors the HeartRateGraphView feel: a stats header
/// that echoes the scrubbed value, a large scrubbable chart, its own
/// range control, and a summary-stats strip. Generic over which series
/// it pulls off `AnalysisData` via the `series` closure, so Performance,
/// Sleep, Weight, Steps (and any future metric) reuse one screen.
struct TrendDetailView: View {
    let title: String
    let kicker: String
    let tint: Color
    let unit: String
    /// Pull the metric's daily series out of a computed snapshot.
    let series: (AnalysisData) -> [TrendPoint]
    /// Format the hero / readout value (defaults to rounded integer).
    var valueFormat: (Double) -> String = { "\(Int($0.rounded()))" }
    var yAxisFormat: (Double) -> String = { "\(Int($0.rounded()))" }
    /// Optional fixed y-domain (e.g. score 0–100).
    var yDomain: ClosedRange<Double>?
    /// "higher is better" drives the delta-pill tint direction.
    var higherIsBetter: Bool = true

    // MARK: New, opt-in params (defaults preserve every existing call site).

    /// Shade a learned-baseline band (mean ± 1 SD computed from the
    /// visible points) behind the line. Great for HRV/RHR where "is this
    /// reading inside my normal range" is the real question. Off by
    /// default; needs ≥ 4 points to be statistically meaningful.
    var showBaselineBand: Bool = false
    /// Draw a solid baseline rule at the series mean (distinct from the
    /// dashed average). Pairs with the band. Off by default.
    var showBaselineRule: Bool = false
    /// Show a "+8% vs start" caption above the chart. Off by default.
    var showDeltaCaption: Bool = false
    /// Animate the line drawing in when the chart appears. Off by default.
    var animateChart: Bool = false

    @Query private var dailies: [DailyEntry]
    @Query private var sessions: [LiftSessionEntry]

    @State private var range: AnalysisView.TimeRange = .month
    @State private var data: AnalysisData = .empty
    @State private var scrubbed: TrendPoint?

    private var points: [TrendPoint] { series(data) }

    private var average: Double? {
        guard !points.isEmpty else { return nil }
        return points.map(\.value).reduce(0, +) / Double(points.count)
    }

    /// mean ± 1 standard deviation over the visible window — the
    /// "normal range" zone. nil when there's too little data to be
    /// meaningful (fewer than 4 points) so the band doesn't mislead.
    private var baselineBand: (low: Double, high: Double)? {
        guard showBaselineBand else { return nil }
        let values = points.map(\.value)
        guard values.count >= 4, let mean = average else { return nil }
        let variance = values.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(values.count)
        let sd = variance.squareRoot()
        guard sd > 0 else { return nil }
        return (mean - sd, mean + sd)
    }

    /// Last value vs the mean of the prior points — same definition the
    /// cards use, so the drill-in agrees with the card it came from.
    private var delta: Double? {
        guard points.count >= 2 else { return nil }
        let last = points.last!.value
        let prior = points.dropLast().map(\.value)
        return last - prior.reduce(0, +) / Double(prior.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                rangeSelector
                statsHeader
                if points.isEmpty {
                    emptyState
                } else {
                    chartCard
                    summaryStrip
                }
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { refresh() }
        .onChange(of: range) { _, _ in refresh() }
        .onChange(of: dailies.count) { _, _ in refresh() }
        .onChange(of: sessions.count) { _, _ in refresh() }
    }

    private func refresh() {
        data = AnalysisData.compute(dailies: dailies, sessions: sessions, daysBack: range.dayCount)
    }

    // MARK: - Range

    private var rangeSelector: some View {
        Picker("Range", selection: $range) {
            ForEach(AnalysisView.TimeRange.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
    }

    // MARK: - Stats header

    private var statsHeader: some View {
        Card(tint: tint) {
            VStack(alignment: .leading, spacing: 12) {
                Text(scrubbed != nil ? "SELECTED" : kicker.uppercased())
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(tint)

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(heroValue)
                        .font(.system(size: 52, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(LifeOSColor.fg)
                        .contentTransition(.numericText())
                    if !unit.isEmpty {
                        Text(unit)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    if let p = scrubbed {
                        Text(ScrubbableTrendChart.dateLabel(p.day))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg2)
                    } else if let d = delta {
                        deltaPill(d)
                    }
                }
            }
        }
    }

    private var heroValue: String {
        if let p = scrubbed { return valueFormat(p.value) }
        if let last = points.last?.value { return valueFormat(last) }
        return "—"
    }

    private func deltaPill(_ d: Double) -> some View {
        let good = higherIsBetter ? d >= 0 : d <= 0
        let c = abs(d) < 0.05 ? LifeOSColor.fg2 : (good ? LifeOSColor.success : LifeOSColor.danger)
        let label = abs(d) < 0.05 ? "stable" : (d >= 0 ? "+" : "−") + valueFormat(abs(d))
        return HStack(spacing: 3) {
            if abs(d) >= 0.05 {
                Image(systemName: d >= 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.system(size: 11, weight: .bold))
            }
            Text(label)
                .font(.system(size: 14, weight: .bold).monospacedDigit())
        }
        .foregroundStyle(c)
    }

    // MARK: - Chart

    private var chartCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("TREND")
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(tint)
                    Spacer()
                    Text("\(points.count) days")
                        .font(.system(size: 10, weight: .medium).monospacedDigit())
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Text("Drag across the chart to scrub")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)

                ScrubbableTrendChart(
                    points: points,
                    tint: tint,
                    average: average,
                    showPoints: points.count <= 45,
                    valueFormat: valueFormat,
                    yAxisFormat: yAxisFormat,
                    yDomain: yDomain,
                    band: baselineBand,
                    baseline: (showBaselineRule ? average : nil),
                    deltaCaption: showDeltaCaption,
                    deltaHigherIsBetter: higherIsBetter,
                    animateOnAppear: animateChart,
                    onScrub: { scrubbed = $0 }
                )
                .frame(height: 240)
            }
        }
    }

    // MARK: - Summary

    private var summaryStrip: some View {
        let values = points.map(\.value)
        return Card {
            HStack(spacing: 12) {
                stat("MIN", values.min().map(valueFormat) ?? "—")
                stat("AVG", average.map(valueFormat) ?? "—")
                stat("MAX", values.max().map(valueFormat) ?? "—")
                stat("LATEST", values.last.map(valueFormat) ?? "—")
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .semibold)).tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Empty

    private var emptyState: some View {
        Card {
            VStack(spacing: 10) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 34))
                    .foregroundStyle(tint.opacity(0.7))
                Text("Not enough data yet")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Text("Log a few more days in this range and the full scrubbable trend shows up here.")
                    .font(.system(size: 13))
                    .foregroundStyle(LifeOSColor.fg2)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
        }
    }
}
