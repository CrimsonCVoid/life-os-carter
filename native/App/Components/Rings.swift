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
/// a second time at a lighter opacity, like Apple's rings).
struct ProgressRing: View {
    let progress: Double
    let tint: Color
    var lineWidth: CGFloat = 14

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.18), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            Circle()
                .trim(from: 0, to: min(1, progress))
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [tint.opacity(0.85), tint]),
                        center: .center,
                        startAngle: .degrees(-90),
                        endAngle: .degrees(270)
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

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
        .animation(.easeOut(duration: 0.6), value: progress)
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

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.15), style: StrokeStyle(lineWidth: 14, lineCap: .round))

            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    AngularGradient(
                        colors: [tint.opacity(0.6), tint],
                        center: .center,
                        startAngle: .degrees(-90),
                        endAngle: .degrees(270)
                    ),
                    style: StrokeStyle(lineWidth: 14, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: size * 0.34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .frame(width: size, height: size)
        .animation(.easeOut(duration: 0.6), value: progress)
    }
}
