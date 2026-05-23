import SwiftUI
import SwiftData

/// Convert a one-off MealLog row into a reusable SavedMeal favorite.
/// The user can tweak the name + pick an icon before saving — the
/// macros come over verbatim. The original MealLog stays as a today's-
/// meals entry; this just creates a parallel favorite row that future
/// one-tap-logging reads from.
struct SaveAsFavoriteSheet: View {
    let meal: MealLog
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var icon: String = "fork.knife"

    private let iconChoices = [
        "fork.knife", "carrot.fill", "leaf.fill", "cup.and.saucer.fill",
        "wineglass", "applelogo", "flame.fill", "drop.fill",
        "birthday.cake.fill", "takeoutbag.and.cup.and.straw.fill",
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Card {
                        VStack(spacing: 14) {
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle().fill(LifeOSColor.accent.opacity(0.16))
                                    Image(systemName: icon)
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundStyle(LifeOSColor.accent)
                                }
                                .frame(width: 48, height: 48)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Save as favorite")
                                        .font(.system(size: 15, weight: .bold))
                                    Text("\(Int(meal.calories)) kcal · \(Int(meal.proteinG))p / \(Int(meal.carbsG))c / \(Int(meal.fatG))f")
                                        .font(.system(size: 11))
                                        .foregroundStyle(LifeOSColor.fg3)
                                }
                                Spacer()
                            }
                            TextField("Name", text: $name)
                                .font(.system(size: 14, weight: .semibold))
                                .padding(.horizontal, 12).padding(.vertical, 10)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(LifeOSColor.elevated)
                                )
                        }
                    }
                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("ICON")
                                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                                .foregroundStyle(LifeOSColor.fg3)
                            LazyVGrid(
                                columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5),
                                spacing: 10
                            ) {
                                ForEach(iconChoices, id: \.self) { i in
                                    Button {
                                        icon = i
                                        Haptics.tick()
                                    } label: {
                                        Image(systemName: i)
                                            .font(.system(size: 18))
                                            .foregroundStyle(icon == i ? .white : LifeOSColor.fg2)
                                            .frame(width: 46, height: 46)
                                            .background(
                                                Circle().fill(icon == i ? LifeOSColor.accent : LifeOSColor.elevated)
                                            )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    Spacer(minLength: 30)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Favorite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                        .foregroundStyle(canSave ? LifeOSColor.accent : LifeOSColor.fg3)
                        .disabled(!canSave)
                }
            }
            .onAppear {
                if name.isEmpty { name = meal.name }
            }
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let saved = SavedMeal(
            name: trimmed.isEmpty ? meal.name : trimmed,
            icon: icon,
            calories: meal.calories,
            proteinG: meal.proteinG,
            carbsG: meal.carbsG,
            fatG: meal.fatG
        )
        modelContext.insert(saved)
        try? modelContext.save()
        Haptics.success()
        dismiss()
    }
}
