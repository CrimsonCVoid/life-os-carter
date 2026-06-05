import SwiftUI

/// Eating-window lane chart: one horizontal bar per logged day spanning the
/// first→last meal across a 4am…midnight axis. Late-night days tint amber.
/// Canvas (not Swift Charts) per the lane/timeline gotcha.
struct EatingWindowStrip: View {
    let series: [NutritionIntelligenceEngine.EatingWindowDay]   // oldest-first

    private let hourStart = 4.0
    private let hourEnd = 24.0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Canvas { ctx, size in
                let rows = series.count
                guard rows > 0 else { return }
                let rowH = min(18, (size.height - 4) / CGFloat(rows))
                let gap: CGFloat = 3
                let span = hourEnd - hourStart
                func x(_ hour: Double) -> CGFloat {
                    CGFloat((min(max(hour, hourStart), hourEnd) - hourStart) / span) * size.width
                }
                for h in [8.0, 12, 16, 20] {
                    var p = Path()
                    p.move(to: CGPoint(x: x(h), y: 0))
                    p.addLine(to: CGPoint(x: x(h), y: size.height))
                    ctx.stroke(p, with: .color(LifeOSColor.stroke), lineWidth: 0.5)
                }
                for (i, d) in series.enumerated() {
                    let y = CGFloat(i) * (rowH + gap)
                    let rect = CGRect(x: x(d.firstHour), y: y,
                                      width: max(4, x(d.lastHour) - x(d.firstHour)), height: rowH)
                    let tint = d.lateNight ? LifeOSColor.warning : LifeOSColor.Metric.calories
                    ctx.fill(Path(roundedRect: rect, cornerRadius: rowH / 2), with: .color(tint.opacity(0.85)))
                }
            }
            .frame(height: CGFloat(series.count) * 21 + 4)

            HStack {
                ForEach([8, 12, 16, 20], id: \.self) { h in
                    Text(label(h)).font(.system(size: 9))
                        .foregroundStyle(LifeOSColor.fg3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func label(_ h: Int) -> String {
        let am = h < 12
        let twelve = h % 12 == 0 ? 12 : h % 12
        return "\(twelve)\(am ? "a" : "p")"
    }
}
