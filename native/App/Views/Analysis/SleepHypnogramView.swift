import SwiftUI
import SwiftData
import Charts

/// Full-screen night-timeline hypnogram — the sleep analog of
/// `HeartRateGraphView`. Draws the timed stage segments returned by
/// `SleepClient` as stepped lanes across real clock time (inBed→wake),
/// the way Apple Health / Oura lay out a night: Awake on top, then REM,
/// Light, Deep at the bottom.
///
/// Scrubbing mirrors `HeartRateGraphView` exactly: dragging the chart
/// moves a vertical rule, the header swaps from night aggregates to the
/// stage-at-that-instant, `Haptics.tick()` fires once per stage-segment
/// boundary crossed, and `Haptics.tap()` confirms on release.
///
/// We render off the decoded `Night` value directly (cached read first,
/// then a network refresh) so the view works without a live @Query.
struct SleepHypnogramView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Wake date string "YYYY-MM-DD" the night belongs to.
    let date: String

    @State private var night: SleepClient.Night?
    @State private var phase: LoadPhase = .loading

    /// Clock instant the user is currently scrubbing to. nil = not
    /// scrubbing; the header shows night aggregates instead.
    @State private var scrubDate: Date?
    /// Index of the segment under the scrub point last time we fired a
    /// haptic — debounce so dragging within one segment doesn't refire.
    @State private var lastHapticSegment: Int?

    private enum LoadPhase { case loading, ready, empty }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                statsHeader
                switch phase {
                case .loading: skeleton
                case .empty:   emptyState
                case .ready:   chartCard; stageBreakdown
                }
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(AmbientBackground(accent: LifeOSColor.Metric.sleep).ignoresSafeArea())
        .navigationTitle("Sleep")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Load

    private func load() async {
        if let cached = SleepClient.shared.cachedNight(date, in: modelContext) {
            night = cached
            phase = cached.isEmpty ? .empty : .ready
        }
        let fresh = await SleepClient.shared.loadNight(date, in: modelContext)
        if let fresh {
            night = fresh
            phase = fresh.isEmpty ? .empty : .ready
        } else if night == nil {
            phase = .empty
        }
    }

    // MARK: - Stats header

    private var statsHeader: some View {
        Card(tint: LifeOSColor.Metric.sleep) {
            VStack(alignment: .leading, spacing: 14) {
                Text(scrubDate != nil ? "SELECTED" : "LAST NIGHT")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.sleep)

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(heroValue)
                        .font(.system(size: 56, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())
                    Text(heroUnit)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    if let d = scrubDate, let seg = segment(at: d) {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Self.timeFormatter.string(from: d))
                                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(.white)
                            stageChip(seg.stage)
                        }
                    }
                }

                HStack(spacing: 10) {
                    tile("DEEP",  value: night.map { hm($0.deepMin) } ?? "—", tint: LifeOSColor.SleepStage.deep)
                    tile("REM",   value: night.map { hm($0.remMin) } ?? "—", tint: LifeOSColor.SleepStage.rem)
                    tile("LIGHT", value: night.map { hm($0.lightMin) } ?? "—", tint: LifeOSColor.SleepStage.light)
                    tile("AWAKE", value: night.map { hm($0.awakeMin) } ?? "—", tint: LifeOSColor.SleepStage.awake)
                }

                if let n = night, !n.isEmpty {
                    HStack(spacing: 12) {
                        metaItem("IN BED", hm(n.inBedMin))
                        if let eff = n.efficiency {
                            metaItem("EFFICIENCY", "\(Int((eff * 100).rounded()))%")
                        }
                        metaItem("WINDOW", clockRange(n))
                    }
                }
            }
        }
    }

    /// Hero shows the scrubbed segment's stage label while scrubbing,
    /// otherwise total time asleep.
    private var heroValue: String {
        if let d = scrubDate, let seg = segment(at: d) { return seg.stage.label }
        guard let n = night, !n.isEmpty else { return "—" }
        let h = n.asleepMin / 60, m = n.asleepMin % 60
        return String(format: "%d:%02d", h, m)
    }

    private var heroUnit: String {
        scrubDate != nil ? "" : "asleep"
    }

    private func tile(_ label: String, value: String, tint: Color) -> some View {
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

    private func metaItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 8, weight: .semibold)).tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
            Text(value)
                .font(.system(size: 13, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Chart

    private var chartCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("HYPNOGRAM")
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(LifeOSColor.Metric.sleep)
                    Spacer()
                    Text("\(segments.count) stages")
                        .font(.system(size: 10, weight: .medium).monospacedDigit())
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Text("Drag across the chart to scrub")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)

                chart
                    .frame(height: 220)

                stageLegend
            }
        }
    }

    private var segments: [SleepClient.Segment] { night?.segments ?? [] }

    /// X-axis domain is the real sleep window. Falls back to the first
    /// and last segment edges if inBed/wake are degenerate.
    private var xDomain: ClosedRange<Date> {
        guard let n = night, !n.isEmpty else {
            return Date()...Date().addingTimeInterval(60)
        }
        let lo = min(n.inBed, segments.first?.start ?? n.inBed)
        let hiCandidate = max(n.wake, segments.last?.end ?? n.wake)
        // Guard against a zero-width domain (single instantaneous segment).
        let hi = hiCandidate > lo ? hiCandidate : lo.addingTimeInterval(60)
        return lo...hi
    }

    /// Lane order top→bottom: awake(0), rem(1), light(2), deep(3). We
    /// invert the numeric lane so deep sits at the visual bottom under
    /// `.chartYScale(domain: .reversed)` semantics handled via plotting
    /// lane directly with a reversed y-scale.
    private var chart: some View {
        Chart {
            ForEach(segments) { seg in
                // Each stage as a thick horizontal bar in its lane,
                // spanning its real clock duration.
                RectangleMark(
                    xStart: .value("Start", seg.start),
                    xEnd: .value("End", seg.end),
                    y: .value("Lane", seg.stage.lane)
                )
                .foregroundStyle(stageColor(seg.stage))
                .cornerRadius(3)
            }

            // Stepped connector line tracing the stage transitions, the
            // classic hypnogram silhouette over the bars.
            ForEach(stepPoints) { p in
                LineMark(
                    x: .value("Time", p.time),
                    y: .value("Lane", p.lane),
                    series: .value("Series", "step")
                )
                .interpolationMethod(.stepEnd)
                .foregroundStyle(LifeOSColor.fg2.opacity(0.35))
                .lineStyle(StrokeStyle(lineWidth: 1))
            }

            if let d = scrubDate {
                RuleMark(x: .value("Time", d))
                    .foregroundStyle(LifeOSColor.fg2.opacity(0.55))
                    .lineStyle(StrokeStyle(lineWidth: 1))
                if let seg = segment(at: d) {
                    PointMark(
                        x: .value("Time", d),
                        y: .value("Lane", seg.stage.lane)
                    )
                    .foregroundStyle(stageColor(seg.stage))
                    .symbolSize(120)
                }
            }
        }
        .chartXScale(domain: xDomain)
        // Lanes 0...3 reversed so awake(0) renders at the top and
        // deep(3) at the bottom — the standard hypnogram ordering.
        .chartYScale(domain: [3, 2, 1, 0])
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 1, 2, 3]) { value in
                AxisValueLabel {
                    if let lane = value.as(Int.self) {
                        Text(Self.laneLabel(lane))
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .hour, count: xAxisStrideHours)) { value in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel {
                    if let d = value.as(Date.self) {
                        Text(Self.axisFormatter.string(from: d))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in handleScrub(value.location, proxy: proxy, geo: geo) }
                            .onEnded { _ in endScrub() }
                    )
            }
        }
    }

    /// Pick a sensible hour tick spacing so a short nap and a long night
    /// both get a readable axis.
    private var xAxisStrideHours: Int {
        let hours = xDomain.upperBound.timeIntervalSince(xDomain.lowerBound) / 3600
        switch hours {
        case ..<3:  return 1
        case ..<7:  return 1
        default:    return 2
        }
    }

    // MARK: - Stepped silhouette points

    private struct StepPoint: Identifiable {
        let id = UUID()
        let time: Date
        let lane: Int
    }

    /// Two points per segment (start + end) so `.stepEnd` draws a flat
    /// run at the stage's lane then jumps to the next — the connecting
    /// line that reads as a classic hypnogram.
    private var stepPoints: [StepPoint] {
        segments.flatMap { [
            StepPoint(time: $0.start, lane: $0.stage.lane),
            StepPoint(time: $0.end, lane: $0.stage.lane),
        ] }
    }

    // MARK: - Scrubbing

    /// Map drag x to a clock instant inside the sleep window, move the
    /// readout, and fire one haptic per stage-segment boundary crossed.
    private func handleScrub(_ location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        guard !segments.isEmpty else { return }
        guard let plotAnchor = proxy.plotFrame else { return }
        let origin = geo[plotAnchor].origin
        let xInPlot = location.x - origin.x
        guard let raw: Date = proxy.value(atX: xInPlot) else { return }

        let lo = xDomain.lowerBound, hi = xDomain.upperBound
        let clamped = min(hi, max(lo, raw))

        scrubDate = clamped

        // One tick per distinct stage segment — drags within the same
        // segment don't refire.
        if let idx = segmentIndex(at: clamped), lastHapticSegment != idx {
            lastHapticSegment = idx
            Haptics.tick()
        }
    }

    private func endScrub() {
        scrubDate = nil
        lastHapticSegment = nil
        Haptics.tap()
    }

    /// Index of the segment whose [start, end) contains `d`; falls back
    /// to the nearest segment so the readout never reads empty in a gap.
    private func segmentIndex(at d: Date) -> Int? {
        guard !segments.isEmpty else { return nil }
        if let exact = segments.firstIndex(where: { d >= $0.start && d < $0.end }) {
            return exact
        }
        var bestIdx = 0
        var bestDist = Double.greatestFiniteMagnitude
        for (i, seg) in segments.enumerated() {
            let mid = seg.start.addingTimeInterval(seg.end.timeIntervalSince(seg.start) / 2)
            let dist = abs(mid.timeIntervalSince(d))
            if dist < bestDist { bestDist = dist; bestIdx = i }
        }
        return bestIdx
    }

    private func segment(at d: Date) -> SleepClient.Segment? {
        guard let idx = segmentIndex(at: d) else { return nil }
        return segments[idx]
    }

    // MARK: - Stage colors / chips

    private func stageColor(_ stage: SleepClient.Stage) -> Color {
        switch stage {
        case .deep:  return LifeOSColor.SleepStage.deep
        case .rem:   return LifeOSColor.SleepStage.rem
        case .light: return LifeOSColor.SleepStage.light
        case .awake: return LifeOSColor.SleepStage.awake
        }
    }

    private func stageChip(_ stage: SleepClient.Stage) -> some View {
        Text(stage.label.uppercased())
            .font(.system(size: 9, weight: .bold)).tracking(0.8)
            .foregroundStyle(stageColor(stage))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(stageColor(stage).opacity(0.16), in: Capsule())
    }

    private var stageLegend: some View {
        HStack(spacing: 10) {
            ForEach(SleepClient.Stage.allCases, id: \.self) { stage in
                HStack(spacing: 4) {
                    Circle().fill(stageColor(stage)).frame(width: 7, height: 7)
                    Text(stage.label)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: - Time in stages

    private var stageBreakdown: some View {
        let rows: [(stage: SleepClient.Stage, mins: Int)] = [
            (.deep, night?.deepMin ?? 0),
            (.rem, night?.remMin ?? 0),
            (.light, night?.lightMin ?? 0),
            (.awake, night?.awakeMin ?? 0),
        ]
        let grand = max(1, rows.reduce(0) { $0 + $1.mins })
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("TIME IN STAGES")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.sleep)

                // Single stacked proportion bar across all four stages.
                GeometryReader { geo in
                    HStack(spacing: 2) {
                        ForEach(rows, id: \.stage) { row in
                            let frac = Double(row.mins) / Double(grand)
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(stageColor(row.stage))
                                .frame(width: max(0, geo.size.width * frac - 2))
                        }
                    }
                }
                .frame(height: 10)

                ForEach(rows, id: \.stage) { row in
                    let frac = Double(row.mins) / Double(grand)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(row.stage.label)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                            Spacer()
                            Text("\(Int((frac * 100).rounded()))%")
                                .font(.system(size: 11, weight: .medium).monospacedDigit())
                                .foregroundStyle(LifeOSColor.fg3)
                            Text(hm(row.mins))
                                .font(.system(size: 13, weight: .bold).monospacedDigit())
                                .foregroundStyle(stageColor(row.stage))
                                .frame(width: 56, alignment: .trailing)
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(LifeOSColor.elevated)
                                Capsule().fill(stageColor(row.stage))
                                    .frame(width: max(2, geo.size.width * frac))
                            }
                        }
                        .frame(height: 6)
                    }
                }
            }
        }
    }

    // MARK: - Loading / empty states

    private var skeleton: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                RoundedRectangle(cornerRadius: 6).fill(LifeOSColor.elevated)
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: 12).fill(LifeOSColor.elevated)
                    .frame(height: 200)
                    .shimmerHypno(active: !reduceMotion)
            }
        }
    }

    private var emptyState: some View {
        EmptyStateCard(
            icon: "bed.double.fill",
            title: "No sleep stages for this night",
            subtitle: "Once your watch syncs last night's sleep, the full stage-by-stage timeline shows up here — scrub it to relive the night minute by minute.",
            tint: LifeOSColor.Metric.sleep
        )
    }

    // MARK: - Formatting helpers

    private func hm(_ minutes: Int) -> String {
        guard minutes > 0 else { return "0m" }
        let h = minutes / 60, m = minutes % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    private func clockRange(_ n: SleepClient.Night) -> String {
        "\(Self.axisFormatter.string(from: n.inBed))–\(Self.axisFormatter.string(from: n.wake))"
    }

    private static func laneLabel(_ lane: Int) -> String {
        switch lane {
        case 0:  return "Awake"
        case 1:  return "REM"
        case 2:  return "Light"
        default: return "Deep"
        }
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "h:mm a"; return f
    }()
    private static let axisFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "h a"; return f
    }()
}

// MARK: - Shimmer (loading skeleton)

private struct ShimmerHypno: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay {
                if active {
                    GeometryReader { geo in
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.08), .clear],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .offset(x: phase * geo.size.width)
                        .onAppear {
                            withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) {
                                phase = 1
                            }
                        }
                    }
                    .clipped()
                }
            }
    }
}

private extension View {
    func shimmerHypno(active: Bool) -> some View { modifier(ShimmerHypno(active: active)) }
}
