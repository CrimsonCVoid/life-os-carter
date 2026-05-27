import SwiftUI

/// Horizontal scrolling number-line ("ruler") picker. A fixed center
/// indicator marks the selected value; the ticks slide under the finger
/// with a `Haptics.tick()` on every whole unit crossed and a settle tap
/// on release. The ticks are Canvas-drawn (no per-tick views) so a wide
/// range like 80…450 stays cheap, and the big readout is fully
/// formattable so height can render as "5 ft 9 in" instead of inches.
struct RulerPicker: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    let tint: Color
    /// Tick interval that gets a taller, labeled mark.
    var majorEvery: Int = 5
    /// Big center readout, e.g. { "\($0) lb" } or the ft/in formatter.
    var format: (Int) -> String
    /// Label drawn under each major tick (nil = no labels).
    var majorLabel: ((Int) -> String)? = nil

    /// Exact position in value-units; fractional while dragging for smooth
    /// motion. `value` is its rounded, clamped projection.
    @State private var pos: Double = 0
    @State private var startPos: Double = 0
    @State private var isDragging = false
    @State private var lastTick: Int = 0

    private let cell: CGFloat = 16   // px between adjacent unit ticks

    var body: some View {
        VStack(spacing: 12) {
            Text(format(value))
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(LifeOSColor.fg)
                .contentTransition(.numericText())
                .animation(.snappy(duration: 0.18), value: value)

            GeometryReader { geo in
                Canvas { ctx, size in
                    let mid = size.width / 2
                    let span = Int(mid / cell) + 2
                    let lo = max(range.lowerBound, Int(pos.rounded()) - span)
                    let hi = min(range.upperBound, Int(pos.rounded()) + span)
                    guard lo <= hi else { return }
                    for v in lo...hi {
                        let x = mid + (CGFloat(v) - CGFloat(pos)) * cell
                        let isMajor = v % majorEvery == 0
                        let h: CGFloat = isMajor ? 26 : 14
                        let dist = abs(x - mid) / mid
                        let alpha = max(0.12, 1 - dist * 0.95)
                        let color = (isMajor ? LifeOSColor.fg2 : LifeOSColor.fg3).opacity(alpha)
                        var path = Path()
                        path.move(to: CGPoint(x: x, y: 8))
                        path.addLine(to: CGPoint(x: x, y: 8 + h))
                        ctx.stroke(path, with: .color(color), lineWidth: isMajor ? 2 : 1.5)
                        if isMajor, let majorLabel {
                            let text = Text(majorLabel(v))
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(LifeOSColor.fg3.opacity(alpha))
                            ctx.draw(text, at: CGPoint(x: x, y: 8 + h + 9))
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .overlay(alignment: .top) {
                    VStack(spacing: 2) {
                        Image(systemName: "triangle.fill")
                            .font(.system(size: 7))
                            .foregroundStyle(tint)
                        Rectangle()
                            .fill(tint)
                            .frame(width: 2.5, height: 30)
                    }
                    .padding(.top, 2)
                }
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            if !isDragging { isDragging = true; startPos = pos }
                            let next = (startPos - Double(g.translation.width) / Double(cell))
                                .clamped(to: Double(range.lowerBound)...Double(range.upperBound))
                            pos = next
                            let rounded = Int(next.rounded())
                            if rounded != value { value = rounded }
                            if rounded != lastTick {
                                Haptics.tick()
                                lastTick = rounded
                            }
                        }
                        .onEnded { _ in
                            isDragging = false
                            withAnimation(.snappy(duration: 0.18)) { pos = Double(value) }
                            Haptics.tap()
                        }
                )
            }
            .frame(height: 58)
        }
        .onAppear {
            pos = Double(value)
            lastTick = value
        }
        .onChange(of: value) { _, new in
            // Re-center if something external moved the value (e.g. a unit
            // toggle) while we're not actively dragging.
            if !isDragging && Double(new) != pos {
                withAnimation(.snappy(duration: 0.18)) { pos = Double(new) }
            }
        }
    }
}

private extension Comparable {
    func clamped(to limits: ClosedRange<Self>) -> Self {
        min(max(self, limits.lowerBound), limits.upperBound)
    }
}
