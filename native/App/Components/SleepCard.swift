import SwiftUI
import Charts

/// Last-night sleep card — total hours, stage breakdown bar, time
/// asleep/awake. Stages stack horizontally: Awake (top, red),
/// REM (purple), Core (light blue), Deep (deep blue).
struct SleepCard: View {
    struct Stage: Identifiable {
        let id = UUID()
        let kind: Kind
        /// Duration in minutes.
        let minutes: Double
        enum Kind: String { case awake, rem, core, deep }
    }

    let totalHours: Double
    let bedtime: Date
    let wake: Date
    let stages: [Stage]
    let weekAverageHours: Double

    private let order: [Stage.Kind] = [.awake, .rem, .core, .deep]

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("SLEEP")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.4)
                            .foregroundStyle(LifeOSColor.Metric.sleep)
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(formatHours(totalHours))
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(.white)
                            Text("hours")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("7d avg")
                            .font(.system(size: 9, weight: .semibold))
                            .tracking(1.1)
                            .foregroundStyle(LifeOSColor.fg3)
                        Text(formatHours(weekAverageHours))
                            .font(.system(size: 16, weight: .semibold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                }

                stageBar

                HStack {
                    ForEach(order, id: \.self) { kind in
                        legendChip(for: kind)
                    }
                }

                Divider().overlay(LifeOSColor.stroke)

                HStack {
                    Label {
                        Text(bedtime.formatted(date: .omitted, time: .shortened))
                            .font(.system(size: 13, weight: .medium).monospacedDigit())
                    } icon: {
                        Image(systemName: "moon.fill")
                    }
                    .foregroundStyle(LifeOSColor.Metric.sleep)
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    Label {
                        Text(wake.formatted(date: .omitted, time: .shortened))
                            .font(.system(size: 13, weight: .medium).monospacedDigit())
                    } icon: {
                        Image(systemName: "sun.max.fill")
                    }
                    .foregroundStyle(LifeOSColor.Metric.energy)
                }
            }
        }
    }

    private var stageBar: some View {
        GeometryReader { geo in
            let total = max(1, stages.reduce(0) { $0 + $1.minutes })
            HStack(spacing: 2) {
                ForEach(order, id: \.self) { kind in
                    let mins = stages.first(where: { $0.kind == kind })?.minutes ?? 0
                    let width = geo.size.width * mins / total
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(color(for: kind))
                        .frame(width: max(0, width - 2))
                }
            }
        }
        .frame(height: 14)
    }

    private func legendChip(for kind: Stage.Kind) -> some View {
        let mins = stages.first(where: { $0.kind == kind })?.minutes ?? 0
        let h = Int(mins) / 60, m = Int(mins) % 60
        return VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Circle().fill(color(for: kind)).frame(width: 6, height: 6)
                Text(kind.rawValue.uppercased())
                    .font(.system(size: 8, weight: .semibold))
                    .tracking(1)
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Text(h > 0 ? "\(h)h \(m)m" : "\(m)m")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func color(for kind: Stage.Kind) -> Color {
        switch kind {
        case .awake: return Color(hex: 0xF43F5E)
        case .rem:   return Color(hex: 0xA78BFA)
        case .core:  return Color(hex: 0x60A5FA)
        case .deep:  return Color(hex: 0x1E40AF)
        }
    }

    private func formatHours(_ h: Double) -> String {
        let total = Int(h * 60)
        let hours = total / 60, minutes = total % 60
        return String(format: "%d:%02d", hours, minutes)
    }
}
