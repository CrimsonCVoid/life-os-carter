import SwiftUI
import SwiftData

/// Gym home — split-based workflow. Top of the screen shows the
/// currently-selected split with each day as a "Start workout" card.
/// Below: PR highlights + recent sessions + CSV export.
struct GymView: View {
    @Environment(ActiveWorkoutStore.self) private var workoutStore
    @Environment(\.modelContext) private var modelContext
    @Query private var splits: [WorkoutSplit]
    @Query(sort: \LiftSessionEntry.startedAt, order: .reverse) private var sessions: [LiftSessionEntry]
    @Query(sort: \PersonalRecord.achievedAt, order: .reverse) private var allPRs: [PersonalRecord]

    @State private var splitPickerOpen = false
    @State private var editingTemplate: WorkoutTemplate?
    @State private var activeOpen = false
    @State private var csvShareURL: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    if workoutStore.isActive {
                        activeCard
                    }
                    splitSection
                    prSection
                    historySection
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Gym")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            splitPickerOpen = true
                        } label: { Label("Change split", systemImage: "arrow.triangle.2.circlepath") }
                        Button {
                            exportCSV()
                        } label: { Label("Export CSV", systemImage: "square.and.arrow.up") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                }
            }
            .sheet(isPresented: $splitPickerOpen) { SplitPickerView() }
            .sheet(item: $editingTemplate) { tpl in
                TemplateEditorView(template: tpl)
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

    // MARK: - Split section

    @ViewBuilder
    private var splitSection: some View {
        if let split = splits.first {
            VStack(spacing: 10) {
                HStack {
                    Image(systemName: split.splitKind.icon)
                        .foregroundStyle(LifeOSColor.accent)
                    Text(split.displayName.uppercased())
                        .font(.system(size: 11, weight: .semibold)).tracking(1.3)
                        .foregroundStyle(LifeOSColor.accent)
                    Spacer()
                    Button {
                        splitPickerOpen = true
                    } label: {
                        Text("Switch")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 4)

                ForEach(split.days.sorted(by: { $0.order < $1.order })) { day in
                    dayCard(day)
                }
            }
        } else {
            chooseSplitCTA
        }
    }

    private var chooseSplitCTA: some View {
        Button {
            splitPickerOpen = true
        } label: {
            Card {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.accentSoft)
                        Image(systemName: "sparkles")
                            .foregroundStyle(LifeOSColor.accent)
                    }
                    .frame(width: 44, height: 44)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Choose your split")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                        Text("Upper/Lower · PPL · Bro · Arnold · Full Body")
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func dayCard(_ day: WorkoutTemplate) -> some View {
        Card {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(day.name)
                        .font(.system(size: 17, weight: .bold))
                    Text(day.exerciseNames.prefix(3).joined(separator: " · ")
                         + (day.exerciseNames.count > 3 ? " · +\(day.exerciseNames.count - 3) more" : ""))
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                        .lineLimit(1)
                    HStack(spacing: 10) {
                        Label("\(day.exerciseNames.count) exercises", systemImage: "list.bullet")
                        Label("Rest \(day.defaultRestSeconds / 60)m", systemImage: "timer")
                    }
                    .font(.system(size: 10))
                    .foregroundStyle(LifeOSColor.fg2)
                }
                Spacer()
                VStack(spacing: 6) {
                    Button {
                        startFromTemplate(day)
                    } label: {
                        Text("Start")
                            .font(.system(size: 12, weight: .bold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(LifeOSColor.accentStrong)
                            )
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                    Button {
                        editingTemplate = day
                    } label: {
                        Text("Edit")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
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
        Card {
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

    private func startFromTemplate(_ template: WorkoutTemplate) {
        workoutStore.start(workoutType: template.name)
        workoutStore.setRestTarget(template.defaultRestSeconds)
        for name in template.exerciseNames {
            workoutStore.addExercise(named: name)
        }
        Haptics.success()
    }

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
