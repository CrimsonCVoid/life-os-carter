import SwiftUI

/// Auto-dismissing celebratory overlay shown when the user just
/// completed a set that beat their all-time PR for that exercise. The
/// overlay sits on top of the active workout view and fades after
/// ~2.4s — non-blocking so the user can keep lifting. Strong haptic +
/// glow accent.
struct PRCelebrationOverlay: View {
    let exerciseName: String
    let kindLabel: String       // "1RM" | "TOP WEIGHT" | "MOST REPS"
    let value: String           // formatted number e.g. "225 lb" or "8 reps"
    let onDismiss: () -> Void

    @State private var visible = false
    @State private var ringScale: CGFloat = 0.6
    @State private var ringOpacity: Double = 0.0

    var body: some View {
        ZStack {
            // Behind everything — dim + non-interactive
            Color.black.opacity(visible ? 0.32 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            // Center card
            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(LifeOSColor.warning.opacity(0.18))
                        .scaleEffect(ringScale)
                        .opacity(ringOpacity)
                    Circle()
                        .stroke(LifeOSColor.warning.opacity(0.5), lineWidth: 2)
                        .scaleEffect(ringScale * 0.9)
                        .opacity(ringOpacity)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundStyle(LifeOSColor.warning)
                }
                .frame(width: 110, height: 110)
                VStack(spacing: 4) {
                    Text("NEW PR")
                        .font(.system(size: 11, weight: .heavy)).tracking(2.0)
                        .foregroundStyle(LifeOSColor.warning)
                    Text(value)
                        .font(.system(size: 36, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                    Text("\(kindLabel) · \(exerciseName)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg2)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 26).padding(.vertical, 22)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(LifeOSColor.warning.opacity(0.4), lineWidth: 1)
                    )
                    .shadow(color: LifeOSColor.warning.opacity(0.4), radius: 30, x: 0, y: 0)
            )
            .scaleEffect(visible ? 1 : 0.86)
            .opacity(visible ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.72)) {
                visible = true
            }
            withAnimation(.easeOut(duration: 0.9)) {
                ringScale = 1.4
                ringOpacity = 1.0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
                withAnimation(.easeIn(duration: 0.2)) {
                    visible = false
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                    onDismiss()
                }
            }
        }
    }
}
