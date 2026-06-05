import SwiftUI
import SwiftData

/// Searchable food database backed by the USDA FoodData Central proxy.
/// Debounced search → tap a result → set the portion (grams) → logs a MealLog
/// with macros scaled from the per-100g basis. Presented as a sheet (own
/// NavigationStack); the portion editor is a nested sheet so no push-gesture
/// gotcha applies.
struct FoodSearchSheet: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var results: [FoodSearchItem] = []
    @State private var isSearching = false
    @State private var errorText: String?
    @State private var didSearch = false
    @State private var selected: FoodSearchItem?
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchField
                content
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Search foods")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .sheet(item: $selected) { item in
                PortionEntrySheet(item: item) { dismiss() }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg3)
            TextField("Search foods…", text: $query)
                .font(.system(size: 16))
                .foregroundStyle(LifeOSColor.fg)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onChange(of: query) { _, _ in scheduleSearch() }
                .onSubmit { runSearch(now: true) }
            if !query.isEmpty {
                Button { query = ""; results = []; didSearch = false } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 16))
                        .foregroundStyle(LifeOSColor.fg3)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(LifeOSColor.elevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    @ViewBuilder private var content: some View {
        if isSearching {
            Spacer(); ProgressView().tint(LifeOSColor.accent); Spacer()
        } else if let errorText {
            messageState(icon: "exclamationmark.triangle.fill", tint: LifeOSColor.warning, text: errorText)
        } else if results.isEmpty && didSearch {
            messageState(icon: "fork.knife", tint: LifeOSColor.fg3, text: "No matches. Try a simpler or more specific name.")
        } else if results.isEmpty {
            messageState(icon: "magnifyingglass", tint: LifeOSColor.fg3,
                         text: "Search the USDA food database — branded products and whole foods. Tap a result to set your portion.")
        } else {
            List(results) { item in
                Button { Haptics.tap(); selected = item } label: { resultRow(item) }
                    .buttonStyle(.plain)
                    .listRowBackground(LifeOSColor.card)
                    .listRowSeparatorTint(LifeOSColor.stroke)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func resultRow(_ item: FoodSearchItem) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name.capitalizedSensibly)
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
                    .lineLimit(2)
                if let brand = item.brand {
                    Text(brand.capitalizedSensibly).font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3).lineLimit(1)
                }
                Text("\(Int(item.per100g.calories)) kcal · \(macroLine(item.per100g)) per 100g")
                    .font(.system(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(LifeOSColor.fg2)
            }
            Spacer(minLength: 0)
            Image(systemName: "plus.circle.fill").font(.system(size: 20)).foregroundStyle(LifeOSColor.accent)
        }
        .padding(.vertical, 4)
    }

    private func macroLine(_ m: FoodSearchItem.Macros) -> String {
        "P\(Int(m.proteinG.rounded())) C\(Int(m.carbsG.rounded())) F\(Int(m.fatG.rounded()))"
    }

    private func messageState(icon: String, tint: Color, text: String) -> some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: icon).font(.system(size: 30)).foregroundStyle(tint.opacity(0.7))
            Text(text).font(.system(size: 13)).foregroundStyle(LifeOSColor.fg2)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Spacer()
        }
    }

    // MARK: Search

    private func scheduleSearch() {
        searchTask?.cancel()
        let q = query
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, q == query else { return }
            runSearch(now: false)
        }
    }

    private func runSearch(now: Bool) {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { results = []; didSearch = false; return }
        searchTask?.cancel()
        Task {
            isSearching = true; errorText = nil
            defer { isSearching = false }
            do {
                let items = try await FoodSearchClient.search(q)
                guard q == query.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
                results = items
                didSearch = true
            } catch {
                errorText = "Couldn't reach the food database. Check your connection and try again."
                didSearch = true
            }
        }
    }
}

/// Portion entry for a chosen food — grams stepper with a live macro preview,
/// logs a MealLog scaled from the per-100g basis on confirm.
private struct PortionEntrySheet: View {
    let item: FoodSearchItem
    var onLogged: () -> Void

    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @State private var grams: Double

    init(item: FoodSearchItem, onLogged: @escaping () -> Void) {
        self.item = item
        self.onLogged = onLogged
        _grams = State(initialValue: item.serving.size.flatMap { $0 > 0 ? $0 : nil } ?? 100)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header
                    portionCard
                    previewCard
                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 14).padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Portion")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Add") { log() } }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.name.capitalizedSensibly).font(.system(size: 17, weight: .bold)).foregroundStyle(LifeOSColor.fg)
            if let brand = item.brand {
                Text(brand.capitalizedSensibly).font(.system(size: 12)).foregroundStyle(LifeOSColor.fg3)
            }
            if let hh = item.serving.household {
                Text("Serving: \(hh)").font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var portionCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Amount")
                HStack(spacing: 14) {
                    stepperButton("minus") { grams = max(5, grams - 5) }
                    VStack(spacing: 0) {
                        Text("\(Int(grams.rounded()))")
                            .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                            .foregroundStyle(LifeOSColor.accent)
                        Text("grams").font(.system(size: 10, weight: .semibold)).foregroundStyle(LifeOSColor.fg3)
                    }
                    .frame(maxWidth: .infinity)
                    stepperButton("plus") { grams = min(2000, grams + 5) }
                }
                HStack(spacing: 8) {
                    ForEach([50.0, 100.0, 150.0, 200.0], id: \.self) { g in
                        Button { Haptics.tick(); grams = g } label: {
                            Text("\(Int(g))g").font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(grams == g ? .white : LifeOSColor.fg2)
                                .frame(maxWidth: .infinity).frame(height: 30)
                                .background(Capsule().fill(grams == g ? LifeOSColor.accent : LifeOSColor.elevated))
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var previewCard: some View {
        let m = item.scaled(toGrams: grams)
        return Card {
            HStack(spacing: 0) {
                macroStat("CAL", "\(Int(m.calories.rounded()))", LifeOSColor.Metric.calories)
                macroStat("PROTEIN", "\(Int(m.proteinG.rounded()))g", LifeOSColor.Metric.protein)
                macroStat("CARBS", "\(Int(m.carbsG.rounded()))g", LifeOSColor.Metric.carbs)
                macroStat("FAT", "\(Int(m.fatG.rounded()))g", LifeOSColor.Metric.fat)
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
            Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(LifeOSColor.fg)
                .frame(width: 44, height: 44)
                .background(Circle().fill(LifeOSColor.elevated))
        }.buttonStyle(.plain)
    }

    private func log() {
        let m = item.scaled(toGrams: grams)
        let meal = MealLog(
            date: ISO8601DateFormatter.dateOnly.string(from: Date()),
            name: item.name.capitalizedSensibly,
            calories: m.calories.rounded(),
            proteinG: (m.proteinG * 10).rounded() / 10,
            carbsG: (m.carbsG * 10).rounded() / 10,
            fatG: (m.fatG * 10).rounded() / 10,
            source: "search")
        ctx.insert(meal)
        try? ctx.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
        onLogged()
    }
}

private extension String {
    /// USDA descriptions are SHOUTING ("GREEK YOGURT") — gentle title-case them
    /// without clobbering already-mixed-case branded names.
    var capitalizedSensibly: String {
        let upperRatio = filter(\.isLetter).isEmpty ? 0
            : Double(filter { $0.isUppercase }.count) / Double(max(1, filter(\.isLetter).count))
        guard upperRatio > 0.6 else { return self }
        return capitalized(with: Locale(identifier: "en_US"))
    }
}
