import SwiftUI

/// Bottom-sheet RPE picker. Shows 6.0 → 10.0 in 0.5 steps as tappable
/// chips. Pure Apple style — chips look native, no custom slider.
struct RPEDrawer: View {
    let exerciseID: UUID
    let setID: UUID
    @Bindable var store: ActiveWorkoutStore
    @Environment(\.dismiss) private var dismiss

    private let values: [Double] = stride(from: 6.0, through: 10.0, by: 0.5).map { $0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Rate of Perceived Exertion")
                    .font(.system(size: 15, weight: .semibold))
                Text("How hard was this set?")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 8) {
                ForEach(values, id: \.self) { v in
                    Button {
                        store.updateSet(exerciseID: exerciseID, setID: setID) { $0.rpe = v }
                        Haptics.tick()
                        dismiss()
                    } label: {
                        Text(format(v))
                            .font(.system(size: 16, weight: .bold, design: .rounded).monospacedDigit())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(tint(for: v).opacity(0.18))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .stroke(tint(for: v).opacity(0.4), lineWidth: 0.5)
                                    )
                            )
                            .foregroundStyle(tint(for: v))
                    }
                    .buttonStyle(.plain)
                }
            }
            Button(role: .destructive) {
                store.updateSet(exerciseID: exerciseID, setID: setID) { $0.rpe = nil }
                dismiss()
            } label: {
                Text("Clear RPE")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
            }
            .buttonStyle(.plain)
            .foregroundStyle(LifeOSColor.fg3)
        }
        .padding(20)
        .background(LifeOSColor.card.ignoresSafeArea())
    }

    private func tint(for v: Double) -> Color {
        switch v {
        case ..<7.5: return LifeOSColor.Metric.steps
        case ..<9:   return LifeOSColor.Metric.energy
        default:     return LifeOSColor.danger
        }
    }

    private func format(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(v))" : String(format: "%.1f", v)
    }
}
