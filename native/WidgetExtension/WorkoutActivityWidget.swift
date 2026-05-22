import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Live Activity widget — v2 redesign. Bigger Lock Screen banner with
/// progress bar, exercise count, kcal estimate, prominent rest timer,
/// "Next up" hint. Dynamic Island expanded view mirrors that layout.
@available(iOS 16.2, *)
struct WorkoutActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            LockScreenLargeView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.42))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ExpandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.center) {
                    if context.state.lastSetIsPR {
                        Text("NEW PR")
                            .font(.system(size: 11, weight: .heavy)).tracking(1.2)
                            .foregroundStyle(.yellow)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottom(context: context)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(LinearGradient(
                        colors: [.cyan, .mint],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
            } compactTrailing: {
                if let restEnds = context.state.restEndsAt, restEnds > Date() {
                    Text(timerInterval: Date()...restEnds, countsDown: true)
                        .monospacedDigit()
                        .foregroundStyle(.orange)
                        .frame(maxWidth: 56)
                } else {
                    Text("\(context.state.setsCompleted)")
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }
            } minimal: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(Color.cyan)
            }
            .widgetURL(URL(string: "lifeos://workout/active"))
            .keylineTint(.cyan)
        }
    }
}

// MARK: - Lock Screen large layout

@available(iOS 16.2, *)
private struct LockScreenLargeView: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>

    var body: some View {
        // Single Lock Screen card: header + hero element + action
        // buttons. iOS only allows one Live Activity per attributes
        // type to render distinctly — splitting into two cards looked
        // good in code but stacked invisibly in practice. Buttons are
        // back inline so the user can see the press feedback.
        let isResting = (context.state.restEndsAt ?? .distantPast) > Date()
        VStack(alignment: .leading, spacing: 10) {
            topHeader
            heroSection(isResting: isResting)
            if #available(iOS 17.0, *) {
                PulseActionRow(state: context.state, restActive: isResting)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    /// One of three: rest countdown (biggest), last-set summary, or
    /// next-exercise hint. Picks based on workout state so we don't
    /// stack multiple cards and blow past the height cap.
    @ViewBuilder
    private func heroSection(isResting: Bool) -> some View {
        if isResting, let restEnds = context.state.restEndsAt {
            restBar(endsAt: restEnds)
        } else if let name = context.state.lastExerciseName,
                  let summary = context.state.lastSetSummary {
            lastSetCard(name: name, summary: summary)
        } else if let next = context.state.nextExerciseName {
            nextUpCard(name: next)
        } else {
            // First-set state — show "Get started" placeholder.
            emptyHero
        }
    }

    private var emptyHero: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 22))
                .foregroundStyle(.cyan)
            Text("Add a set to get started")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white.opacity(0.8))
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 16)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var topHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [.cyan.opacity(0.4), .mint.opacity(0.25)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 44, height: 44)
            .background(.ultraThinMaterial, in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(context.attributes.workoutType.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.3)
                    .foregroundStyle(.cyan)
                    .lineLimit(1)
                Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                    .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
            }
            Spacer()
            // Compact sets + volume readout — what the stats strip used
            // to occupy a whole row for. Two stacked numbers, 60pt wide.
            VStack(alignment: .trailing, spacing: 1) {
                HStack(spacing: 4) {
                    Text("\(context.state.setsCompleted)")
                        .font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                    Text("sets")
                        .font(.system(size: 9, weight: .heavy)).tracking(1)
                        .foregroundStyle(.white.opacity(0.45))
                }
                HStack(spacing: 4) {
                    Text(volumeShort)
                        .font(.system(size: 13, weight: .semibold).monospacedDigit())
                        .foregroundStyle(.cyan)
                    Text("vol")
                        .font(.system(size: 9, weight: .heavy)).tracking(1)
                        .foregroundStyle(.white.opacity(0.45))
                }
            }
            if context.state.lastSetIsPR {
                Text("PR")
                    .font(.system(size: 10, weight: .heavy)).tracking(1)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(.yellow))
            }
        }
    }

    private func lastSetCard(name: String, summary: String) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 22))
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 2) {
                Text("LAST · \(name.uppercased())")
                    .font(.system(size: 9, weight: .heavy)).tracking(1)
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
                Text(summary)
                    .font(.system(size: 24, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
            }
            Spacer()
            if let oneRM = context.state.lastSetEstOneRM, oneRM > 0 {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("EST 1RM")
                        .font(.system(size: 9, weight: .heavy)).tracking(1)
                        .foregroundStyle(.white.opacity(0.55))
                    Text("\(Int(oneRM)) lb")
                        .font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.cyan)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 14)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func nextUpCard(name: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.forward.circle.fill")
                .font(.system(size: 24))
                .foregroundStyle(.cyan)
            VStack(alignment: .leading, spacing: 2) {
                Text("NEXT UP")
                    .font(.system(size: 9, weight: .heavy)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.55))
                Text(name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer()
            if let count = context.state.nextExerciseSetCount, count > 0 {
                Text("\(count)")
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
                + Text(" done")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 14)
        .background(.cyan.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func restBar(endsAt: Date) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "timer")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 0) {
                Text("REST")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(.white.opacity(0.55))
                // This is THE big number — what the user stares at
                // between sets. Made deliberately giant to read from
                // arm's length without unlocking the phone.
                Text(timerInterval: Date()...endsAt, countsDown: true)
                    .font(.system(size: 44, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.orange)
            }
            Spacer()
            Text("\(context.state.restTargetSeconds / 60):\(String(format: "%02d", context.state.restTargetSeconds % 60))")
                .font(.system(size: 13, weight: .semibold).monospacedDigit())
                .foregroundStyle(.orange.opacity(0.7))
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Derived

    private var volumeShort: String {
        let v = context.state.totalVolume
        if v >= 1000 { return String(format: "%.1fk", v / 1000) }
        return v > 0 ? String(format: "%.0f", v) : "—"
    }
}

// MARK: - Interactive buttons (with tap-feedback pulse)

/// Three-button row used on Lock Screen + Dynamic Island. Each button
/// watches `state.lastAction` + `state.lastActionAt`; if its op matches
/// AND the timestamp is within the pulse window, it flashes filled
/// tint + scales up briefly to confirm the tap. The pulse window is
/// short (700ms) and expires automatically via TimelineView ticks so
/// we don't need a follow-up state push to clear it.
@available(iOS 17.0, *)
struct PulseActionRow: View {
    let state: WorkoutContentState
    let restActive: Bool

    private let pulseWindow: TimeInterval = 0.7

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.15)) { ctx in
            HStack(spacing: 8) {
                pulseButton(
                    intent: CompleteCurrentSetIntent(),
                    op: WorkoutAction.completeSet,
                    icon: "checkmark.circle.fill",
                    text: "Set",
                    tint: .cyan,
                    now: ctx.date
                )
                pulseButton(
                    intent: AddRestIntent(),
                    op: WorkoutAction.addRest,
                    icon: "plus",
                    text: "30s",
                    tint: .orange,
                    now: ctx.date
                )
                pulseButton(
                    intent: SkipRestIntent(),
                    op: WorkoutAction.skipRest,
                    icon: "forward.fill",
                    text: "Skip rest",
                    tint: restActive ? .white : .white.opacity(0.4),
                    now: ctx.date,
                    disabled: !restActive
                )
            }
        }
    }

    @ViewBuilder
    private func pulseButton<I: AppIntent>(
        intent: I,
        op: String,
        icon: String,
        text: String,
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
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 15, weight: .semibold))
                Text(text).font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(isPulsing ? .black : tint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(
                Capsule().fill(isPulsing ? tint : Color.white.opacity(0.09))
            )
            .overlay(
                Capsule().stroke(isPulsing ? tint : Color.white.opacity(0.14), lineWidth: 0.5)
            )
            .scaleEffect(isPulsing ? 1.05 : 1)
            .shadow(color: isPulsing ? tint.opacity(0.6) : .clear, radius: isPulsing ? 10 : 0)
            .animation(.spring(response: 0.2, dampingFraction: 0.55), value: isPulsing)
        }
        .buttonStyle(.plain)
        .tint(tint)
        .disabled(disabled)
    }
}

