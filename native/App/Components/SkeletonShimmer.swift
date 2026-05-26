import SwiftUI

/// Loading-state placeholder with a soft shimmer sweep. Replaces the
/// generic ProgressView spinner on async AI cards (CorrelationsCard,
/// NutritionInsightsCard, etc.) so the loading state previews the
/// shape of the loaded content instead of a centered spinner.
struct SkeletonShimmer<Content: View>: View {
    let lines: Int
    let lastLineFraction: CGFloat
    let cornerRadius: CGFloat
    let content: Content

    init(
        lines: Int = 3,
        lastLineFraction: CGFloat = 0.55,
        cornerRadius: CGFloat = 6,
        @ViewBuilder content: () -> Content = { EmptyView() }
    ) {
        self.lines = lines
        self.lastLineFraction = lastLineFraction
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    @State private var phase: CGFloat = -0.6

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(0..<lines, id: \.self) { idx in
                bar(width: idx == lines - 1 ? lastLineFraction : 1.0)
            }
            content
        }
        .onAppear { animateShimmer() }
    }

    private func bar(width: CGFloat) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(LifeOSColor.elevated)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: Color.white.opacity(0.12), location: 0.5),
                                .init(color: .clear, location: 1),
                            ],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .frame(width: geo.size.width * 0.5)
                    .offset(x: geo.size.width * phase)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .frame(width: geo.size.width * width)
        }
        .frame(height: 12)
    }

    private func animateShimmer() {
        withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
            phase = 1.2
        }
    }
}

/// Apply on any view to gate it with the shimmer when `isLoading`.
struct ShimmerLoadingModifier: ViewModifier {
    let isLoading: Bool
    let lines: Int

    func body(content: Content) -> some View {
        if isLoading {
            SkeletonShimmer(lines: lines)
        } else {
            content
        }
    }
}

extension View {
    func shimmerLoading(_ isLoading: Bool, lines: Int = 3) -> some View {
        modifier(ShimmerLoadingModifier(isLoading: isLoading, lines: lines))
    }
}
