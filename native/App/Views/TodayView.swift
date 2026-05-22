import SwiftUI
import SwiftData

struct TodayView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var todayEntries: [DailyEntry]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    hero
                    vitalsRow
                    quickActions
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(destination: SettingsView()) {
                        Image(systemName: "gearshape.fill")
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                }
            }
        }
    }

    private var hero: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                Text("Peak State")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.peak)

                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("84")
                        .font(.system(size: 56, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                    Text("/ 100")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg3)
                }

                HStack(spacing: 8) {
                    PillarTile(label: "Recovery", value: "72", unit: "", tint: LifeOSColor.Metric.sleep)
                    PillarTile(label: "Strain", value: "12.4", unit: "", tint: LifeOSColor.Metric.strain)
                    PillarTile(label: "Sleep", value: "7.5", unit: "h", tint: LifeOSColor.Metric.sleep)
                }
            }
        }
    }

    private var vitalsRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Vitals")
            HStack(spacing: 12) {
                MetricTile(icon: "heart.fill", label: "Resting HR", value: "58", unit: "bpm", tint: LifeOSColor.Metric.mood)
                MetricTile(icon: "waveform.path.ecg", label: "HRV", value: "62", unit: "ms", tint: LifeOSColor.Metric.sleep)
            }
            HStack(spacing: 12) {
                MetricTile(icon: "figure.walk", label: "Steps", value: "8,431", unit: "", tint: LifeOSColor.Metric.steps)
                MetricTile(icon: "drop.fill", label: "Water", value: "48", unit: "oz", tint: LifeOSColor.Metric.water)
            }
        }
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Log")
            HStack(spacing: 10) {
                QuickActionButton(icon: "drop.fill", label: "Water", tint: LifeOSColor.Metric.water) {
                    Haptics.tap()
                    Task { await HealthKitManager.shared.writeWater(ounces: 8) }
                }
                QuickActionButton(icon: "scalemass.fill", label: "Weight", tint: LifeOSColor.Metric.weight) {
                    Haptics.tap()
                }
                QuickActionButton(icon: "face.smiling.fill", label: "Mood", tint: LifeOSColor.Metric.mood) {
                    Haptics.tap()
                }
            }
        }
    }
}

private struct MetricTile: View {
    let icon: String
    let label: String
    let value: String
    let unit: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 11)).foregroundStyle(tint)
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)
            }
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 16)
    }
}

private struct QuickActionButton: View {
    let icon: String
    let label: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundStyle(tint)
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .glassCard(cornerRadius: 16)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    TodayView()
        .preferredColorScheme(.dark)
}
