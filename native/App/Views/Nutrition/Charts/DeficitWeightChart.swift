import SwiftUI
import Charts

/// Intake bars + a flat TDEE rule (left kcal axis) with weigh-ins drawn as a
/// line mapped into the same continuous range (Swift Charts has no true dual
/// axis; the host labels current weight numerically). Continuous axes only.
struct DeficitWeightChart: View {
    let days: [NutritionIntelligenceEngine.EnergyBalanceDay]
    let tdee: Double?

    private var intakeDays: [NutritionIntelligenceEngine.EnergyBalanceDay] { days.filter { $0.intake > 0 } }
    private var weightDays: [NutritionIntelligenceEngine.EnergyBalanceDay] { days.filter { $0.weight != nil } }

    private var weightDomain: ClosedRange<Double> {
        let ws = weightDays.compactMap(\.weight)
        guard let lo = ws.min(), let hi = ws.max() else { return 0...1 }
        if lo == hi { return (lo - 1)...(hi + 1) }
        let pad = (hi - lo) * 0.25
        return (lo - pad)...(hi + pad)
    }

    var body: some View {
        Chart {
            ForEach(intakeDays) { d in
                BarMark(x: .value("Day", d.day, unit: .day), y: .value("Intake", d.intake))
                    .foregroundStyle(LifeOSGradient.metricFill(LifeOSColor.Metric.calories, top: 0.9, bottom: 0.35))
                    .cornerRadius(3)
            }
            if let tdee {
                RuleMark(y: .value("TDEE", tdee))
                    .foregroundStyle(LifeOSColor.Metric.weight.opacity(0.8))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4]))
                    .annotation(position: .topLeading, alignment: .leading, spacing: 2) {
                        Text("TDEE \(Int(tdee))")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(LifeOSColor.Metric.weight)
                    }
            }
            ForEach(weightDays) { d in
                if let w = d.weight {
                    LineMark(x: .value("Day", d.day, unit: .day), y: .value("Weight", mapWeight(w)),
                             series: .value("S", "Weight"))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(LifeOSColor.Metric.weight)
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                    PointMark(x: .value("Day", d.day, unit: .day), y: .value("Weight", mapWeight(w)))
                        .foregroundStyle(LifeOSColor.Metric.weight)
                        .symbolSize(20)
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { v in
                AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                AxisValueLabel {
                    if let kcal = v.as(Double.self) {
                        Text("\(Int(kcal))").foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: max(1, days.count / 6))) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .frame(height: 180)
    }

    private func mapWeight(_ w: Double) -> Double {
        let kcalMax = intakeDays.map(\.intake).max() ?? 3000
        let lo = weightDomain.lowerBound, hi = weightDomain.upperBound
        guard hi > lo else { return kcalMax }
        let norm = (w - lo) / (hi - lo)
        return kcalMax * (0.6 + norm * 0.38)
    }
}
