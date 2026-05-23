import SwiftUI
import SwiftData

/// Horizontal row of saved-meal chips that one-tap-log a previously
/// saved meal. Sorted most-used first. Long-press any chip to delete
/// the saved meal (the underlying MealLogs stay).
struct SavedMealsBar: View {
    @Query(sort: \SavedMeal.usageCount, order: .reverse) private var meals: [SavedMeal]
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        if meals.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("FAVORITES")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    Text("Tap to log")
                        .font(.system(size: 10))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(meals.prefix(12)) { saved in
                            chip(saved)
                        }
                    }
                    .padding(.horizontal, 2)
                }
            }
        }
    }

    private func chip(_ saved: SavedMeal) -> some View {
        Button {
            log(saved)
        } label: {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(LifeOSColor.accent.opacity(0.18))
                    Image(systemName: saved.icon)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LifeOSColor.accent)
                }
                .frame(width: 26, height: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text(saved.name)
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                    Text("\(Int(saved.calories)) kcal · \(Int(saved.proteinG))p")
                        .font(.system(size: 9))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(
                Capsule().fill(LifeOSColor.elevated)
            )
            .overlay(
                Capsule().strokeBorder(LifeOSColor.accent.opacity(0.25), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) {
                modelContext.delete(saved)
                try? modelContext.save()
                Haptics.warning()
            } label: {
                Label("Remove favorite", systemImage: "trash")
            }
        }
    }

    private func log(_ saved: SavedMeal) {
        let today = ISO8601DateFormatter.dateOnly.string(from: Date())
        let log = MealLog(
            date: today,
            name: saved.name,
            calories: saved.calories,
            proteinG: saved.proteinG,
            carbsG: saved.carbsG,
            fatG: saved.fatG,
            source: "favorite"
        )
        modelContext.insert(log)
        saved.usageCount += 1
        saved.lastUsedAt = Date()
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
    }
}

// MARK: - Quick-add calories sheet

/// Bare-bones "I had something, just add 400 cal" sheet. Optional
/// protein/carbs/fat fields, optional name. Closes immediately on
/// save. Mirrors MyFitnessPal's quick-add, which is the most-used
/// flow for users who don't care about tracking specific foods.
struct QuickAddCaloriesSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var calories: String = ""
    @State private var protein: String = ""
    @State private var carbs: String = ""
    @State private var fat: String = ""
    @State private var name: String = ""
    @FocusState private var firstFieldFocused: Bool

    private var caloriesValue: Double? {
        guard let n = Double(calories), n > 0 else { return nil }
        return n
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Card {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle().fill(LifeOSColor.Metric.calories.opacity(0.18))
                                    Image(systemName: "bolt.fill")
                                        .font(.system(size: 17, weight: .semibold))
                                        .foregroundStyle(LifeOSColor.Metric.calories)
                                }
                                .frame(width: 44, height: 44)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Quick add")
                                        .font(.system(size: 17, weight: .bold))
                                    Text("Skip the food details. Just log the macros.")
                                        .font(.system(size: 11))
                                        .foregroundStyle(LifeOSColor.fg3)
                                }
                            }
                            TextField("Calories", text: $calories)
                                .keyboardType(.numberPad)
                                .font(.system(size: 28, weight: .bold).monospacedDigit())
                                .foregroundStyle(LifeOSColor.Metric.calories)
                                .padding(.vertical, 14)
                                .padding(.horizontal, 16)
                                .frame(maxWidth: .infinity)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(LifeOSColor.elevated)
                                )
                                .focused($firstFieldFocused)
                        }
                    }
                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("MACROS (OPTIONAL)")
                                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                                .foregroundStyle(LifeOSColor.fg3)
                            macroField("Protein (g)", text: $protein, tint: LifeOSColor.Metric.protein)
                            macroField("Carbs (g)", text: $carbs, tint: LifeOSColor.Metric.carbs)
                            macroField("Fat (g)", text: $fat, tint: LifeOSColor.Metric.fat)
                        }
                    }
                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("LABEL (OPTIONAL)")
                                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                                .foregroundStyle(LifeOSColor.fg3)
                            TextField("e.g. \"Dinner out\"", text: $name)
                                .font(.system(size: 14))
                                .padding(.horizontal, 12).padding(.vertical, 10)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(LifeOSColor.elevated)
                                )
                        }
                    }
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Quick add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Log") {
                        log()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(caloriesValue != nil ? LifeOSColor.accent : LifeOSColor.fg3)
                    .disabled(caloriesValue == nil)
                }
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    firstFieldFocused = true
                }
            }
        }
    }

    private func macroField(_ label: String, text: Binding<String>, tint: Color) -> some View {
        HStack {
            Circle().fill(tint).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .font(.system(size: 14, weight: .semibold).monospacedDigit())
                .frame(width: 60)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(LifeOSColor.elevated)
                )
        }
    }

    private func log() {
        guard let kcal = caloriesValue else { return }
        let labelTrim = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = labelTrim.isEmpty ? "Quick add" : labelTrim
        let today = ISO8601DateFormatter.dateOnly.string(from: Date())
        let entry = MealLog(
            date: today,
            name: displayName,
            calories: kcal,
            proteinG: Double(protein) ?? 0,
            carbsG: Double(carbs) ?? 0,
            fatG: Double(fat) ?? 0,
            source: "quickadd"
        )
        modelContext.insert(entry)
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
    }
}
