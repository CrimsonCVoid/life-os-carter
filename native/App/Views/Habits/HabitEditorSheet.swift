import SwiftUI
import SwiftData

/// Modal sheet for creating a new habit or editing an existing one.
/// Single sheet for both flows — pass `editing:` to drop into edit
/// mode, otherwise it's create. On save, writes back to SwiftData and
/// triggers a SyncService drain.
struct HabitEditorSheet: View {
    let editing: HabitEntry?
    var onDelete: (() -> Void)? = nil

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var icon: String = "sparkles"
    @State private var color: HabitColor = .accent
    @State private var category: HabitCategory = .general
    @State private var cadence: HabitCadence = .daily
    @State private var dailyTarget: Int = 1
    @State private var notes: String = ""
    @State private var showIconGrid = false

    @FocusState private var nameFocused: Bool

    init(editing: HabitEntry? = nil, onDelete: (() -> Void)? = nil) {
        self.editing = editing
        self.onDelete = onDelete
    }

    private var isEdit: Bool { editing != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    nameField
                    iconAndColorRow
                    section("Cadence") {
                        HabitCadencePicker(cadence: $cadence)
                    }
                    section("Daily target") {
                        HabitTargetStepper(target: $dailyTarget)
                    }
                    section("Category") {
                        categoryRow
                    }
                    section("Notes (optional)") {
                        notesField
                    }
                    if isEdit, let onDelete {
                        deleteButton(onDelete)
                    }
                    Spacer(minLength: 32)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle(isEdit ? "Edit habit" : "New habit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isEdit ? "Save" : "Create") {
                        save()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(canSave ? LifeOSColor.accent : LifeOSColor.fg3)
                    .disabled(!canSave)
                }
            }
            .sheet(isPresented: $showIconGrid) {
                NavigationStack {
                    ScrollView {
                        HabitIconPicker(selection: $icon, tint: color.color)
                            .padding(16)
                    }
                    .background(LifeOSColor.base.ignoresSafeArea())
                    .navigationTitle("Pick an icon")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") {
                                showIconGrid = false
                                Haptics.tick()
                            }
                            .foregroundStyle(LifeOSColor.accent)
                        }
                    }
                }
                .presentationDetents([.large])
            }
        }
        .onAppear(perform: loadIfEditing)
    }

    // MARK: - Top section

    private var nameField: some View {
        Card {
            HStack(spacing: 12) {
                Button {
                    showIconGrid = true
                    Haptics.tap()
                } label: {
                    ZStack {
                        Circle().fill(color.color.opacity(0.18))
                        Image(systemName: icon)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(color.color)
                    }
                    .frame(width: 56, height: 56)
                    .overlay(
                        Circle().strokeBorder(color.color.opacity(0.4), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                TextField("Habit name", text: $name)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .focused($nameFocused)
                    .submitLabel(.done)
            }
        }
    }

    private var iconAndColorRow: some View {
        HStack(spacing: 12) {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("COLOR")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(LifeOSColor.fg3)
                    HabitColorPicker(selection: $color)
                }
            }
        }
    }

    private var categoryRow: some View {
        HStack(spacing: 8) {
            ForEach(HabitCategory.allCases) { c in
                Button {
                    category = c
                    Haptics.tick()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: c.icon).font(.system(size: 10, weight: .semibold))
                        Text(c.label).font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(category == c ? .white : LifeOSColor.fg2)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(
                        Capsule().fill(category == c ? LifeOSColor.accent : LifeOSColor.elevated)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var notesField: some View {
        TextField("Why this matters, or how to do it well…", text: $notes, axis: .vertical)
            .font(.system(size: 13))
            .foregroundStyle(.white)
            .lineLimit(1...4)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(LifeOSColor.elevated)
            )
    }

    private func deleteButton(_ onDelete: @escaping () -> Void) -> some View {
        Button {
            Haptics.warning()
            dismiss()
            // Defer the actual delete until after dismiss commits to
            // avoid SwiftUI's "view referencing a deleted model" warning.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                onDelete()
            }
        } label: {
            HStack {
                Image(systemName: "trash.fill")
                Text("Delete habit")
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(LifeOSColor.danger)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LifeOSColor.danger.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(LifeOSColor.danger.opacity(0.35), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private func section<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
                .padding(.horizontal, 4)
            Card { content() }
        }
    }

    // MARK: - Load + save

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func loadIfEditing() {
        if let h = editing {
            name = h.name
            icon = h.icon
            color = HabitColor.from(h.colorToken)
            category = h.categoryEnum
            cadence = h.cadence
            dailyTarget = max(1, h.dailyTarget)
            notes = h.notes
        } else {
            // Default to nameFocused on create so the user can type
            // immediately without an extra tap.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                nameFocused = true
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let h = editing {
            h.name = trimmed
            h.icon = icon
            h.colorToken = color.rawValue
            h.category = category.rawValue
            h.cadenceRaw = cadence.serialized
            // If a count habit's target changes, re-evaluate today's
            // completion against the new threshold so the UI doesn't
            // show a checkmark for a stale 5/8 once target drops to 5.
            let oldTarget = h.dailyTarget
            h.dailyTarget = max(1, dailyTarget)
            h.notes = notes
            h.needsSync = true
            if oldTarget != h.dailyTarget {
                let today = HabitDateFmt.ymd(Date())
                let c = h.count(on: today)
                h.setCount(c, on: today)
            }
        } else {
            let next = HabitEntry(
                name: trimmed,
                icon: icon,
                order: nextOrder(),
                colorToken: color.rawValue,
                cadenceRaw: cadence.serialized,
                dailyTarget: max(1, dailyTarget),
                category: category.rawValue,
                notes: notes
            )
            modelContext.insert(next)
        }
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
    }

    private func nextOrder() -> Int {
        let descriptor = FetchDescriptor<HabitEntry>(
            sortBy: [SortDescriptor(\.order, order: .reverse)]
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        return (existing.first?.order ?? -1) + 1
    }
}
