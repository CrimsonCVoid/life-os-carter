import SwiftUI
import Charts

/// Two-column mood + energy logger. Big number, 1-10 chip row to log,
/// 7-day trend sparkline beneath. Logging fires a system haptic + the
/// chip animates.
struct MoodEnergyCard: View {
    let mood: Int?
    let energy: Int?
    let moodTrend: [Double]
    let energyTrend: [Double]
    let onLogMood: (Int) -> Void
    let onLogEnergy: (Int) -> Void

    var body: some View {
        Card {
            HStack(alignment: .top, spacing: 16) {
                column(
                    label: "Mood",
                    value: mood,
                    trend: moodTrend,
                    tint: LifeOSColor.Metric.mood,
                    icon: "face.smiling.fill",
                    onLog: onLogMood
                )
                Divider().overlay(LifeOSColor.stroke)
                column(
                    label: "Energy",
                    value: energy,
                    trend: energyTrend,
                    tint: LifeOSColor.Metric.energy,
                    icon: "bolt.fill",
                    onLog: onLogEnergy
                )
            }
        }
    }

    private func column(
        label: String,
        value: Int?,
        trend: [Double],
        tint: Color,
        icon: String,
        onLog: @escaping (Int) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11)).foregroundStyle(tint)
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)
            }
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value.map(String.init) ?? "—")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text("/10")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            if trend.count > 1 {
                Sparkline(values: trend, tint: tint, height: 24)
            }
            HStack(spacing: 3) {
                ForEach(1...10, id: \.self) { i in
                    Button {
                        Haptics.tick()
                        onLog(i)
                    } label: {
                        Text("\(i)")
                            .font(.system(size: 10, weight: .semibold).monospacedDigit())
                            .frame(width: 18, height: 18)
                            .background(
                                Circle().fill(
                                    value == i ? tint : tint.opacity(0.12)
                                )
                            )
                            .foregroundStyle(value == i ? .black : tint)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
