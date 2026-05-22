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
        VStack(alignment: .leading, spacing: 14) {
            topHeader
            statsStrip
            progressBar
            lastSetCard
            if let restEnds = context.state.restEndsAt, restEnds > Date() {
                restBar(endsAt: restEnds)
            } else {
                nextUpCard
            }
            if #available(iOS 17.0, *) {
                ActionButtonRow(restActive: (context.state.restEndsAt ?? .distantPast) > Date())
            }
        }
        .padding(16)
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
                    .tracking(1.4)
                    .foregroundStyle(.cyan)
                Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                    .font(.system(size: 18, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
            }
            Spacer()
            if context.state.lastSetIsPR {
                Text("PR 🔥")
                    .font(.system(size: 11, weight: .heavy)).tracking(1)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(.yellow))
            }
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 8) {
            statTile(label: "SETS", value: "\(context.state.setsCompleted)", tint: .white)
            statTile(label: "VOLUME", value: volumeShort, tint: .cyan)
            if let kcal = context.state.estimatedKcal, kcal > 0 {
                statTile(label: "KCAL", value: "\(Int(kcal))", tint: .pink)
            }
        }
    }

    private func statTile(label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(1.2)
                .foregroundStyle(.white.opacity(0.55))
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var progressBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("\(context.state.completedExerciseCount) / \(context.state.exerciseCount) exercises")
                    .font(.system(size: 10, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                Text(progressPercent)
                    .font(.system(size: 10, weight: .bold).monospacedDigit())
                    .foregroundStyle(.cyan)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(.white.opacity(0.08))
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(LinearGradient(colors: [.cyan, .mint], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * progress)
                }
            }
            .frame(height: 5)
        }
    }

    private var lastSetCard: some View {
        Group {
            if let name = context.state.lastExerciseName, let summary = context.state.lastSetSummary {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Last set · \(name)")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.6))
                        Text(summary)
                            .font(.system(size: 14, weight: .semibold).monospacedDigit())
                            .foregroundStyle(.white)
                    }
                    Spacer()
                    if let oneRM = context.state.lastSetEstOneRM, oneRM > 0 {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("EST 1RM")
                                .font(.system(size: 8, weight: .heavy)).tracking(1)
                                .foregroundStyle(.white.opacity(0.55))
                            Text("\(Int(oneRM)) lb")
                                .font(.system(size: 14, weight: .bold).monospacedDigit())
                                .foregroundStyle(.cyan)
                        }
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }

    private var nextUpCard: some View {
        Group {
            if let next = context.state.nextExerciseName {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.forward.circle.fill")
                        .foregroundStyle(.cyan)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("NEXT UP")
                            .font(.system(size: 8, weight: .heavy)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.55))
                        Text(next)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    Spacer()
                    if let count = context.state.nextExerciseSetCount, count > 0 {
                        Text("\(count) sets done")
                            .font(.system(size: 11).monospacedDigit())
                            .foregroundStyle(.white.opacity(0.6))
                    } else {
                        Text("0 sets done")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(.cyan.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }

    private func restBar(endsAt: Date) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "timer")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 1) {
                Text("REST")
                    .font(.system(size: 8, weight: .heavy)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.55))
                Text(timerInterval: Date()...endsAt, countsDown: true)
                    .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.orange)
            }
            Spacer()
            Text("Target \(context.state.restTargetSeconds / 60):\(String(format: "%02d", context.state.restTargetSeconds % 60))")
                .font(.system(size: 11).monospacedDigit())
                .foregroundStyle(.orange.opacity(0.7))
        }
        .padding(.horizontal, 10).padding(.vertical, 10)
        .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Derived

    private var progress: Double {
        guard context.state.exerciseCount > 0 else { return 0 }
        return Double(context.state.completedExerciseCount) / Double(context.state.exerciseCount)
    }

    private var progressPercent: String {
        let p = Int(progress * 100)
        return "\(p)%"
    }

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
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12, weight: .semibold))
            Text(text).font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
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
