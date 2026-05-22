import SwiftUI
import Charts

struct StatsView: View {
    /// Demo data — fill in with real SwiftData queries once entries
    /// are being persisted.
    private var sleepSeries: [(day: String, hours: Double)] {
        let days = ["S","M","T","W","T","F","S"]
        let hours = [6.8, 7.5, 7.2, 8.1, 6.9, 7.7, 8.0]
        return zip(days, hours).map { ($0, $1) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    sleepCard
                    Card {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Average HRV")
                                .font(.system(size: 11, weight: .semibold))
                                .tracking(1.2)
                                .foregroundStyle(LifeOSColor.Metric.sleep)
                            Text("62 ms")
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .monospacedDigit()
                            Text("Last 7 days · +4 vs prior 7")
                                .font(.system(size: 12))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Stats")
        }
    }

    private var sleepCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Sleep")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(LifeOSColor.Metric.sleep)
                    Spacer()
                    Text("7d")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Chart(sleepSeries, id: \.day) { item in
                    BarMark(
                        x: .value("Day", item.day),
                        y: .value("Hours", item.hours)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [LifeOSColor.Metric.sleep, LifeOSColor.Metric.sleep.opacity(0.4)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .cornerRadius(4)
                }
                .chartYAxis {
                    AxisMarks(values: [0, 4, 8]) { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                    }
                }
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .frame(height: 140)
            }
        }
    }
}
