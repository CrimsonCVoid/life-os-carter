import SwiftUI

/// A slide-to-confirm destructive button. Renders as a pill-shaped
/// track with a draggable arrow knob on the left; the user drags the
/// knob across to the right edge to commit the action. Past the
/// commit threshold (90% of track travel) it auto-commits on release;
/// short of the threshold it springs back. Crossing the threshold
/// also fires a rigid tick haptic so the user feels they've reached
/// the commit zone, and a warning haptic on commit.
///
/// Intentionally heavy gesture — exists for actions where an accidental
/// tap would be unrecoverable (deleting a finished workout, wiping
/// data, etc.). For lighter destructive actions, use a contextMenu or
/// a Confirm dialog instead.
struct SlideToDeleteBar: View {
    let label: String
    let onCommit: () -> Void

    @State private var dragX: CGFloat = 0
    @State private var trackWidth: CGFloat = 0
    @State private var didHapticAtThreshold = false
    @State private var committed = false

    private let knobSize: CGFloat = 48
    private let trackHeight: CGFloat = 56
    private let trackInset: CGFloat = 4

    /// Past this fraction of available travel, releasing commits the
    /// delete instead of springing back.
    private let commitFraction: CGFloat = 0.90

    private var maxTravel: CGFloat {
        max(0, trackWidth - knobSize - trackInset * 2)
    }

    private var progress: CGFloat {
        guard maxTravel > 0 else { return 0 }
        return min(1, max(0, dragX / maxTravel))
    }

    private var armed: Bool { progress >= commitFraction }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                trackBackground
                fillOverlay
                trackLabel
                knob
            }
            .frame(height: trackHeight)
            .onAppear { trackWidth = geo.size.width }
            .onChange(of: geo.size.width) { _, w in trackWidth = w }
        }
        .frame(height: trackHeight)
    }

    // MARK: - Pieces

    private var trackBackground: some View {
        RoundedRectangle(cornerRadius: trackHeight / 2, style: .continuous)
            .fill(LifeOSColor.elevated)
            .overlay(
                RoundedRectangle(cornerRadius: trackHeight / 2, style: .continuous)
                    .stroke(LifeOSColor.danger.opacity(0.35), lineWidth: 1)
            )
    }

    /// Red fill that grows under the knob as it travels. Pulse to a
    /// brighter shade once the commit threshold is crossed so the user
    /// has visual confirmation in addition to the rigid haptic.
    private var fillOverlay: some View {
        RoundedRectangle(cornerRadius: trackHeight / 2, style: .continuous)
            .fill(LifeOSColor.danger.opacity(armed ? 0.55 : 0.32))
            .frame(width: knobSize + dragX + trackInset * 2)
            .animation(.easeOut(duration: 0.12), value: armed)
    }

    private var trackLabel: some View {
        HStack {
            Spacer()
            HStack(spacing: 6) {
                Image(systemName: armed ? "checkmark.circle.fill" : "trash.fill")
                    .font(.system(size: 12, weight: .semibold))
                Text(armed ? "RELEASE TO DELETE" : label.uppercased())
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.8)
            }
            .foregroundStyle(.white.opacity(0.85 - 0.5 * Double(progress)))
            Spacer()
        }
        .allowsHitTesting(false)
    }

    private var knob: some View {
        ZStack {
            Circle().fill(
                LinearGradient(
                    colors: [LifeOSColor.danger, LifeOSColor.danger.opacity(0.75)],
                    startPoint: .top, endPoint: .bottom
                )
            )
            Image(systemName: "arrow.right")
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(.white)
        }
        .frame(width: knobSize, height: knobSize)
        .shadow(color: LifeOSColor.danger.opacity(0.45), radius: 10, x: 0, y: 4)
        .offset(x: trackInset + dragX)
        .gesture(committed ? nil : drag)
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                // Reject vertical-dominant drags so the outer ScrollView
                // still scrolls cleanly when the user fat-fingers the bar.
                guard abs(value.translation.width) >= abs(value.translation.height) else { return }
                let raw = value.translation.width
                dragX = min(maxTravel, max(0, raw))
                let fraction = progress
                if fraction >= commitFraction {
                    if !didHapticAtThreshold {
                        Haptics.rigid()
                        didHapticAtThreshold = true
                    }
                } else if didHapticAtThreshold && fraction < commitFraction - 0.05 {
                    didHapticAtThreshold = false
                }
            }
            .onEnded { _ in
                didHapticAtThreshold = false
                if progress >= commitFraction {
                    committed = true
                    Haptics.warning()
                    withAnimation(.easeOut(duration: 0.12)) {
                        dragX = maxTravel
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                        onCommit()
                    }
                } else {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                        dragX = 0
                    }
                }
            }
    }
}
