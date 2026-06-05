import SwiftUI
import SwiftData

/// Saved recipes browser. New/edit a recipe via RecipeBuilderSheet; tap a
/// recipe to log it (choose servings) as a MealLog scaled from the per-serving
/// macros. Presented as a sheet from the Nutrition "+" menu.
struct RecipesView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Recipe.createdAt, order: .reverse) private var recipes: [Recipe]

    @State private var showBuilder = false
    @State private var editing: Recipe?
    @State private var logging: Recipe?

    var body: some View {
        NavigationStack {
            Group {
                if recipes.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(recipes) { recipe in recipeCard(recipe) }
                            Spacer(minLength: 40)
                        }
                        .padding(.horizontal, 14).padding(.top, 8)
                    }
                }
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Recipes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Haptics.tap(); showBuilder = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showBuilder) { RecipeBuilderSheet() }
            .sheet(item: $editing) { RecipeBuilderSheet(editing: $0) }
            .sheet(item: $logging) { LogRecipeSheet(recipe: $0) { dismiss() } }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "list.bullet.rectangle.portrait").font(.system(size: 34))
                .foregroundStyle(LifeOSColor.accent.opacity(0.7))
            Text("No recipes yet").font(.system(size: 17, weight: .bold)).foregroundStyle(LifeOSColor.fg)
            Text("Build a recipe from your go-to ingredients, then log a serving in one tap — macros scale automatically.")
                .font(.system(size: 13)).foregroundStyle(LifeOSColor.fg2)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button { Haptics.tap(); showBuilder = true } label: {
                Text("New recipe").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 20).frame(height: 44)
                    .background(Capsule().fill(LifeOSColor.accent))
            }.buttonStyle(.plain).padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func recipeCard(_ recipe: Recipe) -> some View {
        let ps = recipe.perServing
        return Button { Haptics.tap(); logging = recipe } label: {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(recipe.name).font(.system(size: 15, weight: .bold)).foregroundStyle(LifeOSColor.fg)
                            Text("\(recipe.ingredients.count) ingredient\(recipe.ingredients.count == 1 ? "" : "s") · \(recipe.servings) serving\(recipe.servings == 1 ? "" : "s")")
                                .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                        }
                        Spacer()
                        Menu {
                            Button { editing = recipe } label: { Label("Edit", systemImage: "square.and.pencil") }
                            Button(role: .destructive) { delete(recipe) } label: { Label("Delete", systemImage: "trash") }
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 15, weight: .bold))
                                .foregroundStyle(LifeOSColor.fg3).frame(width: 32, height: 32)
                        }
                    }
                    HStack(spacing: 0) {
                        macroStat("CAL", "\(Int(ps.calories.rounded()))", LifeOSColor.Metric.calories)
                        macroStat("P", "\(Int(ps.proteinG.rounded()))g", LifeOSColor.Metric.protein)
                        macroStat("C", "\(Int(ps.carbsG.rounded()))g", LifeOSColor.Metric.carbs)
                        macroStat("F", "\(Int(ps.fatG.rounded()))g", LifeOSColor.Metric.fat)
                    }
                    Text("per serving · tap to log").font(.system(size: 10)).foregroundStyle(LifeOSColor.fg3)
                }
            }
        }.buttonStyle(.plain)
    }

    private func macroStat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 16, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(tint)
            Text(label).font(.system(size: 8, weight: .heavy)).tracking(0.6).foregroundStyle(LifeOSColor.fg3)
        }.frame(maxWidth: .infinity)
    }

    private func delete(_ recipe: Recipe) {
        Haptics.warning()
        ctx.delete(recipe)
        try? ctx.save()
    }
}

/// Log N servings of a recipe as a single MealLog (source "recipe").
private struct LogRecipeSheet: View {
    let recipe: Recipe
    var onLogged: () -> Void

    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @State private var servingsToLog: Double = 1

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text(recipe.name).font(.system(size: 18, weight: .bold)).foregroundStyle(LifeOSColor.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Card {
                        VStack(spacing: 12) {
                            SectionLabel("Servings to log")
                            HStack(spacing: 16) {
                                stepperButton("minus") { servingsToLog = max(0.5, servingsToLog - 0.5) }
                                Text(servingsToLog.truncatingRemainder(dividingBy: 1) == 0
                                     ? "\(Int(servingsToLog))" : String(format: "%.1f", servingsToLog))
                                    .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                                    .foregroundStyle(LifeOSColor.accent).frame(maxWidth: .infinity)
                                stepperButton("plus") { servingsToLog = min(20, servingsToLog + 0.5) }
                            }
                        }
                    }
                    previewCard
                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 14).padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Log recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Log") { log() } }
            }
            .presentationDetents([.medium])
        }
    }

    private var scaled: Recipe.Macros {
        let ps = recipe.perServing
        return .init(calories: ps.calories * servingsToLog, proteinG: ps.proteinG * servingsToLog,
                     carbsG: ps.carbsG * servingsToLog, fatG: ps.fatG * servingsToLog)
    }

    private var previewCard: some View {
        let m = scaled
        return Card {
            HStack(spacing: 0) {
                stat("CAL", "\(Int(m.calories.rounded()))", LifeOSColor.Metric.calories)
                stat("PROTEIN", "\(Int(m.proteinG.rounded()))g", LifeOSColor.Metric.protein)
                stat("CARBS", "\(Int(m.carbsG.rounded()))g", LifeOSColor.Metric.carbs)
                stat("FAT", "\(Int(m.fatG.rounded()))g", LifeOSColor.Metric.fat)
            }
        }
    }

    private func stat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(spacing: 3) {
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(tint)
            Text(label).font(.system(size: 8, weight: .heavy)).tracking(0.8).foregroundStyle(LifeOSColor.fg3)
        }.frame(maxWidth: .infinity)
    }

    private func stepperButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button { Haptics.tick(); action() } label: {
            Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(LifeOSColor.fg)
                .frame(width: 44, height: 44).background(Circle().fill(LifeOSColor.elevated))
        }.buttonStyle(.plain)
    }

    private func log() {
        let m = scaled
        let meal = MealLog(
            date: ISO8601DateFormatter.dateOnly.string(from: Date()),
            name: recipe.name,
            calories: m.calories.rounded(),
            proteinG: (m.proteinG * 10).rounded() / 10,
            carbsG: (m.carbsG * 10).rounded() / 10,
            fatG: (m.fatG * 10).rounded() / 10,
            source: "recipe")
        ctx.insert(meal)
        try? ctx.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
        onLogged()
    }
}
