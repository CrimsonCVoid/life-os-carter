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
        VStack(spacing: 10) {
            row(
                label: "Mood",
                value: mood,
                trend: moodTrend,
                tint: LifeOSColor.Metric.mood,
                icon: "face.smiling.fill",
                onLog: onLogMood
            )
            row(
                label: "Energy",
                value: energy,
                trend: energyTrend,
                tint: LifeOSColor.Metric.energy,
                icon: "bolt.fill",
                onLog: onLogEnergy
            )
        }
    }

    /// Single full-width row per metric. Header line with icon +
    /// label + big number + sparkline; full-width 1–10 chip row
    /// underneath with chips sized for thumb tapping (32pt). Stacking
    /// the two metrics (instead of two columns) gives each ~10× as
    /// much horizontal room for the chip row, which was the real
    /// problem with the old side-by-side layout.
    private func row(
        label: String,
        value: Int?,
        trend: [Double],
        tint: Color,
        icon: String,
        onLog: @escaping (Int) -> Void
    ) -> some View {
        Card(tint: tint) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: icon).font(.system(size: 13)).foregroundStyle(tint)
                        Text(label.uppercased())
                            .font(.system(size: 10, weight: .heavy)).tracking(1.2)
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    if trend.count > 1 {
                        Sparkline(values: trend, tint: tint, height: 22)
                            .frame(width: 84)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(value.map(String.init) ?? "—")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .contentTransition(.numericText())
                        Text("/10")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                chipRow(value: value, tint: tint, onLog: onLog)
            }
        }
    }

    private func chipRow(value: Int?, tint: Color, onLog: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 6) {
            ForEach(1...10, id: \.self) { i in
                Button {
                    Haptics.tick()
                    onLog(i)
                } label: {
                    Text("\(i)")
                        .font(.system(size: 12, weight: .bold).monospacedDigit())
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(value == i ? tint : tint.opacity(0.12))
                        )
                        .foregroundStyle(value == i ? .black : tint)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
