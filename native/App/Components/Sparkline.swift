import SwiftUI
import Charts

/// Tiny inline trend chart for vitals tiles. Draws a smooth line with
/// a subtle area fill — no axes, no labels, just shape. Provide 7-14
/// data points for the best read.
struct Sparkline: View {
    let values: [Double]
    let tint: Color
    var height: CGFloat = 32

    var body: some View {
        Chart {
            ForEach(Array(values.enumerated()), id: \.offset) { idx, v in
                LineMark(
                    x: .value("Index", idx),
                    y: .value("Value", v)
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(tint)
                .lineStyle(StrokeStyle(lineWidth: 1.5, lineCap: .round))

                AreaMark(
                    x: .value("Index", idx),
                    y: .value("Value", v)
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(
                    LinearGradient(
                        colors: [tint.opacity(0.35), tint.opacity(0)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .frame(height: height)
    }
}

/// Vitals tile with label, big value, optional sparkline.
struct VitalTile: View {
    let icon: String
    let label: String
    let value: String
    let unit: String
    let tint: Color
    let trend: [Double]?
    /// "+4 vs 7d avg" style delta label
    let delta: String?

    init(
        icon: String,
        label: String,
        value: String,
        unit: String = "",
        tint: Color,
        trend: [Double]? = nil,
        delta: String? = nil
    ) {
        self.icon = icon
        self.label = label
        self.value = value
        self.unit = unit
        self.tint = tint
        self.trend = trend
        self.delta = delta
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundStyle(tint)
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)
            }
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            if let trend, trend.count > 1 {
                Sparkline(values: trend, tint: tint)
            }
            if let delta {
                Text(delta)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 16)
    }
}
