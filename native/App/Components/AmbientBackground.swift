import SwiftUI

/// App-wide animated background. iOS 18+ gets a proper MeshGradient
/// with slow drift; iOS 17 falls back to a layered LinearGradient
/// that still reads as "depth" without per-pixel mesh interpolation.
///
/// Subtle by design — the foreground cards have their own glow, this
/// is purely ambient atmosphere so the dark background doesn't read
/// as a flat black void.
struct AmbientBackground: View {
    /// Optional accent override (e.g. recovery band color on Today).
    /// Default uses the app accent.
    var accent: Color = LifeOSColor.accent

    @State private var phase: Double = 0

    var body: some View {
        ZStack {
            LifeOSColor.base.ignoresSafeArea()
            if #available(iOS 18.0, *) {
                meshLayer
                    .opacity(0.35)
                    .blur(radius: 80)
                    .ignoresSafeArea()
            } else {
                fallbackLayer
                    .opacity(0.32)
                    .blur(radius: 90)
                    .ignoresSafeArea()
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 36).repeatForever(autoreverses: true)) {
                phase = 1
            }
        }
    }

    @available(iOS 18.0, *)
    private var meshLayer: some View {
        // 3x3 mesh — corner anchors stay put, the middle row drifts
        // with `phase` so the mesh feels alive without ever resolving
        // into a recognizable shape.
        MeshGradient(
            width: 3,
            height: 3,
            points: [
                .init(0, 0), .init(0.5, 0), .init(1, 0),
                .init(0, 0.5),
                .init(Float(0.35 + 0.30 * phase), 0.5),
                .init(1, 0.5),
                .init(0, 1), .init(0.5, 1), .init(1, 1),
            ],
            colors: [
                Color.black, accent.opacity(0.4), LifeOSColor.Metric.peak.opacity(0.35),
                LifeOSColor.Metric.sleep.opacity(0.45), accent.opacity(0.55), Color.black,
                Color.black, LifeOSColor.Metric.peak.opacity(0.18), Color.black,
            ]
        )
    }

    private var fallbackLayer: some View {
        ZStack {
            LinearGradient(
                colors: [accent.opacity(0.30), .clear],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            LinearGradient(
                colors: [.clear, LifeOSColor.Metric.peak.opacity(0.22)],
                startPoint: .top, endPoint: .bottom
            )
            RadialGradient(
                colors: [LifeOSColor.Metric.sleep.opacity(0.18), .clear],
                center: UnitPoint(x: 0.2 + 0.2 * phase, y: 0.3),
                startRadius: 0, endRadius: 320
            )
        }
    }
}
