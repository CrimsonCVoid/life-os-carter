import SwiftUI
import SwiftData

/// App-wide background. Two modes, chosen from `UserSettings`:
///
/// - "mesh" (default): an animated MeshGradient (iOS 18+) / layered
///   gradient fallback. Subtle ambient atmosphere so the dark page
///   doesn't read as a flat black void; the foreground cards carry
///   their own glow.
/// - "photo": a user-picked image behind a heavy backdrop blur + dark
///   scrim, with a faint version of the mesh glow layered on top so the
///   app still feels like itself. The blur/scrim strength tracks
///   `backgroundIntensity`. We err toward more scrim so glass cards and
///   text stay legible over any photo.
///
/// Reads the single `UserSettings` row directly via `@Query` so call
/// sites stay zero-argument — `AmbientBackground()` and
/// `AmbientBackground(accent:)` both keep working with no changes.
struct AmbientBackground: View {
    /// Optional accent override (e.g. recovery band color on Today).
    /// Default uses the app accent.
    var accent: Color = LifeOSColor.accent

    @Query private var settingsRows: [UserSettings]

    @State private var phase: Double = 0

    private var settings: UserSettings? { settingsRows.first }

    private var usePhoto: Bool {
        settings?.backgroundStyle == "photo"
            && BackgroundStore.image(for: settings?.backgroundImageFilename) != nil
    }

    /// 0...1, defaulted high so a fresh photo reads legibly out of the box.
    private var intensity: Double { settings?.backgroundIntensity ?? 0.85 }

    var body: some View {
        ZStack {
            LifeOSColor.base.ignoresSafeArea()
            if usePhoto, let image = BackgroundStore.image(for: settings?.backgroundImageFilename) {
                photoLayers(image)
            } else {
                meshLayers
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 36).repeatForever(autoreverses: true)) {
                phase = 1
            }
        }
    }

    // MARK: - Photo background

    @ViewBuilder
    private func photoLayers(_ image: UIImage) -> some View {
        // Blur radius scales 18...60 with intensity; scrim opacity
        // scales 0.45...0.82 so the foreground is always readable. Higher
        // intensity = blurrier base + darker scrim.
        let blurRadius = 18 + 42 * intensity
        let scrimOpacity = 0.45 + 0.37 * intensity

        Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .blur(radius: blurRadius, opaque: true)
            .overlay(LifeOSColor.base.opacity(scrimOpacity))
            .ignoresSafeArea()
            .clipped()

        // Faint app glow on top so the photo still feels like Life OS.
        Group {
            if #available(iOS 18.0, *) {
                meshLayer.opacity(0.16).blur(radius: 90)
            } else {
                fallbackLayer.opacity(0.14).blur(radius: 100)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Mesh background (default)

    @ViewBuilder
    private var meshLayers: some View {
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
        // Subtle second slow-drifting radial for added depth — counter-
        // phased from the mesh so the atmosphere never resolves into a
        // static shape. Cheap (single blurred radial) and reduced-motion
        // safe (driven by the same `phase`, which honors the animation
        // disable that `prefers-reduced-motion` applies).
        RadialGradient(
            colors: [accent.opacity(0.10), .clear],
            center: UnitPoint(x: 0.8 - 0.25 * phase, y: 0.72),
            startRadius: 0,
            endRadius: 360
        )
        .blur(radius: 60)
        .ignoresSafeArea()
        .allowsHitTesting(false)
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
                // `base` (adaptive) instead of literal black so the mesh's
                // anchor color follows light/dark — black anchors would blotch
                // the page dark in light mode.
                LifeOSColor.base, accent.opacity(0.4), LifeOSColor.Metric.peak.opacity(0.35),
                LifeOSColor.Metric.sleep.opacity(0.45), accent.opacity(0.55), LifeOSColor.base,
                LifeOSColor.base, LifeOSColor.Metric.peak.opacity(0.18), LifeOSColor.base,
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
