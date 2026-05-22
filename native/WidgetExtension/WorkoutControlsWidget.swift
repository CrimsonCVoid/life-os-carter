import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Companion Lock Screen Live Activity carrying ONLY the action buttons
/// (Set done / +30s / Skip rest). Registered with a higher
/// relevanceScore than the Info widget so iOS places it on top of the
/// stack — buttons stay reachable without long-pressing to expand the
/// stack. A compact one-line summary strip lives at the top of the
/// card so even when this card is the one peeking from behind, the
/// user sees something useful (rest countdown / last set / next up).
@available(iOS 16.2, *)
struct WorkoutControlsWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutControlsAttributes.self) { context in
            ControlsLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.42))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            // No DI presence — the Info widget owns the Dynamic Island
            // surface (compact / minimal / expanded). We just satisfy
            // the API by declaring empty regions.
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    if #available(iOS 17.0, *) {
                        PulseActionRow(
                            state: context.state,
                            restActive: (context.state.restEndsAt ?? .distantPast) > Date()
                        )
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

// MARK: - Lock Screen layout

@available(iOS 16.2, *)
private struct ControlsLockScreenView: View {
    let state: WorkoutContentState

    var body: some View {
        VStack(spacing: 10) {
            peekStrip
            if #available(iOS 17.0, *) {
                PulseActionRow(
                    state: state,
                    restActive: (state.restEndsAt ?? .distantPast) > Date()
                )
            } else {
                Text("Update to iOS 17 to use Live Activity buttons.")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.6))
                    .padding(.vertical, 16)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    /// One-line context strip at the top of the card so this surface
    /// is informative when peeking from behind the Info card. Priority:
    /// rest countdown (when resting) > last-set summary > "tap to log
    /// your first set" placeholder.
    @ViewBuilder
    private var peekStrip: some View {
        HStack(spacing: 8) {
            Image(systemName: "hand.tap.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.55))
            Text("WORKOUT")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.55))
            Spacer()
            if let endsAt = state.restEndsAt, endsAt > Date() {
                HStack(spacing: 5) {
                    Image(systemName: "timer")
                        .font(.system(size: 11))
                    Text(timerInterval: Date()...endsAt, countsDown: true)
                        .font(.system(size: 13, weight: .bold).monospacedDigit())
                }
                .foregroundStyle(.orange)
            } else if let last = state.lastSetSummary {
                Text(last)
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white)
                    .lineLimit(1)
            } else {
                Text("\(state.setsCompleted) sets")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
    }
}
