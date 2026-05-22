import SwiftUI

/// Searchable, grouped exercise picker. Tap a row → returns the name
/// via the `onPick` callback and dismisses. Also supports adding a
/// custom freeform exercise (anything not in the catalog).
struct ExercisePickerView: View {
    var onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if !query.isEmpty,
                       !ExerciseLibrary.all.contains(where: { $0.name.lowercased() == query.lowercased() }) {
                        Button {
                            pick(query.trimmingCharacters(in: .whitespacesAndNewlines))
                        } label: {
                            HStack {
                                Image(systemName: "plus.circle.fill")
                                    .foregroundStyle(LifeOSColor.accent)
                                Text("Add \"\(query)\" as custom")
                                    .font(.system(size: 14, weight: .medium))
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .glassCard(cornerRadius: 14)
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(filteredGroups, id: \.0) { muscle, items in
                        VStack(alignment: .leading, spacing: 6) {
                            SectionLabel(muscle.rawValue)
                            VStack(spacing: 6) {
                                ForEach(items) { item in
                                    Button { pick(item.name) } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 1) {
                                                Text(item.name)
                                                    .font(.system(size: 14, weight: .medium))
                                                    .foregroundStyle(.white)
                                                Text(item.equipment.rawValue.capitalized)
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(LifeOSColor.fg3)
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 12))
                                                .foregroundStyle(LifeOSColor.fg3)
                                        }
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 12)
                                        .glassCard(cornerRadius: 14)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search exercises")
            .navigationTitle("Add exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(LifeOSColor.accent)
                }
            }
        }
        .presentationDetents([.large])
    }

    private var filteredGroups: [(ExerciseCatalogItem.Muscle, [ExerciseCatalogItem])] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty {
            return ExerciseLibrary.grouped()
        }
        let filtered = ExerciseLibrary.search(q)
        return ExerciseCatalogItem.Muscle.allCases.compactMap { muscle in
            let items = filtered.filter { $0.muscle == muscle }
            return items.isEmpty ? nil : (muscle, items)
        }
    }

    private func pick(_ name: String) {
        Haptics.success()
        onPick(name)
        dismiss()
    }
}
