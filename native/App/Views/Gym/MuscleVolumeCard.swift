import SwiftUI

/// Bars-by-muscle-group volume rollup over the last 7 days. Helps the
/// user see whether they're chronically over- or under-working a
/// group. Empty muscles are hidden — no zero-bars padding the card.
struct MuscleVolumeCard: View {
    let rollup: MuscleVolumeRollup

    var body: some View {
        if rollup.entries.isEmpty {
            EmptyView()
        } else {
            VStack(spacing: 10) {
                SectionLabel("This week by muscle")
                Card {
                    VStack(alignment: .leading, spacing: 14) {
                        header
                        VStack(spacing: 10) {
                            ForEach(rollup.entries) { e in
                                row(e)
                            }
                        }
                    }
                }
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Int(rollup.totalVolume)) lb")
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.Metric.peak)
                Text("total volume · \(rollup.totalSets) sets across \(rollup.windowDays) days")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
        }
    }

    private func row(_ entry: MuscleVolumeRollup.Entry) -> some View {
        let maxVolume = rollup.entries.map(\.volume).max() ?? 1
        let fraction = maxVolume > 0 ? entry.volume / maxVolume : 0
        return HStack(spacing: 10) {
            Image(systemName: entry.muscle.icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(tint(for: entry.muscle))
                .frame(width: 18)
            Text(entry.muscle.displayName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg)
                .frame(width: 76, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(tint(for: entry.muscle).opacity(0.15))
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(tint(for: entry.muscle))
                        .frame(width: max(6, geo.size.width * fraction))
                }
            }
            .frame(height: 8)
            Text("\(Int(entry.volume))")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg3)
                .frame(width: 46, alignment: .trailing)
        }
    }

    private func tint(for muscle: ExerciseCatalogItem.Muscle) -> Color {
        switch muscle {
        case .chest:     return LifeOSColor.Metric.protein
        case .back:      return LifeOSColor.Metric.sleep
        case .shoulders: return LifeOSColor.warning
        case .arms:      return LifeOSColor.Metric.peak
        case .legs:      return LifeOSColor.success
        case .glutes:    return LifeOSColor.Metric.calories
        case .core:      return LifeOSColor.Metric.water
        case .cardio:    return LifeOSColor.danger
        }
    }
}
