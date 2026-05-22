import SwiftUI

struct SettingsView: View {
    @Environment(AuthStore.self) private var auth
    @State private var healthGranted = false
    @State private var liveActivitiesEnabled = LiveActivityManager.shared.isSupported
    @State private var linking: LinkingState = .idle
    @State private var linkError: String?

    enum LinkingState { case idle, apple, google }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                accountCard
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

    // MARK: - Account card

    private var accountCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("ACCOUNT")
                    .font(.system(size: 10, weight: .semibold)).tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)

                providerStatus

                Divider().overlay(LifeOSColor.stroke)

                if auth.identityProvider == .apple {
                    linkedReassuranceRow(label: "Linked with Apple", icon: "apple.logo", tint: .white)
                } else {
                    linkButton(
                        provider: .apple,
                        title: "Link Apple ID",
                        subtitle: "Survives device wipe + ties data to your Apple account",
                        icon: "apple.logo",
                        tint: .white
                    )
                }

                Divider().overlay(LifeOSColor.stroke)

                if auth.identityProvider == .google {
                    linkedReassuranceRow(label: "Linked with Google", icon: "g.circle.fill", tint: LifeOSColor.danger)
                } else {
                    linkButton(
                        provider: .google,
                        title: "Link Google",
                        subtitle: "Sign in with your Google account on future devices",
                        icon: "g.circle.fill",
                        tint: LifeOSColor.danger
                    )
                }

                if let linkError {
                    Text(linkError)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.danger)
                        .padding(.top, 2)
                }
            }
        }
    }

    private var providerStatus: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(providerTint.opacity(0.15))
                Image(systemName: providerIcon)
                    .font(.system(size: 16))
                    .foregroundStyle(providerTint)
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 1) {
                Text(auth.identityProvider.label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                if let id = auth.userID {
                    Text(id.prefix(28) + (id.count > 28 ? "…" : ""))
                        .font(.system(size: 10).monospacedDigit())
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            Spacer()
        }
    }

    private var providerIcon: String {
        switch auth.identityProvider {
        case .apple:  return "apple.logo"
        case .google: return "g.circle.fill"
        case .device: return "iphone"
        case .other:  return "person.crop.circle.fill"
        case .none:   return "person.crop.circle.badge.questionmark"
        }
    }

    private var providerTint: Color {
        switch auth.identityProvider {
        case .apple:  return .white
        case .google: return LifeOSColor.danger
        case .device: return LifeOSColor.accent
        case .other:  return LifeOSColor.fg2
        case .none:   return LifeOSColor.fg3
        }
    }

    private func linkButton(provider: LinkingState, title: String, subtitle: String, icon: String, tint: Color) -> some View {
        let isWorkingHere = linking == provider
        return Button {
            Task { await runLink(provider: provider) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(tint)
                    .background(Circle().fill(tint.opacity(0.14)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                        .lineLimit(2)
                }
                Spacer()
                if isWorkingHere {
                    ProgressView().tint(LifeOSColor.accent)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(linking != .idle)
    }

    private func linkedReassuranceRow(label: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .frame(width: 36, height: 36)
                .foregroundStyle(tint)
                .background(Circle().fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text("All future sessions reuse this identity.")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 18))
                .foregroundStyle(LifeOSColor.success)
        }
    }

    @MainActor
    private func runLink(provider: LinkingState) async {
        linkError = nil
        linking = provider
        Haptics.tap()
        do {
            switch provider {
            case .apple:
                try await IdentityLinker.shared.linkApple()
            case .google:
                try await IdentityLinker.shared.linkGoogle()
            case .idle:
                break
            }
        } catch IdentityLinker.LinkError.userCancelled {
            // User cancelled — silent.
        } catch {
            linkError = error.localizedDescription
            Haptics.error()
        }
        linking = .idle
    }

    // MARK: - Integrations card

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
