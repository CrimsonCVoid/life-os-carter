import SwiftUI
import SwiftData

/// Build or edit a multi-ingredient recipe. Ingredients come from the USDA food
/// search (reusing FoodSearchSheet in its onPick mode) or a quick manual entry.
/// Shows live total + per-serving macros. Saving upserts a Recipe; logging is
/// done from RecipesView.
struct RecipeBuilderSheet: View {
    var editing: Recipe?

    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var servings: Int
    @State private var ingredients: [RecipeIngredient]
    @State private var showFoodSearch = false
    @State private var showManualAdd = false

    init(editing: Recipe? = nil) {
        self.editing = editing
        _name = State(initialValue: editing?.name ?? "")
        _servings = State(initialValue: editing?.servings ?? 1)
        _ingredients = State(initialValue: editing?.ingredients ?? [])
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    nameCard
                    ingredientsCard
                    if !ingredients.isEmpty { totalsCard }
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 14).padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle(editing == nil ? "New recipe" : "Edit recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(!canSave)
                }
            }
            .sheet(isPresented: $showFoodSearch) {
                FoodSearchSheet(onPick: { item, grams in
                    let m = item.scaled(toGrams: grams)
                    ingredients.append(RecipeIngredient(
                        name: item.name.capitalizedSensiblyRB,
                        grams: grams,
                        calories: (m.calories).rounded(),
                        proteinG: (m.proteinG * 10).rounded() / 10,
                        carbsG: (m.carbsG * 10).rounded() / 10,
                        fatG: (m.fatG * 10).rounded() / 10))
                })
            }
            .sheet(isPresented: $showManualAdd) {
                ManualIngredientSheet { ingredients.append($0) }
            }
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !ingredients.isEmpty
    }

    private var nameCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Recipe")
                TextField("Name (e.g. Overnight oats)", text: $name)
                    .font(.system(size: 16)).foregroundStyle(LifeOSColor.fg)
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(LifeOSColor.elevated, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                HStack {
                    Text("Servings").font(.system(size: 13, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
                    Spacer()
                    stepperButton("minus") { servings = max(1, servings - 1) }
                    Text("\(servings)").font(.system(size: 18, weight: .bold).monospacedDigit())
                        .foregroundStyle(LifeOSColor.accent).frame(minWidth: 36)
                    stepperButton("plus") { servings = min(50, servings + 1) }
                }
            }
        }
    }

    private var ingredientsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SectionLabel("Ingredients")
                    Spacer()
                    Menu {
                        Button { Haptics.tap(); showFoodSearch = true } label: {
                            Label("Search foods", systemImage: "magnifyingglass")
                        }
                        Button { Haptics.tap(); showManualAdd = true } label: {
                            Label("Manual entry", systemImage: "square.and.pencil")
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus.circle.fill").font(.system(size: 13, weight: .semibold))
                            Text("Add").font(.system(size: 12, weight: .semibold))
                        }.foregroundStyle(LifeOSColor.accent)
                    }
                }
                if ingredients.isEmpty {
                    Text("No ingredients yet. Add from the food database or enter macros manually.")
                        .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                } else {
                    ForEach(ingredients) { ing in ingredientRow(ing) }
                }
            }
        }
    }

    private func ingredientRow(_ ing: RecipeIngredient) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ing.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(LifeOSColor.fg).lineLimit(1)
                Text("\(Int(ing.grams))g · \(Int(ing.calories)) kcal · P\(Int(ing.proteinG)) C\(Int(ing.carbsG)) F\(Int(ing.fatG))")
                    .font(.system(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(LifeOSColor.fg3)
            }
            Spacer(minLength: 0)
            Button {
                Haptics.tick()
                ingredients.removeAll { $0.id == ing.id }
            } label: {
                Image(systemName: "minus.circle.fill").font(.system(size: 18)).foregroundStyle(LifeOSColor.danger.opacity(0.8))
            }.buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }

    private var totalsCard: some View {
        let total = ingredients.reduce(into: (c: 0.0, p: 0.0, cb: 0.0, f: 0.0)) { acc, i in
            acc.c += i.calories; acc.p += i.proteinG; acc.cb += i.carbsG; acc.f += i.fatG
        }
        let n = Double(max(1, servings))
        return Card(tint: LifeOSColor.Metric.calories) {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Per serving (\(servings) total)")
                HStack(spacing: 0) {
                    macroStat("CAL", "\(Int((total.c / n).rounded()))", LifeOSColor.Metric.calories)
                    macroStat("PROTEIN", "\(Int((total.p / n).rounded()))g", LifeOSColor.Metric.protein)
                    macroStat("CARBS", "\(Int((total.cb / n).rounded()))g", LifeOSColor.Metric.carbs)
                    macroStat("FAT", "\(Int((total.f / n).rounded()))g", LifeOSColor.Metric.fat)
                }
                Text("Whole recipe: \(Int(total.c.rounded())) kcal").font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    private func macroStat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(spacing: 3) {
            Text(value).font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(tint)
            Text(label).font(.system(size: 8, weight: .heavy)).tracking(0.8).foregroundStyle(LifeOSColor.fg3)
        }.frame(maxWidth: .infinity)
    }

    private func stepperButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button { Haptics.tick(); action() } label: {
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(LifeOSColor.fg)
                .frame(width: 38, height: 38)
                .background(Circle().fill(LifeOSColor.elevated))
        }.buttonStyle(.plain)
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let recipe = editing ?? Recipe(name: trimmed)
        recipe.name = trimmed
        recipe.servings = servings
        recipe.ingredients = ingredients   // setter re-encodes JSON + flags needsSync
        if editing == nil { ctx.insert(recipe) }
        try? ctx.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
    }
}

/// Quick manual ingredient entry — name + grams + macros, all typed.
private struct ManualIngredientSheet: View {
    var onAdd: (RecipeIngredient) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var grams = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Ingredient") {
                    TextField("Name", text: $name)
                }
                Section("Amount + macros") {
                    field("Grams", $grams)
                    field("Calories", $calories)
                    field("Protein (g)", $protein)
                    field("Carbs (g)", $carbs)
                    field("Fat (g)", $fat)
                }
            }
            .navigationTitle("Manual ingredient")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { add() }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func field(_ label: String, _ binding: Binding<String>) -> some View {
        HStack {
            Text(label).foregroundStyle(LifeOSColor.fg)
            Spacer()
            TextField("0", text: binding)
                .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 90)
        }
    }

    private func add() {
        onAdd(RecipeIngredient(
            name: name.trimmingCharacters(in: .whitespaces),
            grams: Double(grams) ?? 0,
            calories: Double(calories) ?? 0,
            proteinG: Double(protein) ?? 0,
            carbsG: Double(carbs) ?? 0,
            fatG: Double(fat) ?? 0))
        Haptics.success()
        dismiss()
    }
}

extension String {
    /// Title-case SHOUTING USDA descriptions (recipe-builder copy of the
    /// food-search helper; the original is file-private to FoodSearchSheet).
    var capitalizedSensiblyRB: String {
        let letters = filter(\.isLetter)
        guard !letters.isEmpty else { return self }
        let upperRatio = Double(letters.filter(\.isUppercase).count) / Double(letters.count)
        guard upperRatio > 0.6 else { return self }
        return capitalized(with: Locale(identifier: "en_US"))
    }
}
