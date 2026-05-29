import Foundation
import SwiftUI

/// Derives a one-line training recommendation from the recovery
/// score, today's strain, and recent workout history. Lives as a
/// pure function so it can be unit-tested independently of any
/// SwiftUI surface; the renderer is a small Card view below.
enum RecoveryAdvice {
    struct Line {
        let title: String
        let detail: String
        let tint: Color
        let icon: String
    }

    static func generate(
        recovery: RecoveryResult?,
        strainToday: StrainCalculator.Score,
        consecutiveTrainingDays: Int
    ) -> Line? {
        guard let r = recovery else {
            return Line(
                title: "Wear a watch overnight",
                detail: "Recovery score needs HRV, RHR, or sleep data — none came through yet.",
                tint: LifeOSColor.fg3,
                icon: "applewatch"
            )
        }
        // High recovery → push it (unless they've already been hammering)
        if r.band == .high {
            if strainToday.value >= 14 {
                return Line(
                    title: "Recovered — and you've already trained hard",
                    detail: "Strain is at \(String(format: "%.1f", strainToday.value)) today. Save the green light for tomorrow's session.",
                    tint: LifeOSColor.success,
                    icon: "checkmark.circle.fill"
                )
            }
            if consecutiveTrainingDays >= 5 {
                return Line(
                    title: "Recovered, but \(consecutiveTrainingDays) days in a row",
                    detail: "Body says push it; calendar says cycle in a deload. Aim for moderate today.",
                    tint: LifeOSColor.warning,
                    icon: "arrow.triangle.2.circlepath"
                )
            }
            return Line(
                title: "Green light — push it today",
                detail: "Recovery is \(r.score). Hard intervals, a heavy compound, or a long run all in play.",
                tint: LifeOSColor.success,
                icon: "bolt.fill"
            )
        }
        // Medium recovery → maintain
        if r.band == .medium {
            return Line(
                title: "Yellow — keep it moderate",
                detail: "Recovery is \(r.score). Stick to your normal volume; skip the heaviest top sets and intervals.",
                tint: LifeOSColor.warning,
                icon: "equal.circle.fill"
            )
        }
        // Low recovery → take it easy
        return Line(
            title: "Red — recover today",
            detail: "Recovery is \(r.score). A walk, mobility, or full rest pays back tomorrow more than forcing a session does.",
            tint: LifeOSColor.danger,
            icon: "moon.zzz.fill"
        )
    }
}

/// One-line card sitting under the Recovery + Strain hero. Reads as
/// a coach note, not a stat — short, opinionated, actionable.
struct RecoveryAdviceCard: View {
    let line: RecoveryAdvice.Line

    var body: some View {
        Card(tint: line.tint) {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(line.tint.opacity(0.18))
                    Image(systemName: line.icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(line.tint)
                }
                .frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 3) {
                    Text(line.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(LifeOSColor.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(line.detail)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
    }
}
