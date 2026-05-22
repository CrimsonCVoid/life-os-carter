import SwiftUI

struct SettingsView: View {
    @State private var healthGranted = false
    @State private var liveActivitiesEnabled = LiveActivityManager.shared.isSupported

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                integrationsCard
                aboutCard
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var integrationsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("INTEGRATIONS")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)

                row(
                    icon: "heart.fill",
                    label: "Apple Health",
                    detail: healthGranted ? "Connected" : "Tap to authorize",
                    tint: LifeOSColor.danger
                ) {
                    Task {
                        let ok = await HealthKitManager.shared.requestAuthorization()
                        healthGranted = ok
                        Haptics.success()
                    }
                }

                Divider().overlay(LifeOSColor.stroke)

                row(
                    icon: "dumbbell.fill",
                    label: "Live Activities",
                    detail: liveActivitiesEnabled ? "Enabled — start a workout to test" : "Disabled in Settings → Life OS",
                    tint: LifeOSColor.Metric.peak
                ) {}
                    .disabled(true)
            }
        }
    }

    private var aboutCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 4) {
                Text("Life OS")
                    .font(.system(size: 16, weight: .semibold))
                Text("Native iOS · v1.0")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private func row(icon: String, label: String, detail: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(tint)
                    .background(Circle().fill(tint.opacity(0.14)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white)
                    Text(detail).font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .buttonStyle(.plain)
    }
}
