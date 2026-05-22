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
        // Live Activity height is system-capped (~220pt on iPhone Lock
        // Screen with interactive buttons). The previous v2 layout
        // stacked header + stats + progress + last-set + next/rest +
        // buttons — adding to ~290pt and getting clipped. Cut to the
        // three things that matter mid-workout: at-a-glance identity
        // (header), the dominant HERO element (rest timer or last set
        // or next exercise), and the action buttons. Stats fold into
        // the header. Progress bar removed — exercise count is in the
        // header chip.
        let isResting = (context.state.restEndsAt ?? .distantPast) > Date()
        VStack(alignment: .leading, spacing: 10) {
            topHeader
            heroSection(isResting: isResting)
            if #available(iOS 17.0, *) {
                ActionButtonRow(restActive: isResting)
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

// MARK: - Interactive buttons

@available(iOS 17.0, *)
private struct ActionButtonRow: View {
    let restActive: Bool
    var body: some View {
        HStack(spacing: 8) {
            Button(intent: CompleteCurrentSetIntent()) {
                ActionLabel(icon: "checkmark.circle.fill", text: "Set", tint: .cyan)
            }.buttonStyle(.plain).tint(.cyan)

            Button(intent: AddRestIntent()) {
                ActionLabel(icon: "plus", text: "30s", tint: .orange)
            }.buttonStyle(.plain).tint(.orange)

            Button(intent: SkipRestIntent()) {
                ActionLabel(icon: "forward.fill", text: "Skip rest",
                            tint: restActive ? .white : .white.opacity(0.4))
            }.buttonStyle(.plain).disabled(!restActive)
        }
    }
}

@available(iOS 17.0, *)
private struct ActionLabel: View {
    let icon: String; let text: String; let tint: Color
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold))
            Text(text).font(.system(size: 14, weight: .semibold))
        }
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 13)
        .background(Capsule().fill(.white.opacity(0.09)))
        .overlay(Capsule().stroke(.white.opacity(0.14), lineWidth: 0.5))
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
                ActionButtonRow(restActive: (context.state.restEndsAt ?? .distantPast) > Date())
            }
        }
    }
}
