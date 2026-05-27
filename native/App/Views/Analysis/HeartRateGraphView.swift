import SwiftUI
import SwiftData
import Charts

/// Full-screen intraday heart-rate detail, pushed from the Analysis
/// "Heart Health" card. The marquee analytics surface: a scrubbable
/// per-minute HR line across the day, colored by training zone, with
/// workout windows shaded behind it and a stats header.
///
/// Scrubbing is the signature interaction — dragging across the chart
/// moves a vertical readout rule and fires `Haptics.tick()` once per
/// distinct minute the finger crosses, so it feels like raking a stock
/// chart with your thumb. Debounced on the resolved minute (not pixels)
/// so it's one crisp tick per minute, never a buzz-storm.
struct HeartRateGraphView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Lift sessions are read to shade workout windows behind the line.
    @Query private var sessions: [LiftSessionEntry]

    /// Decoded day returned by HeartRateClient. We render off this value
    /// directly rather than a live @Query so the view works even if the
    /// HRDaySeries model isn't registered in the container schema.
    @State private var day: HeartRateClient.Day?
    @State private var phase: LoadPhase = .loading
    @State private var maxHR: Int = 190

    /// Minute-of-day the user is currently scrubbing to. nil = not
    /// scrubbing; the header shows day aggregates instead of a point.
    @State private var scrubMinute: Int?
    /// Last minute we fired a haptic for — debounce so dragging across
    /// a single minute's pixel width doesn't machine-gun the taptic.
    @State private var lastHapticMinute: Int?

    private enum LoadPhase { case loading, ready, empty }

    private let date = ISO8601DateFormatter.dateOnly.string(from: Date())

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                statsHeader
                switch phase {
                case .loading: skeleton
                case .empty:   emptyState
                case .ready:   chartCard; zoneBreakdown
                }
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("Heart Rate")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Load

    private func load() async {
        maxHR = Self.computeMaxHR(in: modelContext)
        // Show any cached day instantly, then refresh from network.
        if let cached = HeartRateClient.shared.cachedDay(date, in: modelContext) {
            day = cached
            phase = cached.isEmpty ? .empty : .ready
        }
        let fresh = await HeartRateClient.shared.loadDay(date, in: modelContext)
        if let fresh {
            day = fresh
            phase = fresh.isEmpty ? .empty : .ready
        } else if day == nil {
            phase = .empty
        }
    }

    // MARK: - Stats header

    private var statsHeader: some View {
        Card(tint: LifeOSColor.Metric.mood) {
            VStack(alignment: .leading, spacing: 14) {
                Text(scrubMinute != nil ? "SELECTED" : "TODAY")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.mood)

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(heroValue)
                        .font(.system(size: 56, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())
                    Text("bpm")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    if let m = scrubMinute {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Self.clockLabel(m))
                                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(.white)
                            zoneChip(for: scrubBucket?.avg ?? 0)
                        }
                    }
                }

                HStack(spacing: 10) {
                    tile("MIN", value: day.map { "\($0.dayMin)" } ?? "—", tint: LifeOSColor.Metric.sleep)
                    tile("AVG", value: day.map { "\($0.dayAvg)" } ?? "—", tint: LifeOSColor.Metric.mood)
                    tile("MAX", value: day.map { "\($0.dayMax)" } ?? "—", tint: LifeOSColor.danger)
                    tile("RESTING", value: day?.restingHr.map { "\($0)" } ?? "—", tint: LifeOSColor.Metric.peak)
                }
            }
        }
    }

    private var heroValue: String {
        if let b = scrubBucket { return "\(b.avg)" }
        return day.map { "\($0.dayAvg)" } ?? "—"
    }

    private func tile(_ label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .semibold)).tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(tint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Chart

    private var chartCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("INTRADAY")
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(LifeOSColor.Metric.mood)
                    Spacer()
                    Text("\(day?.count ?? 0) samples")
                        .font(.system(size: 10, weight: .medium).monospacedDigit())
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Text("Drag across the chart to scrub")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)

                chart
                    .frame(height: 240)

                zoneLegend
            }
        }
    }

    private var buckets: [HeartRateClient.Bucket] { day?.buckets ?? [] }

    private var yDomain: ClosedRange<Int> {
        guard let d = day, d.count > 0 else { return 40...180 }
        let lo = max(30, d.dayMin - 8)
        let hi = max(d.dayMax + 8, Int(Double(maxHR) * 0.9))
        return lo...hi
    }

    private var chart: some View {
        Chart {
            // Faint min–max band behind the avg line.
            ForEach(buckets) { b in
                AreaMark(
                    x: .value("Minute", b.minute),
                    yStart: .value("Min", b.min),
                    yEnd: .value("Max", b.max)
                )
                .interpolationMethod(.monotone)
                .foregroundStyle(LifeOSColor.Metric.mood.opacity(0.10))
            }

            // Workout windows shaded behind the line.
            ForEach(workoutWindows, id: \.start) { w in
                RectangleMark(
                    xStart: .value("Start", w.start),
                    xEnd: .value("End", w.end)
                )
                .foregroundStyle(LifeOSColor.Metric.strain.opacity(0.14))
            }

            // The avg HR line.
            ForEach(buckets) { b in
                LineMark(
                    x: .value("Minute", b.minute),
                    y: .value("BPM", b.avg)
                )
                .interpolationMethod(.monotone)
                .foregroundStyle(LifeOSColor.Metric.mood)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            }

            // Resting-HR reference line.
            if let resting = day?.restingHr {
                RuleMark(y: .value("Resting", resting))
                    .foregroundStyle(LifeOSColor.Metric.peak.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3]))
                    .annotation(position: .trailing, alignment: .leading, spacing: 2) {
                        Text("rest \(resting)")
                            .font(.system(size: 9).monospacedDigit())
                            .foregroundStyle(LifeOSColor.Metric.peak)
                    }
            }

            // Scrubbing rule + point.
            if let m = scrubMinute, let b = scrubBucket {
                RuleMark(x: .value("Minute", m))
                    .foregroundStyle(LifeOSColor.fg2.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1))
                PointMark(
                    x: .value("Minute", m),
                    y: .value("BPM", b.avg)
                )
                .foregroundStyle(zoneColor(for: b.avg))
                .symbolSize(110)
            }
        }
        .chartYScale(domain: yDomain)
        .chartXScale(domain: 0...1439)
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
            }
        }
        .chartXAxis {
            AxisMarks(values: [0, 360, 720, 1080, 1439]) { value in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel {
                    if let m = value.as(Int.self) {
                        Text(Self.axisClockLabel(m))
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

    // MARK: - Scrubbing

    /// Map the drag x-position to the nearest sampled minute, move the
    /// readout, and fire one haptic tick per distinct minute crossed.
    private func handleScrub(_ location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        guard !buckets.isEmpty else { return }
        guard let plotAnchor = proxy.plotFrame else { return }
        let origin = geo[plotAnchor].origin
        let xInPlot = location.x - origin.x
        guard let rawMinute: Int = proxy.value(atX: xInPlot) else { return }
        let clamped = min(1439, max(0, rawMinute))

        // Snap to the nearest minute that actually has a sample so the
        // readout never lands on an empty gap (e.g. watch off the wrist).
        guard let nearest = nearestBucket(to: clamped) else { return }

        if scrubMinute != nearest.minute {
            scrubMinute = nearest.minute
        }
        // One tick per distinct minute — pixel-level drags within the
        // same minute don't refire.
        if lastHapticMinute != nearest.minute {
            lastHapticMinute = nearest.minute
            Haptics.tick()
        }
    }

    private func endScrub() {
        scrubMinute = nil
        lastHapticMinute = nil
        // A soft confirm on release; matches "lift finger off the chart".
        Haptics.tap()
    }

    private var scrubBucket: HeartRateClient.Bucket? {
        guard let m = scrubMinute else { return nil }
        return buckets.first { $0.minute == m }
    }

    /// Binary-search-ish nearest lookup; buckets are sorted ascending.
    private func nearestBucket(to minute: Int) -> HeartRateClient.Bucket? {
        guard !buckets.isEmpty else { return nil }
        var best = buckets[0]
        var bestDist = abs(best.minute - minute)
        for b in buckets {
            let d = abs(b.minute - minute)
            if d < bestDist { best = b; bestDist = d }
            if b.minute > minute && d > bestDist { break }
        }
        return best
    }

    // MARK: - Zones

    /// Apple/Fitbit-style 4-zone model off a max-HR estimate.
    private enum Zone: String, CaseIterable {
        case rest = "Rest"
        case fatBurn = "Fat Burn"
        case cardio = "Cardio"
        case peak = "Peak"

        var color: Color {
            switch self {
            case .rest:    LifeOSColor.Metric.peak     // teal — calm
            case .fatBurn: LifeOSColor.Metric.steps    // lime
            case .cardio:  LifeOSColor.warning          // amber
            case .peak:    LifeOSColor.danger           // rose
            }
        }
    }

    private func zone(for bpm: Int) -> Zone {
        let pct = Double(bpm) / Double(max(1, maxHR))
        switch pct {
        case ..<0.50:      return .rest
        case 0.50..<0.70:  return .fatBurn
        case 0.70..<0.85:  return .cardio
        default:           return .peak
        }
    }

    private func zoneColor(for bpm: Int) -> Color { zone(for: bpm).color }

    private func zoneChip(for bpm: Int) -> some View {
        let z = zone(for: bpm)
        return Text(z.rawValue.uppercased())
            .font(.system(size: 9, weight: .bold)).tracking(0.8)
            .foregroundStyle(z.color)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(z.color.opacity(0.16), in: Capsule())
    }

    private var zoneLegend: some View {
        HStack(spacing: 10) {
            ForEach(Zone.allCases, id: \.self) { z in
                HStack(spacing: 4) {
                    Circle().fill(z.color).frame(width: 7, height: 7)
                    Text(z.rawValue)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// Minutes-in-zone summary. Each sampled minute counts as ~1 min of
    /// time in its zone (minute buckets are the native resolution).
    private var zoneBreakdown: some View {
        let totals = zoneMinutes
        let grand = max(1, totals.values.reduce(0, +))
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("TIME IN ZONES")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.mood)

                ForEach(Zone.allCases, id: \.self) { z in
                    let mins = totals[z] ?? 0
                    let frac = Double(mins) / Double(grand)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(z.rawValue)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                            Spacer()
                            Text(hm(mins))
                                .font(.system(size: 13, weight: .bold).monospacedDigit())
                                .foregroundStyle(z.color)
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(LifeOSColor.elevated)
                                Capsule().fill(z.color)
                                    .frame(width: max(2, geo.size.width * frac))
                            }
                        }
                        .frame(height: 6)
                    }
                }
            }
        }
    }

    private var zoneMinutes: [Zone: Int] {
        var out: [Zone: Int] = [:]
        for b in buckets { out[zone(for: b.avg), default: 0] += 1 }
        return out
    }

    private func hm(_ minutes: Int) -> String {
        guard minutes > 0 else { return "0m" }
        let h = minutes / 60, m = minutes % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    // MARK: - Workout overlays

    private struct Window { let start: Int; let end: Int }

    /// Today's lift sessions converted to minute-of-day windows for the
    /// RectangleMark shading. Clamped to the chart's 0...1439 domain.
    private var workoutWindows: [Window] {
        let cal = Calendar.current
        return sessions
            .filter { $0.date == date }
            .map { s in
                Window(
                    start: minuteOfDay(s.startedAt, cal: cal),
                    end: max(minuteOfDay(s.startedAt, cal: cal) + 1, minuteOfDay(s.endedAt, cal: cal))
                )
            }
    }

    private func minuteOfDay(_ d: Date, cal: Calendar) -> Int {
        let c = cal.dateComponents([.hour, .minute], from: d)
        return min(1439, max(0, (c.hour ?? 0) * 60 + (c.minute ?? 0)))
    }

    // MARK: - Loading / empty states

    private var skeleton: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                RoundedRectangle(cornerRadius: 6).fill(LifeOSColor.elevated)
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: 12).fill(LifeOSColor.elevated)
                    .frame(height: 220)
                    .shimmer(active: !reduceMotion)
            }
        }
    }

    private var emptyState: some View {
        Card {
            VStack(spacing: 10) {
                Image(systemName: "waveform.path.ecg")
                    .font(.system(size: 34))
                    .foregroundStyle(LifeOSColor.Metric.mood.opacity(0.7))
                Text("No intraday heart rate yet")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Once your watch syncs today's beats, the full-day graph shows up here — scrub it minute by minute.")
                    .font(.system(size: 13))
                    .foregroundStyle(LifeOSColor.fg2)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
        }
    }

    // MARK: - Helpers

    /// max-HR = 220 − age. Age from `birthYear`; fallback 190 (≈ age 30)
    /// when birth year is unknown so zones still render sensibly.
    private static func computeMaxHR(in ctx: ModelContext) -> Int {
        let settings = UserSettings.loadOrCreate(in: ctx)
        guard let birthYear = settings.birthYear, birthYear > 1900 else { return 190 }
        let thisYear = Calendar.current.component(.year, from: Date())
        let age = max(10, min(100, thisYear - birthYear))
        return 220 - age
    }

    /// "3:04 PM" — for the selected-minute readout.
    private static func clockLabel(_ minute: Int) -> String {
        let h = minute / 60, m = minute % 60
        var c = DateComponents(); c.hour = h; c.minute = m
        let date = Calendar.current.date(from: c) ?? Date()
        return timeFormatter.string(from: date)
    }

    /// "3 PM" — compact axis tick.
    private static func axisClockLabel(_ minute: Int) -> String {
        let h = minute / 60, m = minute % 60
        var c = DateComponents(); c.hour = h; c.minute = m
        let date = Calendar.current.date(from: c) ?? Date()
        return axisFormatter.string(from: date)
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "h:mm a"; return f
    }()
    private static let axisFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "h a"; return f
    }()
}

// MARK: - Shimmer (loading skeleton)

private struct Shimmer: ViewModifier {
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
    func shimmer(active: Bool) -> some View { modifier(Shimmer(active: active)) }
}
