import SwiftUI

/// Apple-Fitness-style three-ring stack. On Today these map to
/// Steps (outer) / Sleep (middle) / Water (inner) — the same three
/// metrics labeled beside the rings — so each ring's tint matches its
/// metric. Each ring's progress is clamped 0-1. Tints come from
/// `LifeOSColor.Metric.*` so the brand stays consistent.
struct ActivityRings: View {
    let move: Double          // outer — Steps
    let exercise: Double      // middle — Sleep
    let stand: Double         // inner — Water
    var lineWidth: CGFloat = 14

    var body: some View {
        ZStack {
            ProgressRing(progress: move,     tint: LifeOSColor.Metric.steps,    lineWidth: lineWidth)
            ProgressRing(progress: exercise, tint: LifeOSColor.Metric.sleep,    lineWidth: lineWidth)
                .padding(lineWidth + 4)
            ProgressRing(progress: stand,    tint: LifeOSColor.Metric.water,    lineWidth: lineWidth)
                .padding((lineWidth + 4) * 2)
        }
    }
}

/// Standalone progress ring with overshoot support (progress > 1 wraps
/// a second time at a lighter opacity, like Apple's rings). Uses the
/// shared `LifeOSGradient.ring` sweep so every ring in the app reads with
/// the same premium ramp. `showCapGlow` adds a soft dot at the arc head.
struct ProgressRing: View {
    let progress: Double
    let tint: Color
    var lineWidth: CGFloat = 14
    var showCapGlow: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.18), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            Circle()
                .trim(from: 0, to: min(1, progress))
                .stroke(
                    LifeOSGradient.ring(tint),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .overlay(capGlow)

            // Overshoot ring (>100%)
            if progress > 1 {
                Circle()
                    .trim(from: 0, to: min(1, progress - 1))
                    .stroke(
                        tint.opacity(0.6),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: tint.opacity(0.4), radius: 6, x: 0, y: 0)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: progress)
    }

    @ViewBuilder private var capGlow: some View {
        if showCapGlow, progress > 0.02 {
            GeometryReader { geo in
                let r = geo.size.width / 2
                let a = Angle.degrees(-90 + 360 * min(1, progress)).radians
                Circle()
                    .fill(tint)
                    .frame(width: lineWidth, height: lineWidth)
                    .shadow(color: tint.opacity(0.7), radius: 6)
                    .position(x: r + r * cos(CGFloat(a)), y: r + r * sin(CGFloat(a)))
            }
        }
    }
}

/// Single big ring with a value rendered in the center — used for the
/// Peak State / Readiness hero score.
struct ScoreRing: View {
    let progress: Double    // 0-1
    let value: String
    let label: String
    let tint: Color
    var size: CGFloat = 160
    /// Small caption under the value (band, "of 21", etc.).
    var sublabel: String? = nil
    /// Faint tick backdrop for a "dial" read.
    var gauge: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if gauge { tickGauge }

            Circle()
                .stroke(tint.opacity(0.15), style: StrokeStyle(lineWidth: 14, lineCap: .round))

            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    LifeOSGradient.ring(tint),
                    style: StrokeStyle(lineWidth: 14, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .overlay(capGlow)

            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: size * 0.34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(LifeOSColor.fg)
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
                if let sublabel {
                    Text(sublabel)
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(tint.opacity(0.85))
                        .padding(.top, 1)
                }
            }
        }
        .frame(width: size, height: size)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: progress)
    }

    @ViewBuilder private var capGlow: some View {
        if progress > 0.02 {
            GeometryReader { geo in
                let r = geo.size.width / 2
                let a = Angle.degrees(-90 + 360 * min(1, progress)).radians
                Circle()
                    .fill(tint)
                    .frame(width: 14, height: 14)
                    .shadow(color: tint.opacity(0.7), radius: 6)
                    .position(x: r + r * cos(CGFloat(a)), y: r + r * sin(CGFloat(a)))
            }
        }
    }

    // 60 faint ticks behind the ring — pure SwiftUI shapes, no Charts.
    private var tickGauge: some View {
        ForEach(0..<60, id: \.self) { i in
            RoundedRectangle(cornerRadius: 1)
                .fill(LifeOSColor.fg3.opacity(i % 5 == 0 ? 0.25 : 0.1))
                .frame(width: 1.5, height: i % 5 == 0 ? 7 : 4)
                .offset(y: -(size / 2) + 2)
                .rotationEffect(.degrees(Double(i) / 60 * 360))
        }
    }
}
