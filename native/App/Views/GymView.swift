import SwiftUI
import SwiftData

struct GymView: View {
    @Environment(ActiveWorkoutStore.self) private var workoutStore
    @Query(sort: \LiftSessionEntry.startedAt, order: .reverse) private var sessions: [LiftSessionEntry]
    @State private var activeOpen = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    activeOrStartCard
                    SectionLabel("Recent")
                    if sessions.isEmpty {
                        emptyHistory
                    } else {
                        ForEach(sessions.prefix(10)) { s in
                            sessionRow(s)
                        }
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Gym")
            .fullScreenCover(isPresented: $activeOpen) {
                ActiveWorkoutView(store: workoutStore)
            }
            .onChange(of: workoutStore.isActive) { _, isActive in
                if isActive {
                    activeOpen = true
                }
            }
        }
    }

    @ViewBuilder
    private var activeOrStartCard: some View {
        if workoutStore.isActive {
            activeCard
        } else {
            startCard
        }
    }

    private var startCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("READY")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(LifeOSColor.accent)
                Text("Start a workout")
                    .font(.system(size: 22, weight: .bold))
                Text("Live Activity appears in the Dynamic Island + Lock Screen the moment you start.")
                    .font(.system(size: 13))
                    .foregroundStyle(LifeOSColor.fg2)

                HStack(spacing: 8) {
                    ForEach(["Push", "Pull", "Legs", "Upper"], id: \.self) { type in
                        Button {
                            workoutStore.start(workoutType: type)
                        } label: {
                            Text(type)
                                .font(.system(size: 12, weight: .semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(LifeOSColor.accentSoft))
                                .foregroundStyle(LifeOSColor.accent)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button {
                    workoutStore.start(workoutType: "Workout")
                } label: {
                    HStack {
                        Image(systemName: "play.fill")
                        Text("Start workout").fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(LifeOSColor.accentStrong)
                    )
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var activeCard: some View {
        Card {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let elapsed = Date().timeIntervalSince(workoutStore.startedAt ?? .now)
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "dumbbell.fill").foregroundStyle(LifeOSColor.Metric.peak)
                        Text("ACTIVE").font(.system(size: 10, weight: .bold)).tracking(1.4)
                            .foregroundStyle(LifeOSColor.Metric.peak)
                        Spacer()
                        Text(format(elapsed))
                            .font(.system(size: 18, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                    }
                    HStack(spacing: 12) {
                        statTile("Sets", "\(workoutStore.completedSetCount)")
                        statTile("Volume", "\(Int(workoutStore.totalVolume)) lb")
                    }
                    Button {
                        activeOpen = true
                    } label: {
                        HStack {
                            Image(systemName: "arrow.up.right.square.fill")
                            Text("Continue workout").fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(LifeOSColor.accentStrong)
                        )
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func statTile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(1.1)
                .foregroundStyle(LifeOSColor.fg3)
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(LifeOSColor.elevated)
        )
    }

    private var emptyHistory: some View {
        Card {
            Text("No sessions yet — finish one and it shows up here.")
                .font(.system(size: 13))
                .foregroundStyle(LifeOSColor.fg2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
    }

    private func sessionRow(_ s: LiftSessionEntry) -> some View {
        Card {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.workoutType).font(.system(size: 15, weight: .semibold))
                    Text("\(s.setCount) sets · \(Int(s.totalVolumeLb)) lb volume")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                Text(s.startedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private func format(_ seconds: TimeInterval) -> String {
        let h = Int(seconds) / 3600
        let m = (Int(seconds) % 3600) / 60
        let s = Int(seconds) % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }
}
