import SwiftUI

/// Replaces the placeholder Peak State hero with a Whoop-style
/// recovery + strain split. Recovery is a 0–100 ring on the left,
/// strain is a 0–21 ring on the right, with a band-tinted chip
/// below each. Both numbers come from the calculators, which fall
/// back gracefully when data is sparse instead of showing "—".
struct RecoveryStrainHero: View {
    let recovery: RecoveryCalculator.Score?
    let strain: StrainCalculator.Score

    var body: some View {
        Card(tint: tintForBand) {
            HStack(spacing: 14) {
                recoverySide
                Divider()
                    .overlay(LifeOSColor.stroke)
                    .frame(height: 90)
                strainSide
            }
        }
    }

    // MARK: - Recovery (left)

    private var recoverySide: some View {
        VStack(spacing: 8) {
            ZStack {
                // Soft halo behind the ring — matches the recovery
                // band's tint so a low score reads as red atmosphere
                // and a high score reads as a green glow.
                Circle()
                    .fill(recoveryTint.opacity(0.32))
                    .frame(width: 96, height: 96)
                    .blur(radius: 28)
                ScoreRing(
                    progress: Double(recovery?.value ?? 0) / 100.0,
                    value: recovery.map { "\($0.value)" } ?? "—",
                    label: "RECOVERY",
                    tint: recoveryTint,
                    size: 96
                )
                .contentTransition(.numericText())
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: recovery?.value)
            }
            Text(recoveryBandLabel)
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
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
        switch recovery?.band {
        case .low:    return LifeOSColor.danger
        case .medium: return LifeOSColor.warning
        case .high:   return LifeOSColor.success
        case nil:     return LifeOSColor.fg3
        }
    }

    private var recoveryBandLabel: String {
        switch recovery?.band {
        case .low:    return "TAKE IT EASY"
        case .medium: return "MAINTAIN"
        case .high:   return "PUSH IT"
        case nil:     return "NO DATA"
        }
    }

    private var recoverySublabel: String {
        guard let r = recovery else { return "Wear your watch overnight to score" }
        // Surface the heaviest-weight component as the explanation.
        let strongest = r.components
            .filter { $0.weight >= 0.25 }
            .min { abs(50 - $0.value) > abs(50 - $1.value) }
        return strongest?.note ?? "Composite of HRV, RHR, sleep, mood"
    }

    // MARK: - Strain (right)

    private var strainSide: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(strainTint.opacity(0.28))
                    .frame(width: 96, height: 96)
                    .blur(radius: 28)
                ScoreRing(
                    progress: strain.value / 21.0,
                    value: String(format: "%.1f", strain.value),
                    label: "STRAIN",
                    tint: strainTint,
                    size: 96
                )
                .contentTransition(.numericText())
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: strain.value)
            }
            Text(strainBandLabel)
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(strainTint)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(strainTint.opacity(0.15)))
            Text(strain.breakdown.isEmpty ? "Nothing logged yet" : strain.breakdown)
                .font(.system(size: 10))
                .foregroundStyle(LifeOSColor.fg3)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
    }

    private var strainTint: Color {
        switch strain.band {
        case .rest:     return LifeOSColor.fg3
        case .light:    return LifeOSColor.Metric.water
        case .moderate: return LifeOSColor.Metric.sleep
        case .hard:     return LifeOSColor.warning
        case .allOut:   return LifeOSColor.danger
        }
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

    private var tintForBand: Color {
        recoveryTint
    }
}
