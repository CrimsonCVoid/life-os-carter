import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Second Live Activity card for an in-flight workout — buttons only.
/// Pairs with the info card (`WorkoutActivityWidget`) which shows the
/// timer / sets / last-set summary above. Splitting controls into their
/// own card means each is tight, the system stacks them as separate
/// entries on the Lock Screen, and the user gets large hit targets.
///
/// On tap, the matching LiveActivityIntent does THREE things in order:
///   1. Fires a haptic in the main app process (immediate feel)
///   2. Tags `lastAction` + `lastActionAt` on the shared content state
///   3. Pushes that state to both activities so this widget can render
///      a "just pressed" pulse on the matching button below
@available(iOS 16.2, *)
struct WorkoutControlsWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutControlsAttributes.self) { context in
            ControlsLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.42))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            // No DI presence — the info widget owns the DI surface.
            // We still have to declare regions to satisfy the API.
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    if #available(iOS 17.0, *) {
                        ControlsRow(state: context.state, compact: true)
                    }
                }
            } compactLeading: {
                EmptyView()
            } compactTrailing: {
                EmptyView()
            } minimal: {
                EmptyView()
            }
            .widgetURL(URL(string: "lifeos://workout/active"))
        }
    }
}

// MARK: - Lock screen body

@available(iOS 16.2, *)
private struct ControlsLockScreenView: View {
    let state: WorkoutContentState

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "hand.tap.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text("WORKOUT CONTROLS")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                Spacer()
                if let endsAt = state.restEndsAt, endsAt > Date() {
                    HStack(spacing: 4) {
                        Image(systemName: "timer")
                            .font(.system(size: 10))
                        Text(timerInterval: Date()...endsAt, countsDown: true)
                            .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    }
                    .foregroundStyle(.orange)
                }
            }
            .foregroundStyle(.white.opacity(0.6))

            if #available(iOS 17.0, *) {
                ControlsRow(state: state, compact: false)
            } else {
                Text("Update to iOS 17 to use Live Activity buttons.")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.6))
                    .padding(.vertical, 12)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

// MARK: - Buttons row with tap-feedback pulse

/// The button row used on the Lock Screen AND inside the Dynamic Island
/// expanded view. Three actions: Set / +30s / Skip. Each button watches
/// `state.lastAction` + `state.lastActionAt`; if its op matches and the
/// timestamp is within the pulse window, it animates a brief scale +
/// color flash to confirm the tap landed.
@available(iOS 17.0, *)
private struct ControlsRow: View {
    let state: WorkoutContentState
    let compact: Bool

    /// How long the post-tap pulse stays visible. ~700ms is short
    /// enough to feel responsive, long enough to be unmissable.
    private let pulseWindow: TimeInterval = 0.7

    var body: some View {
        // Wrap in a TimelineView so we re-render once the pulse window
        // expires — without it the highlight would stick until the
        // next state push.
        TimelineView(.periodic(from: .now, by: 0.15)) { ctx in
            HStack(spacing: 8) {
                pulseButton(
                    intent: CompleteCurrentSetIntent(),
                    op: WorkoutAction.completeSet,
                    icon: "checkmark.circle.fill",
                    label: "Set done",
                    tint: .cyan,
                    now: ctx.date
                )
                pulseButton(
                    intent: AddRestIntent(),
                    op: WorkoutAction.addRest,
                    icon: "plus",
                    label: "+30s",
                    tint: .orange,
                    now: ctx.date
                )
                pulseButton(
                    intent: SkipRestIntent(),
                    op: WorkoutAction.skipRest,
                    icon: "forward.fill",
                    label: "Skip rest",
                    tint: restActive ? .white : .white.opacity(0.4),
                    now: ctx.date,
                    disabled: !restActive
                )
            }
        }
    }

    private var restActive: Bool {
        (state.restEndsAt ?? .distantPast) > Date()
    }

    @ViewBuilder
    private func pulseButton<I: AppIntent>(
        intent: I,
        op: String,
        icon: String,
        label: String,
        tint: Color,
        now: Date,
        disabled: Bool = false
    ) -> some View {
        let isPulsing: Bool = {
            guard let lastOp = state.lastAction, lastOp == op,
                  let at = state.lastActionAt else { return false }
            return now.timeIntervalSince(at) < pulseWindow
        }()

        Button(intent: intent) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: compact ? 12 : 16, weight: .semibold))
                Text(label)
                    .font(.system(size: compact ? 12 : 14, weight: .semibold))
            }
            .foregroundStyle(isPulsing ? .black : tint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, compact ? 9 : 14)
            .background(
                Capsule()
                    .fill(isPulsing ? tint : Color.white.opacity(0.09))
            )
            .overlay(
                Capsule()
                    .stroke(isPulsing ? tint : Color.white.opacity(0.16), lineWidth: 0.5)
            )
            .scaleEffect(isPulsing ? 1.06 : 1)
            .shadow(
                color: isPulsing ? tint.opacity(0.6) : .clear,
                radius: isPulsing ? 12 : 0
            )
            .animation(.spring(response: 0.22, dampingFraction: 0.55), value: isPulsing)
        }
        .buttonStyle(.plain)
        .tint(tint)
        .disabled(disabled)
    }
}
