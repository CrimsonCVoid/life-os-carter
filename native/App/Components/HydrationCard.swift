import SwiftUI

/// Big water gauge with quick-log buttons. Tap a chip → +8oz / +16oz /
/// +24oz. The gauge fills proportionally; overage shows in lighter
/// brand tint.
struct HydrationCard: View {
    let currentOz: Double
    let goalOz: Double
    let onLog: (Double) -> Void

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("HYDRATION")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.4)
                            .foregroundStyle(LifeOSColor.Metric.water)
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text("\(Int(currentOz))")
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(.white)
                            Text("/ \(Int(goalOz)) oz")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    Spacer()
                    ZStack {
                        Circle()
                            .stroke(LifeOSColor.Metric.water.opacity(0.15), lineWidth: 10)
                        Circle()
                            .trim(from: 0, to: min(1, currentOz / max(1, goalOz)))
                            .stroke(
                                LinearGradient(
                                    colors: [LifeOSColor.Metric.water, Color(hex: 0x0EA5E9)],
                                    startPoint: .top, endPoint: .bottom
                                ),
                                style: StrokeStyle(lineWidth: 10, lineCap: .round)
                            )
                            .rotationEffect(.degrees(-90))
                        Image(systemName: "drop.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(LifeOSColor.Metric.water)
                    }
                    .frame(width: 68, height: 68)
                }

                HStack(spacing: 8) {
                    ForEach([8.0, 16.0, 24.0], id: \.self) { oz in
                        Button {
                            Haptics.tap()
                            onLog(oz)
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plus")
                                Text("\(Int(oz)) oz")
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                Capsule().fill(LifeOSColor.Metric.water.opacity(0.16))
                            )
                            .foregroundStyle(LifeOSColor.Metric.water)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}
