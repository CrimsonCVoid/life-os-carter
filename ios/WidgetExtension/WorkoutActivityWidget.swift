/**
 * WorkoutActivityWidget — Live Activity views for the Lock Screen banner
 * + Dynamic Island (compact / expanded / minimal). All Liquid Glass
 * (iOS 26 SwiftUI APIs).
 *
 * Pairs with ios/Shared/WorkoutActivityAttributes.swift — add that file
 * to both the App target AND the WidgetExtension target.
 */

#if os(iOS)
import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct WorkoutActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            // ─── Lock Screen banner ───
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.4))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ExpandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottom(context: context)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(LinearGradient(
                        colors: [.cyan, .mint],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
            } compactTrailing: {
                if let restEnds = context.state.restEndsAt, restEnds > Date() {
                    Text(timerInterval: Date()...restEnds, countsDown: true)
                        .monospacedDigit()
                        .foregroundStyle(.orange)
                        .frame(maxWidth: 56)
                } else {
                    Text("\(context.state.setsCompleted) sets")
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }
            } minimal: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(Color.cyan)
            }
            .widgetURL(URL(string: "lifeos://workout/active"))
            .keylineTint(Color.cyan)
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// Lock Screen banner
// ────────────────────────────────────────────────────────────────────────

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>

    var body: some View {
        VStack(spacing: 10) {
            topRow
            if #available(iOS 17.0, *) {
                ActionButtonRow(restActive: (context.state.restEndsAt ?? .distantPast) > Date())
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    private var topRow: some View {
        HStack(spacing: 14) {
            // Icon disc
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color.cyan.opacity(0.35), Color.mint.opacity(0.25)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 44, height: 44)
            .modifier(GlassDisc())

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(context.attributes.workoutType.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.4)
                        .foregroundStyle(.cyan)
                    Text("·")
                        .foregroundStyle(.white.opacity(0.3))
                    Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                        .font(.system(size: 11, weight: .medium).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.6))
                }
                if let last = context.state.lastSetSummary, let name = context.state.lastExerciseName {
                    Text("\(name)")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(last)
                        .font(.system(size: 12, weight: .regular).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.7))
                } else {
                    Text("Workout in progress")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(context.state.setsCompleted)")
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white)
                Text("sets")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.55))
            }

            if let restEnds = context.state.restEndsAt, restEnds > Date() {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(timerInterval: Date()...restEnds, countsDown: true)
                        .font(.system(size: 18, weight: .semibold).monospacedDigit())
                        .foregroundStyle(.orange)
                    Text("rest")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(.orange.opacity(0.8))
                }
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// Interactive button row — Complete Set / +30s / Skip rest
// ────────────────────────────────────────────────────────────────────────

@available(iOS 17.0, *)
private struct ActionButtonRow: View {
    let restActive: Bool

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: CompleteCurrentSetIntent()) {
                ActionLabel(
                    icon: "checkmark.circle.fill",
                    text: "Set",
                    tint: .cyan
                )
            }
            .buttonStyle(.plain)
            .tint(.cyan)

            Button(intent: AddRestIntent()) {
                ActionLabel(
                    icon: "plus",
                    text: "30s",
                    tint: .orange
                )
            }
            .buttonStyle(.plain)
            .tint(.orange)

            Button(intent: SkipRestIntent()) {
                ActionLabel(
                    icon: "forward.fill",
                    text: "Skip",
                    tint: restActive ? .white : .white.opacity(0.45)
                )
            }
            .buttonStyle(.plain)
            .disabled(!restActive)
        }
    }
}

@available(iOS 17.0, *)
private struct ActionLabel: View {
    let icon: String
    let text: String
    let tint: Color

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
            Text(text)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(.white.opacity(0.08))
        )
        .overlay(
            Capsule()
                .stroke(.white.opacity(0.12), lineWidth: 0.5)
        )
    }
}

// ────────────────────────────────────────────────────────────────────────
// Dynamic Island expanded regions
// ────────────────────────────────────────────────────────────────────────

@available(iOS 16.2, *)
private struct ExpandedLeading: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "dumbbell.fill")
                .foregroundStyle(Color.cyan)
            VStack(alignment: .leading, spacing: 1) {
                Text(context.attributes.workoutType)
                    .font(.system(size: 13, weight: .semibold))
                Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }
}

@available(iOS 16.2, *)
private struct ExpandedTrailing: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>
    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text("\(context.state.setsCompleted)")
                .font(.system(size: 18, weight: .bold).monospacedDigit())
            Text("sets")
                .font(.system(size: 10, weight: .semibold))
                .tracking(1)
                .foregroundStyle(.secondary)
        }
    }
}

@available(iOS 16.2, *)
private struct ExpandedBottom: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>
    var body: some View {
        VStack(spacing: 8) {
            HStack {
                if let name = context.state.lastExerciseName, let summary = context.state.lastSetSummary {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Last set")
                            .font(.system(size: 9, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 6) {
                            Text(name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                            Text(summary)
                                .font(.system(size: 12).monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text("Tap a set on your phone to begin")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if let restEnds = context.state.restEndsAt, restEnds > Date() {
                    HStack(spacing: 6) {
                        Image(systemName: "timer").foregroundStyle(.orange)
                        Text(timerInterval: Date()...restEnds, countsDown: true)
                            .font(.system(size: 16, weight: .semibold).monospacedDigit())
                            .foregroundStyle(.orange)
                    }
                }
            }

            if #available(iOS 17.0, *) {
                ActionButtonRow(
                    restActive: (context.state.restEndsAt ?? .distantPast) > Date()
                )
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// Liquid Glass disc modifier — iOS 26 .glassEffect with a fallback
// for the rare Live Activity render on pre-26 OS.
// ────────────────────────────────────────────────────────────────────────

private struct GlassDisc: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular, in: Circle())
        } else {
            content
                .background(.ultraThinMaterial, in: Circle())
        }
    }
}

#endif
