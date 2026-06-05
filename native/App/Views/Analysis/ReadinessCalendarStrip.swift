import SwiftUI

/// Training-readiness heat strip: past actual recovery + future forecast.
/// Canvas (not Swift Charts) — fixed-cell geometry keeps us clear of any chart
/// cost / array-axis hang. Past cells are solid recovery-band color; future
/// cells are hatched + lower-opacity to read unmistakably as PROJECTION. A thin
/// caret marks each cell's recommended-strain midpoint.
struct ReadinessCalendarStrip: View {
    let cells: [ReadinessForecast.CalendarCell]
    var cellHeight: CGFloat = 46
    var showStrainCaret: Bool = true

    private static let dow: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEEEE"; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()

    var body: some View {
        Canvas { ctx, size in
            guard !cells.isEmpty else { return }
            let n = cells.count
            let gap: CGFloat = 4
            let cw = (size.width - gap * CGFloat(n - 1)) / CGFloat(n)
            let top: CGFloat = 16
            let h = cellHeight

            for (i, cell) in cells.enumerated() {
                let x = CGFloat(i) * (cw + gap)
                let rect = CGRect(x: x, y: top, width: cw, height: h)
                let rr = Path(roundedRect: rect, cornerRadius: 6)

                let v = cell.value ?? -1
                let base: Color = v < 0 ? LifeOSColor.elevated : LifeOSColor.recovery(Int(v.rounded()))
                let fillOpacity: Double = v < 0 ? 1.0 : (cell.isForecast ? 0.28 : (0.35 + 0.55 * min(1, v / 100)))
                ctx.fill(rr, with: .color(base.opacity(fillOpacity)))

                if cell.isForecast, v >= 0 {
                    var hatch = Path()
                    let step: CGFloat = 6
                    var hx = rect.minX - rect.height
                    while hx < rect.maxX {
                        hatch.move(to: CGPoint(x: hx, y: rect.maxY))
                        hatch.addLine(to: CGPoint(x: hx + rect.height, y: rect.minY))
                        hx += step
                    }
                    ctx.clip(to: rr)
                    ctx.stroke(hatch, with: .color(base.opacity(0.35)), lineWidth: 1)
                    ctx.clip(to: Path(CGRect(origin: .zero, size: size)))
                }

                let isToday = Calendar.current.isDateInToday(cell.day)
                ctx.stroke(rr, with: .color(isToday ? LifeOSColor.accent.opacity(0.9) : LifeOSColor.stroke),
                           lineWidth: isToday ? 1.5 : 0.5)

                if showStrainCaret, let mid = cell.recommendedStrainMid {
                    let cy = rect.maxY - CGFloat(min(21, mid) / 21) * rect.height
                    var caret = Path()
                    caret.move(to: CGPoint(x: rect.maxX - 5, y: cy))
                    caret.addLine(to: CGPoint(x: rect.maxX - 1, y: cy))
                    ctx.stroke(caret, with: .color(LifeOSColor.Metric.strain.opacity(0.9)), lineWidth: 2)
                }

                if v >= 0 {
                    let txt = Text("\(Int(v.rounded()))")
                        .font(.system(size: 13, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(cell.isForecast ? LifeOSColor.fg2 : LifeOSColor.fg)
                    ctx.draw(txt, at: CGPoint(x: rect.midX, y: rect.midY))
                }

                let dowTxt = Text(Self.dow.string(from: cell.day))
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(isToday ? LifeOSColor.accent : LifeOSColor.fg3)
                ctx.draw(dowTxt, at: CGPoint(x: rect.midX, y: 6))
            }
        }
        .frame(height: cellHeight + 16)
        .accessibilityLabel("Readiness calendar: past recovery and forecast")
    }
}

/// Horizontal 0…100 readiness band track: a shaded low→high range with a caret
/// at the point estimate. Plain SwiftUI shapes — reduce-motion safe.
struct ForecastBandTrack: View {
    let proj: ReadinessForecast.ReadinessProjection
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let tint = LifeOSColor.recovery(Int(proj.pointEstimate.rounded()))
            ZStack(alignment: .leading) {
                Capsule().fill(LifeOSColor.elevated)
                Capsule().fill(tint.opacity(0.35))
                    .frame(width: max(6, w * (proj.high - proj.low) / 100))
                    .offset(x: w * proj.low / 100)
                Capsule().fill(tint)
                    .frame(width: 3, height: 18)
                    .offset(x: min(w - 3, w * proj.pointEstimate / 100), y: -5)
            }
        }
        .frame(height: 8)
    }
}
