import SwiftUI

/// Uniform delta pill for every metric in the app. Single source of
/// truth for "+12% vs 7d" / "−3.4 vs last week" rendering — keeps the
/// colors (green up / red down or vice-versa depending on direction
/// sense) and arrow glyph consistent across charts, vital tiles, and
/// analysis cards.
struct TrendDelta: View {
    let value: Double
    let label: String              // e.g. "vs 7d" or "vs prior 30d"
    /// Should "up" be read as positive (HRV, sleep, mood) or negative
    /// (RHR, body weight when cutting)? Determines arrow color.
    let direction: Direction
    var fractionDigits: Int = 1
    var hidesWhenZero: Bool = false

    enum Direction { case upIsGood, upIsBad, neutral }

    var body: some View {
        if hidesWhenZero && abs(value) < 0.05 {
            EmptyView()
        } else {
            HStack(spacing: 3) {
                Image(systemName: arrow)
                    .font(.system(size: 9, weight: .heavy))
                Text(formatted)
                    .font(.system(size: 10, weight: .heavy).monospacedDigit())
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(tint.opacity(0.15)))
        }
    }

    // MARK: - Derived

    private var positive: Bool { value >= 0 }
    private var isFlat: Bool { abs(value) < 0.05 }

    private var arrow: String {
        if isFlat { return "equal" }
        return positive ? "arrow.up.right" : "arrow.down.right"
    }

    private var tint: Color {
        if isFlat { return LifeOSColor.fg3 }
        switch direction {
        case .upIsGood:
            return positive ? LifeOSColor.success : LifeOSColor.danger
        case .upIsBad:
            return positive ? LifeOSColor.danger : LifeOSColor.success
        case .neutral:
            return LifeOSColor.fg2
        }
    }

    private var formatted: String {
        let fmt = "%.\(fractionDigits)f"
        let v = String(format: fmt, value)
        let signed = positive && !isFlat ? "+\(v)" : v
        return "\(signed) \(label)"
    }
}
