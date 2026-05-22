import SwiftUI
import SwiftData

/// Add-meal sheet — manual entry now, with barcode + photo placeholders
/// for the upcoming VisionKit / Gemini integration.
struct AddMealSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Quick capture") {
                    captureButton(icon: "barcode.viewfinder", title: "Scan barcode", subtitle: "VisionKit · OpenFoodFacts")
                    captureButton(icon: "camera.fill", title: "Photo scan", subtitle: "Gemini macro estimate")
                    captureButton(icon: "mic.fill", title: "Voice log", subtitle: "Speech → meal entry")
                }
                .listRowBackground(LifeOSColor.card)

                Section("Manual entry") {
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
            }
            .scrollContentBackground(.hidden)
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Add meal")
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
        Double(calories) ?? 0 > 0
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
        let date = ISO8601DateFormatter.dateOnly.string(from: Date())
        let meal = MealLog(
            date: date,
            name: name.trimmingCharacters(in: .whitespaces),
            calories: Double(calories) ?? 0,
            proteinG: Double(protein) ?? 0,
            carbsG: Double(carbs) ?? 0,
            fatG: Double(fat) ?? 0
        )
        modelContext.insert(meal)
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
    }
}
