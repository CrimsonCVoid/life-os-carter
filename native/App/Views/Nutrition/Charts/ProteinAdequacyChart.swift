import SwiftUI

/// Protein g/kg trend with the 1.6–2.2 g/kg hypertrophy zone shaded and a
/// baseline at the 1.6 floor. Reuses ScrubbableTrendChart (continuous-axis,
/// scrub + haptics built in).
struct ProteinAdequacyChart: View {
    let series: [NutritionIntelligenceEngine.ProteinDay]
    var onScrub: ((TrendPoint?) -> Void)? = nil

    private var points: [TrendPoint] { series.map { TrendPoint(day: $0.day, value: $0.gramsPerKg) } }

    var body: some View {
        ScrubbableTrendChart(
            points: points,
            tint: LifeOSColor.Metric.protein,
            valueFormat: { String(format: "%.1f g/kg", $0) },
            yAxisFormat: { String(format: "%.1f", $0) },
            band: (low: 1.6, high: 2.2),
            baseline: 1.6,
            onScrub: onScrub
        )
        .frame(height: 150)
    }
}
