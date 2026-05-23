import SwiftUI

/// Quick-tap behavioral journal chips on Today. Each chip toggles a
/// boolean on the current DailyEntry (alcohol, caffeine after 2pm,
/// late eating, screens before bed). Stress level uses a 5-segment
/// row instead of a chip. These flags are what the /api/correlations
/// route correlates against sleep/HRV/mood the next morning.
///
/// Designed to be one-tap fast — no confirm, no sheet, no friction.
/// The user can mistap and re-tap; that's fine. The whole point is
/// that low-friction logging produces enough data for the correlation
/// engine to find real patterns.
struct JournalPromptStrip: View {
    @Bindable var daily: DailyEntry
    let onChange: () -> Void

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("YESTERDAY / TODAY")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip(
                            label: "Alcohol",
                            icon: "wineglass.fill",
                            active: daily.alcoholYesterday,
                            tint: LifeOSColor.Metric.fat
                        ) {
                            daily.alcoholYesterday.toggle()
                            commit()
                        }
                        chip(
                            label: "Caffeine after 2pm",
                            icon: "cup.and.saucer.fill",
                            active: daily.caffeineAfter2pm,
                            tint: LifeOSColor.Metric.calories
                        ) {
                            daily.caffeineAfter2pm.toggle()
                            commit()
                        }
                        chip(
                            label: "Late eating",
                            icon: "fork.knife",
                            active: daily.lateEating,
                            tint: LifeOSColor.warning
                        ) {
                            daily.lateEating.toggle()
                            commit()
                        }
                        chip(
                            label: "Screens before bed",
                            icon: "iphone",
                            active: daily.screenBeforeBed,
                            tint: LifeOSColor.Metric.sleep
                        ) {
                            daily.screenBeforeBed.toggle()
                            commit()
                        }
                    }
                    .padding(.horizontal, 2)
                }
                Divider().overlay(LifeOSColor.stroke)
                stressRow
            }
        }
    }

    private func chip(
        label: String,
        icon: String,
        active: Bool,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            active ? Haptics.tick() : Haptics.tap()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(active ? .white : LifeOSColor.fg2)
            .padding(.horizontal, 11).padding(.vertical, 8)
            .background(
                Capsule().fill(active ? tint : LifeOSColor.elevated)
            )
            .overlay(
                Capsule().strokeBorder(active ? tint : LifeOSColor.stroke, lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private var stressRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Stress")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg2)
                Spacer()
                Text(daily.stressLevel == nil ? "—" : "\(daily.stressLevel!) / 5")
                    .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg3)
            }
            HStack(spacing: 6) {
                ForEach(1...5, id: \.self) { n in
                    Button {
                        daily.stressLevel = daily.stressLevel == n ? nil : n
                        commit()
                        Haptics.tick()
                    } label: {
                        ZStack {
                            Circle().fill(
                                daily.stressLevel.map { $0 >= n } ?? false
                                    ? stressColor(for: n)
                                    : LifeOSColor.elevated
                            )
                            Text("\(n)")
                                .font(.system(size: 11, weight: .bold).monospacedDigit())
                                .foregroundStyle(
                                    daily.stressLevel.map { $0 >= n } ?? false
                                        ? .white : LifeOSColor.fg3
                                )
                        }
                        .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func stressColor(for level: Int) -> Color {
        switch level {
        case 1, 2: return LifeOSColor.success
        case 3:    return LifeOSColor.warning
        default:   return LifeOSColor.danger
        }
    }

    private func commit() {
        daily.needsSync = true
        onChange()
    }
}
