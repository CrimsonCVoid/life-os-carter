import SwiftUI

/// Floating Liquid Glass tab bar that replaces SwiftUI's default
/// TabView chrome. Pill-shaped, sits above the safe-area inset, uses
/// `.ultraThinMaterial` for the surface and a sliding accent capsule
/// behind the active tab.
///
/// Why custom instead of `TabView`? SwiftUI's default tab bar can't
/// be styled with a glass effect on iOS 17 (the `tabViewStyle` /
/// `accessoryBar` APIs are iOS 18+) and we want the same chrome on
/// every supported version. The custom impl also lets us layer haptics
/// on selection, sliding-pill animation, and an active-state symbol
/// transition.
struct LiquidGlassTabBar: View {
    @Binding var selection: RootTab

    @Namespace private var pillNamespace

    var body: some View {
        HStack(spacing: 0) {
            ForEach(RootTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .liquidGlass(cornerRadius: 28, depth: .deep)
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(LinearGradient(
                    colors: [Color.white.opacity(0.22), Color.white.opacity(0.06)],
                    startPoint: .top, endPoint: .bottom
                ), lineWidth: 1)
        )
        .padding(.horizontal, 18)
    }

    private func tabButton(_ tab: RootTab) -> some View {
        let isActive = selection == tab
        return Button {
            if selection != tab {
                Haptics.tick()
                withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) {
                    selection = tab
                }
            }
        } label: {
            VStack(spacing: 3) {
                ZStack {
                    if isActive {
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [LifeOSColor.accent, LifeOSColor.accentStrong],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 52, height: 36)
                            .shadow(color: LifeOSColor.accent.opacity(0.4), radius: 10, x: 0, y: 4)
                            .matchedGeometryEffect(id: "active-pill", in: pillNamespace)
                    }
                    Image(systemName: tab.icon)
                        .symbolRenderingMode(.hierarchical)
                        .font(.system(size: 17, weight: isActive ? .bold : .medium))
                        .foregroundStyle(isActive ? .white : LifeOSColor.fg2)
                        .contentTransition(.symbolEffect(.replace.downUp))
                }
                .frame(height: 36)
                Text(tab.label)
                    .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                    .foregroundStyle(isActive ? LifeOSColor.fg : LifeOSColor.fg3)
                    .opacity(isActive ? 1 : 0.7)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

enum RootTab: String, CaseIterable, Identifiable {
    case today, nutrition, habits, gym, analysis
    var id: String { rawValue }
    var label: String {
        switch self {
        case .today:     return "Today"
        case .nutrition: return "Nutrition"
        case .habits:    return "Habits"
        case .gym:       return "Gym"
        case .analysis:  return "Analysis"
        }
    }
    var icon: String {
        switch self {
        case .today:     return "house.fill"
        case .nutrition: return "fork.knife"
        case .habits:    return "checkmark.circle.fill"
        case .gym:       return "dumbbell.fill"
        case .analysis:  return "waveform.path.ecg"
        }
    }
}
