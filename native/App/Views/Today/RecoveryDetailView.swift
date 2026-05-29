import SwiftUI

/// Presented breakdown of today's recovery. Big band-tinted ring + headline,
/// the signed driver bars (what pushed recovery up/down), the recommended
/// strain target, and a partial-data note when baselines are still learning
/// or inputs were missing. Wraps itself in a NavigationStack so it renders its
/// own title bar + Done button whether the integrator shows it as a sheet or a
/// full-screen cover.
struct RecoveryDetailView: View {
    let result: RecoveryResult
    @Environment(\.dismiss) private var dismiss

    private var tint: Color { LifeOSColor.recovery(result.score) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    hero
                    driversCard
                    recommendedStrainCard
                    if isPartial { partialNote }
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Recovery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        Haptics.tap()
                        dismiss()
                    }
                    .foregroundStyle(LifeOSColor.accent)
                }
            }
        }
    }

    // MARK: - Hero

    private var hero: some View {
        Card(tint: tint) {
            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.30))
                        .frame(width: 150, height: 150)
                        .blur(radius: 40)
                    ScoreRing(
                        progress: Double(result.score) / 100.0,
                        value: "\(result.score)",
                        label: "RECOVERY",
                        tint: tint,
                        size: 150
                    )
                }
                Text(result.headline)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(LifeOSColor.fg)
                Text(bandLabel)
                    .font(.system(size: 11, weight: .heavy)).tracking(1.0)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.15)))
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var bandLabel: String {
        switch result.band {
        case .low:    return "PRIORITIZE RECOVERY"
        case .medium: return "HOLD STEADY"
        case .high:   return "PRIMED TO PUSH"
        }
    }

    // MARK: - Drivers

    private var driversCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel("What's driving it")
                ForEach(result.drivers) { driver in
                    DriverRow(driver: driver)
                }
            }
        }
    }

    // MARK: - Recommended strain

    @ViewBuilder
    private var recommendedStrainCard: some View {
        if let range = result.recommendedStrain {
            Card(tint: LifeOSColor.Metric.strain) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Today's strain target")
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(String(format: "%.0f–%.0f", range.lowerBound, range.upperBound))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(LifeOSColor.Metric.strain)
                        Text("of 21")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    // Track showing the suggested window on the 0...21 scale.
                    GeometryReader { geo in
                        let w = geo.size.width
                        Capsule()
                            .fill(LifeOSColor.Metric.strain.opacity(0.15))
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(LifeOSColor.Metric.strain)
                                    .frame(width: max(4, w * (range.upperBound - range.lowerBound) / 21.0))
                                    .offset(x: w * range.lowerBound / 21.0)
                            }
                    }
                    .frame(height: 8)
                    Text(strainGuidance)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                }
            }
        }
    }

    private var strainGuidance: String {
        switch result.band {
        case .high:   return "Your body is ready for a heavy session."
        case .medium: return "A moderate effort keeps you balanced today."
        case .low:    return "Keep it light — active recovery beats grinding."
        }
    }

    // MARK: - Partial note

    private var isPartial: Bool {
        !result.baselineReady || !result.missingInputs.isEmpty
    }

    private var partialNote: some View {
        Card {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(LifeOSColor.warning)
                VStack(alignment: .leading, spacing: 4) {
                    Text(result.baselineReady ? "Partial reading" : "Learning your baseline")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    Text(partialDetail)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var partialDetail: String {
        if !result.baselineReady {
            return "A few more nights of watch data sharpens the HRV and resting-HR baselines this score leans on."
        }
        let labels = result.missingInputs.joined(separator: ", ")
        return "Scored from the inputs we had. Missing today: \(labels)."
    }
}

/// One driver row: label + detail on the left, a signed impact bar tinted by
/// the driver's metric color on the right. Bars grow right for positive impact
/// (pushed recovery up) and left for negative.
private struct DriverRow: View {
    let driver: RecoveryResult.Driver

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(driver.label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Spacer()
                Text(driver.detail)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(LifeOSColor.fg2)
            }
            GeometryReader { geo in
                let half = geo.size.width / 2
                let mag = min(1, abs(driver.impact)) * half
                ZStack(alignment: .center) {
                    Capsule()
                        .fill(LifeOSColor.stroke)
                        .frame(height: 6)
                    Rectangle()
                        .fill(LifeOSColor.strokeStrong)
                        .frame(width: 1, height: 10)  // neutral center marker
                    Capsule()
                        .fill(driver.tint)
                        .frame(width: max(2, mag), height: 6)
                        .offset(x: driver.impact >= 0 ? mag / 2 : -mag / 2)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 12)
        }
    }
}
