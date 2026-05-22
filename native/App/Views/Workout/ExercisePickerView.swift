import SwiftUI

/// Searchable, grouped exercise picker. Tap a row → returns the name via
/// `onPick` and dismisses. Recent exercises (from prior session history)
/// surface at the top when the user isn't actively searching. A freeform
/// search term that doesn't match the catalog can be added as a custom
/// exercise via the top "Add" row.
struct ExercisePickerView: View {
    var recentNames: [String]
    var onPick: (String) -> Void

    init(recentNames: [String] = [], onPick: @escaping (String) -> Void) {
        self.recentNames = recentNames
        self.onPick = onPick
    }

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if !query.isEmpty, !catalogContainsQuery {
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

                    if query.isEmpty, !recentNames.isEmpty {
                        recentSection
                    }

                    ForEach(filteredGroups, id: \.0) { muscle, items in
                        VStack(alignment: .leading, spacing: 6) {
                            SectionLabel(muscle.rawValue)
                            VStack(spacing: 6) {
                                ForEach(items) { item in
                                    exerciseRow(name: item.name, subtitle: item.equipment.rawValue.capitalized)
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

    // MARK: - Recent section

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel("Recent")
            VStack(spacing: 6) {
                ForEach(recentNames, id: \.self) { name in
                    Button { pick(name) } label: {
                        HStack {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 12))
                                .foregroundStyle(LifeOSColor.accent)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(name)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.white)
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

    // MARK: - Catalog row

    private func exerciseRow(name: String, subtitle: String) -> some View {
        Button { pick(name) } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white)
                    Text(subtitle)
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

    // MARK: - Filtering

    private var catalogContainsQuery: Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return ExerciseLibrary.all.contains { $0.name.lowercased() == q }
            || recentNames.contains { $0.lowercased() == q }
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
