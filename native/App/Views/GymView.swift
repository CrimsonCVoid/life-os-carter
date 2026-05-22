import SwiftUI
import SwiftData

/// Gym home. Single Start CTA when there's no in-flight workout; Resume
/// banner when there is. Below: PRs + recent sessions + CSV export.
/// The session itself is freeform — pick exercises by muscle once you
/// land on the active screen, no split or template required.
struct GymView: View {
    @Environment(ActiveWorkoutStore.self) private var workoutStore
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \LiftSessionEntry.startedAt, order: .reverse) private var sessions: [LiftSessionEntry]
    @Query(sort: \PersonalRecord.achievedAt, order: .reverse) private var allPRs: [PersonalRecord]

    @State private var activeOpen = false
    @State private var csvShareURL: URL?
    @State private var revealed = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    if workoutStore.isActive {
                        activeCard.cascadeReveal(index: 0, visible: revealed)
                    } else {
                        startCard.cascadeReveal(index: 0, visible: revealed)
                    }
                    prSection.cascadeReveal(index: 1, visible: revealed)
                    historySection.cascadeReveal(index: 2, visible: revealed)
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .onAppear { if !revealed { revealed = true } }
            .navigationTitle("Gym")
            .toolbar {
                if !sessions.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            exportCSV()
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(LifeOSColor.fg2)
                        }
                    }
                }
            }
            .sheet(item: $csvShareURL.mapped()) { wrapper in
                ShareSheet(items: [wrapper.url])
                    .presentationDetents([.medium])
            }
            .fullScreenCover(isPresented: $activeOpen) {
                ActiveWorkoutView(store: workoutStore)
            }
            .onChange(of: workoutStore.isActive) { _, isActive in
                if isActive { activeOpen = true }
            }
        }
    }

    // MARK: - Start CTA

    /// Hero "Start workout" card — large, prominent, the only thing the
    /// user has to look at on a fresh gym tab. Lands them on the active
    /// workout view with zero preloaded exercises; they pick by muscle
    /// once inside.
    private var startCard: some View {
        Button {
            startBlankWorkout()
        } label: {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    ZStack {
                        Circle().fill(LifeOSColor.accentSoft)
                        Image(systemName: "dumbbell.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(LifeOSColor.accent)
                    }
                    .frame(width: 56, height: 56)
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(Color.white.opacity(0.18)))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Start workout")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Pick exercises by muscle group as you go.")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(
                        colors: [LifeOSColor.accent, LifeOSColor.accentStrong],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 0.5)
            )
            .shadow(color: LifeOSColor.accent.opacity(0.4), radius: 18, x: 0, y: 8)
        }
        .buttonStyle(.plain)
        .pressable()
    }

    private func startBlankWorkout() {
        workoutStore.start(workoutType: "Workout")
        Haptics.success()
    }

    // MARK: - Active card (when workout is mid-flight)

    private var activeCard: some View {
        Card {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let elapsed = Date().timeIntervalSince(workoutStore.startedAt ?? .now)
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.Metric.peak.opacity(0.18))
                        Image(systemName: "dumbbell.fill").foregroundStyle(LifeOSColor.Metric.peak)
                    }
                    .frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(workoutStore.workoutType ?? "Workout")
                            .font(.system(size: 15, weight: .semibold))
                        Text("\(workoutStore.completedSetCount) sets · \(format(elapsed))")
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    Button {
                        activeOpen = true
                    } label: {
                        Text("Resume").fontWeight(.semibold)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(LifeOSColor.accentStrong))
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - PR section

    @ViewBuilder
    private var prSection: some View {
        let exerciseBests = topExerciseBests()
        if !exerciseBests.isEmpty {
            VStack(spacing: 10) {
                SectionLabel("Personal records")
                ForEach(exerciseBests.prefix(5), id: \.exerciseDisplayName) { pr in
                    NavigationLink {
                        ExerciseHistoryView(exerciseName: pr.exerciseDisplayName)
                    } label: {
                        prRow(pr)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func prRow(_ pr: PersonalRecord) -> some View {
        Card(tint: LifeOSColor.Metric.peak) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pr.exerciseDisplayName)
                        .font(.system(size: 14, weight: .semibold))
                    Text(pr.prKind.label)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatNumber(pr.value))
                        .font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(LifeOSColor.Metric.peak)
                    Text(pr.achievedAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.system(size: 10))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private func topExerciseBests() -> [PersonalRecord] {
        // Best estimated 1RM per exercise, top 5.
        let oneRMs = allPRs.filter { $0.kind == PRKind.oneRepMax.rawValue }
        var byExercise: [String: PersonalRecord] = [:]
        for pr in oneRMs {
            if let existing = byExercise[pr.exerciseKey], existing.value >= pr.value { continue }
            byExercise[pr.exerciseKey] = pr
        }
        return byExercise.values.sorted { $0.value > $1.value }
    }

    // MARK: - History section

    @ViewBuilder
    private var historySection: some View {
        if !sessions.isEmpty {
            VStack(spacing: 10) {
                SectionLabel("Recent sessions")
                ForEach(sessions.prefix(8)) { s in
                    sessionRow(s)
                }
            }
        }
    }

    private func sessionRow(_ s: LiftSessionEntry) -> some View {
        Card {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.workoutType).font(.system(size: 14, weight: .semibold))
                    Text("\(s.setCount) sets · \(Int(s.totalVolumeLb)) lb volume")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                Text(s.startedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    // MARK: - Actions

    private func exportCSV() {
        let decoded = sessions.map { ($0, CSVExporter.decodeExercises($0.detailsJSON)) }
        if let url = CSVExporter.write(sessions: sessions, decoded: decoded) {
            csvShareURL = url
        }
    }

    // MARK: - Helpers

    private func format(_ seconds: TimeInterval) -> String {
        let h = Int(seconds) / 3600
        let m = (Int(seconds) % 3600) / 60
        let s = Int(seconds) % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }

    private func formatNumber(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", v)
            : String(format: "%.1f", v)
    }
}

/// Standard share sheet wrapper.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// URL → identifiable wrapper for `.sheet(item:)`.
private struct URLWrapper: Identifiable {
    let url: URL
    var id: URL { url }
}

private extension Binding where Value == URL? {
    func mapped() -> Binding<URLWrapper?> {
        Binding<URLWrapper?>(
            get: { wrappedValue.map { URLWrapper(url: $0) } },
            set: { wrappedValue = $0?.url }
        )
    }
}
