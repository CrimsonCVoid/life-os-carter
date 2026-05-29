import SwiftUI

/// Whoop-style recovery + strain split hero. Recovery is a 0–100 ring on the
/// left (tinted by band), strain a 0–21 ring on the right. The recovery side
/// is tappable — `onTapRecovery` presents the full driver breakdown. A subtle
/// "partial" marker appears when baselines are still learning or inputs were
/// missing, so the user knows the score is honest-but-incomplete.
struct RecoveryStrainHero: View {
    let recovery: RecoveryResult?
    let strain: StrainCalculator.Score
    var onTapRecovery: () -> Void = {}

    var body: some View {
        Card(tint: recoveryTint) {
            HStack(spacing: 14) {
                Button {
                    guard recovery != nil else { return }
                    Haptics.tap()
                    onTapRecovery()
                } label: {
                    recoverySide
                }
                .buttonStyle(.plain)
                .disabled(recovery == nil)
                .pressable()

                Divider()
                    .overlay(LifeOSColor.stroke)
                    .frame(height: 96)

                strainSide
            }
        }
    }

    // MARK: - Recovery (left)

    private var recoverySide: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(recoveryTint.opacity(0.32))
                    .frame(width: 96, height: 96)
                    .blur(radius: 28)
                ScoreRing(
                    progress: Double(recovery?.score ?? 0) / 100.0,
                    value: recovery.map { "\($0.score)" } ?? "—",
                    label: "RECOVERY",
                    tint: recoveryTint,
                    size: 96
                )
                .contentTransition(.numericText())
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: recovery?.score)
            }
            HStack(spacing: 4) {
                Text(recoveryBandLabel)
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                if isPartial {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 9, weight: .bold))
                }
            }
            .foregroundStyle(recoveryTint)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(recoveryTint.opacity(0.15)))

            Text(recoverySublabel)
                .font(.system(size: 10))
                .foregroundStyle(LifeOSColor.fg3)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
    }

    private var recoveryTint: Color {
        guard let r = recovery else { return LifeOSColor.fg3 }
        return LifeOSColor.recovery(r.score)
    }

    private var recoveryBandLabel: String {
        switch recovery?.band {
        case .low:    return "RECOVER"
        case .medium: return "MAINTAIN"
        case .high:   return "PUSH"
        case nil:     return "NO DATA"
        }
    }

    private var isPartial: Bool {
        guard let r = recovery else { return false }
        return !r.baselineReady || !r.missingInputs.isEmpty
    }

    private var recoverySublabel: String {
        guard let r = recovery else { return "Wear your watch overnight to score" }
        if !r.baselineReady { return "learning your baseline" }
        return r.headline
    }

    // MARK: - Strain (right)

    private var strainSide: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(LifeOSColor.Metric.strain.opacity(0.28))
                    .frame(width: 96, height: 96)
                    .blur(radius: 28)
                ScoreRing(
                    progress: strain.value / 21.0,
                    value: String(format: "%.1f", strain.value),
                    label: "STRAIN",
                    tint: LifeOSColor.Metric.strain,
                    size: 96
                )
                .contentTransition(.numericText())
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: strain.value)
            }
            Text(strainBandLabel)
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.Metric.strain)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(LifeOSColor.Metric.strain.opacity(0.15)))
            Text(strain.breakdown.isEmpty ? "Nothing logged yet" : strain.breakdown)
                .font(.system(size: 10))
                .foregroundStyle(LifeOSColor.fg3)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
    }

    private var strainBandLabel: String {
        switch strain.band {
        case .rest:     return "REST"
        case .light:    return "LIGHT"
        case .moderate: return "MODERATE"
        case .hard:     return "HARD"
        case .allOut:   return "ALL OUT"
        }
    }
}
