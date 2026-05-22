import SwiftUI
import SwiftData

/// Onboarding screen for choosing a training split. Tap a tile, the
/// matching `WorkoutSplit` + day templates persist, the gym home
/// re-renders with the saved days.
struct SplitPickerView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var existingSplits: [WorkoutSplit]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Text("Pick a split — we'll seed your days with sensible defaults you can edit later.")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)

                    ForEach(SplitKind.allCases) { kind in
                        Button {
                            choose(kind)
                        } label: {
                            splitTile(for: kind)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, 14)
                .padding(.top, 12)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Choose your split")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
            }
        }
    }

    private func splitTile(for kind: SplitKind) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LifeOSColor.accentSoft)
                Image(systemName: kind.icon)
                    .font(.system(size: 22))
                    .foregroundStyle(LifeOSColor.accent)
            }
            .frame(width: 54, height: 54)

            VStack(alignment: .leading, spacing: 3) {
                Text(kind.displayName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Text(kind.subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
                if !kind.defaultDays.isEmpty {
                    Text(kind.defaultDays.map { $0.name }.joined(separator: " · "))
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg2)
                        .lineLimit(1)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg3)
        }
        .padding(14)
        .glassCard()
    }

    private func choose(_ kind: SplitKind) {
        // Clear any existing split, then seed the new one.
        for old in existingSplits { modelContext.delete(old) }
        let split = WorkoutSplit(kind: kind)
        modelContext.insert(split)
        for template in kind.makeTemplates() {
            template.split = split
            modelContext.insert(template)
        }
        try? modelContext.save()
        Haptics.success()
        dismiss()
    }
}
