import SwiftUI

/// "Your levers" — the ranked board of controllable inputs that move a chosen
/// outcome for THIS user, as diverging center-zero horizontal bars. The picker
/// swaps the outcome. Pure SwiftUI shapes (no Swift Charts) so it's immune to
/// the ordinal-axis main-thread hang and reduce-motion safe.
struct LeversCard: View {
    let boards: [LeversBoard]
    @State private var selected: LeversBoard.Outcome?

    private var current: LeversBoard? {
        if let selected, let b = boards.first(where: { $0.outcome == selected }) { return b }
        return boards.first
    }

    var body: some View {
        Card(tint: current?.outcome.tint ?? LifeOSColor.accent) {
            VStack(alignment: .leading, spacing: 14) {
                header
                if boards.isEmpty {
                    emptyState
                } else if let board = current {
                    if boards.count > 1 { picker }
                    barList(board)
                    Text("Bars show each input's standardized effect — how far it moves your \(board.outcome.label.lowercased()) per typical swing. Longer bar = bigger lever. Right helps, left hurts.")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text("YOUR LEVERS")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(current?.outcome.tint ?? LifeOSColor.accent)
            Spacer()
            if let n = current?.sampleDays {
                Text("\(n)d")
                    .font(.system(size: 10, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private var picker: some View {
        Picker("Outcome", selection: Binding(
            get: { current?.outcome ?? boards.first!.outcome },
            set: { selected = $0; Haptics.tap() }
        )) {
            ForEach(boards.map(\.outcome)) { o in Text(o.label).tag(o) }
        }
        .pickerStyle(.segmented)
    }

    private func barList(_ board: LeversBoard) -> some View {
        let maxMag = max(0.2, board.levers.map { abs($0.effect) }.max() ?? 0.2)
        return VStack(spacing: 10) {
            ForEach(board.levers) { lever in
                LeverRow(lever: lever, maxMag: maxMag, outcomeTint: board.outcome.tint)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "slider.horizontal.3")
                .font(.system(size: 26))
                .foregroundStyle(LifeOSColor.accent.opacity(0.6))
            Text("Log ~2 weeks across sleep, hydration, steps, protein, and your evening habit flags, and the controllable drivers of your recovery, mood, and energy rank here.")
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }
}

/// One diverging center-zero bar: label on the left, bar growing right (helps)
/// or left (hurts) from a center axis, with a confidence-dimmed fill.
private struct LeverRow: View {
    let lever: LeversBoard.Lever
    let maxMag: Double
    let outcomeTint: Color

    private var helps: Bool { lever.effect >= 0 }
    private var fillTint: Color { helps ? LifeOSColor.success : LifeOSColor.danger }

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: lever.icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(lever.tint)
                    .frame(width: 18)
                Text(lever.label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Spacer()
                Text(String(format: "%+.2f", lever.effect))
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundStyle(fillTint)
            }
            bar
            HStack {
                Text(lever.blurb)
                    .font(.system(size: 10.5))
                    .foregroundStyle(LifeOSColor.fg3)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                confidenceDots
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(LifeOSColor.elevated.opacity(0.5),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var bar: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let half = w / 2
            let frac = (abs(lever.effect) / maxMag).clamped(to: 0...1)
            let len = half * frac
            ZStack(alignment: .center) {
                Capsule().fill(LifeOSColor.stroke.opacity(0.5)).frame(height: 6)
                Rectangle().fill(LifeOSColor.fg3.opacity(0.4)).frame(width: 1, height: 12)
                Capsule()
                    .fill(fillTint.opacity(0.35 + 0.5 * lever.confidence))
                    .frame(width: max(3, len), height: 6)
                    .offset(x: helps ? len / 2 : -len / 2)
            }
            .frame(width: w, height: 12)
        }
        .frame(height: 12)
    }

    private var confidenceDots: some View {
        let lit = lever.confidence >= 0.66 ? 3 : (lever.confidence >= 0.4 ? 2 : 1)
        return HStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(i < lit ? outcomeTint : LifeOSColor.stroke)
                    .frame(width: 4, height: 4)
            }
        }
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self { min(max(self, range.lowerBound), range.upperBound) }
}
