import SwiftUI
import SwiftData

/// Manual-entry meal sheet. Used both for new meals (init with nil) and
/// editing an existing meal (init with the MealLog). The "Quick capture"
/// section is hidden in edit mode since you can't re-scan into an
/// existing row.
struct AddMealSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let editing: MealLog?

    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    init(editing: MealLog? = nil) {
        self.editing = editing
        if let editing {
            _name     = State(initialValue: editing.name)
            _calories = State(initialValue: String(Int(editing.calories.rounded())))
            _protein  = State(initialValue: String(Int(editing.proteinG.rounded())))
            _carbs    = State(initialValue: String(Int(editing.carbsG.rounded())))
            _fat      = State(initialValue: String(Int(editing.fatG.rounded())))
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                if editing == nil {
                    Section("Quick capture") {
                        captureButton(icon: "barcode.viewfinder", title: "Scan barcode", subtitle: "VisionKit · OpenFoodFacts")
                        captureButton(icon: "camera.fill", title: "Photo scan", subtitle: "Gemini macro estimate")
                        captureButton(icon: "mic.fill", title: "Voice log", subtitle: "Speech → meal entry")
                    }
                    .listRowBackground(LifeOSColor.card)
                }

                Section(editing == nil ? "Manual entry" : "Edit meal") {
                    TextField("Meal name", text: $name)
                    HStack {
                        Text("Calories").foregroundStyle(LifeOSColor.fg2)
                        Spacer()
                        TextField("0", text: $calories)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                    }
                    HStack {
                        Text("Protein (g)").foregroundStyle(LifeOSColor.fg2)
                        Spacer()
                        TextField("0", text: $protein)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                    }
                    HStack {
                        Text("Carbs (g)").foregroundStyle(LifeOSColor.fg2)
                        Spacer()
                        TextField("0", text: $carbs)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                    }
                    HStack {
                        Text("Fat (g)").foregroundStyle(LifeOSColor.fg2)
                        Spacer()
                        TextField("0", text: $fat)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                    }
                }
                .listRowBackground(LifeOSColor.card)

                if editing != nil {
                    Section {
                        Button(role: .destructive) {
                            deleteMeal()
                        } label: {
                            HStack {
                                Spacer()
                                Label("Delete meal", systemImage: "trash")
                                    .foregroundStyle(LifeOSColor.danger)
                                Spacer()
                            }
                        }
                    }
                    .listRowBackground(LifeOSColor.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle(editing == nil ? "Add meal" : "Edit meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .foregroundStyle(canSave ? LifeOSColor.accent : LifeOSColor.fg3)
                        .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        (Double(calories) ?? 0) > 0
    }

    private func captureButton(icon: String, title: String, subtitle: String) -> some View {
        Button {
            Haptics.tap()
            // TODO: each launches its own flow once wired (next session)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .frame(width: 32, height: 32)
                    .foregroundStyle(LifeOSColor.accent)
                    .background(Circle().fill(LifeOSColor.accentSoft))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 14, weight: .medium)).foregroundStyle(.white)
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .buttonStyle(.plain)
    }

    private func save() {
        guard canSave else { return }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let kcal = Double(calories) ?? 0
        let p = Double(protein) ?? 0
        let c = Double(carbs) ?? 0
        let f = Double(fat) ?? 0

        if let editing {
            editing.name      = trimmed
            editing.calories  = kcal
            editing.proteinG  = p
            editing.carbsG    = c
            editing.fatG      = f
            editing.needsSync = true
        } else {
            let date = ISO8601DateFormatter.dateOnly.string(from: Date())
            let meal = MealLog(
                date: date,
                name: trimmed,
                calories: kcal,
                proteinG: p,
                carbsG: c,
                fatG: f
            )
            modelContext.insert(meal)
        }

        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
    }

    private func deleteMeal() {
        guard let editing else { return }
        modelContext.delete(editing)
        try? modelContext.save()
        Haptics.warning()
        dismiss()
    }
}