// MARK: - Dynamic Island expanded regions

@available(iOS 16.2, *)
private struct ExpandedLeading: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "dumbbell.fill").foregroundStyle(.cyan)
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
        VStack(alignment: .trailing, spacing: 0) {
            Text("\(context.state.setsCompleted)")
                .font(.system(size: 18, weight: .bold).monospacedDigit())
            Text("\(context.state.completedExerciseCount)/\(context.state.exerciseCount) ex")
                .font(.system(size: 9, weight: .semibold)).tracking(1)
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
                if let restEnds = context.state.restEndsAt, restEnds > Date() {
                    HStack(spacing: 6) {
                        Image(systemName: "timer").foregroundStyle(.orange)
                        Text(timerInterval: Date()...restEnds, countsDown: true)
                            .font(.system(size: 16, weight: .semibold).monospacedDigit())
                            .foregroundStyle(.orange)
                    }
                } else if let next = context.state.nextExerciseName {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.forward").font(.system(size: 11))
                        Text(next).font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(.cyan)
                } else if let last = context.state.lastSetSummary, let name = context.state.lastExerciseName {
                    HStack(spacing: 6) {
                        Text(name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                        Text(last).font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let kcal = context.state.estimatedKcal, kcal > 0 {
                    Text("\(Int(kcal)) kcal")
                        .font(.system(size: 11).monospacedDigit())
                        .foregroundStyle(.pink)
                }
            }
            if #available(iOS 17.0, *) {
                PulseActionRow(
                    state: context.state,
                    restActive: (context.state.restEndsAt ?? .distantPast) > Date()
                )
            }
        }
    }
}
