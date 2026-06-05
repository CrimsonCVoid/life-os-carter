import SwiftUI
import Charts

/// Macro calorie split over time as a stacked-percent area, built from
/// cumulative bands (Protein 0→p, Carbs p→p+c, Fat p+c→1) on a continuous
/// 0…1 y-scale — the hang-safe way to stack (no ordinal y-domain).
struct MacroSplitChart: View {
    let series: [NutritionIntelligenceEngine.MacroSplitDay]

    var body: some View {
        Chart {
            ForEach(series) { d in
                AreaMark(x: .value("Day", d.day, unit: .day),
                         yStart: .value("lo", 0.0), yEnd: .value("hi", d.proteinFrac),
                         series: .value("Macro", "Protein"))
                    .foregroundStyle(LifeOSColor.Metric.protein.opacity(0.85))
                    .interpolationMethod(.monotone)
                AreaMark(x: .value("Day", d.day, unit: .day),
                         yStart: .value("lo", d.proteinFrac), yEnd: .value("hi", d.proteinFrac + d.carbsFrac),
                         series: .value("Macro", "Carbs"))
                    .foregroundStyle(LifeOSColor.Metric.carbs.opacity(0.85))
                    .interpolationMethod(.monotone)
                AreaMark(x: .value("Day", d.day, unit: .day),
                         yStart: .value("lo", d.proteinFrac + d.carbsFrac), yEnd: .value("hi", 1.0),
                         series: .value("Macro", "Fat"))
                    .foregroundStyle(LifeOSColor.Metric.fat.opacity(0.85))
                    .interpolationMethod(.monotone)
            }
        }
        .chartYScale(domain: 0...1)
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 0.25, 0.5, 0.75, 1.0]) { v in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel {
                    if let f = v.as(Double.self) {
                        Text("\(Int(f * 100))%").foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: max(1, series.count / 6))) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .chartForegroundStyleScale([
            "Protein": LifeOSColor.Metric.protein,
            "Carbs":   LifeOSColor.Metric.carbs,
            "Fat":     LifeOSColor.Metric.fat,
        ])
        .chartLegend(position: .bottom, alignment: .center, spacing: 8)
        .frame(height: 170)
    }
}
