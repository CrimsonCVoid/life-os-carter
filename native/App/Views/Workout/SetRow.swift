import SwiftUI

/// One row of a workout — set number, weight, reps, completed toggle.
/// Tappable weight/reps fields open inline numeric editors.
///
/// Drop sets render indented under their parent set with a "DROP" chip
/// replacing the index number, mirroring how the web app renders them.
/// Long-press anywhere on the row to reveal a Delete action — we use
/// `.contextMenu` instead of `.swipeActions` because the latter only
/// works inside `List` containers and the active workout view uses a
/// VStack for layout reasons.
struct SetRow: View {
    let index: Int
    let set: WorkoutSet
    let onToggleComplete: () -> Void
    let onTapPlate: () -> Void
    let onOpenRPE: () -> Void
    let onChangeWeight: (Double) -> Void
    let onChangeReps: (Int) -> Void
    let onDelete: () -> Void

    @State private var weightText: String = ""
    @State private var repsText: String = ""

    var body: some View {
        HStack(spacing: 8) {
            leadingBadge

            // Weight
            HStack(spacing: 2) {
                TextField("0", text: $weightText)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 16, weight: .semibold).monospacedDigit())
                    .frame(minWidth: 50)
                    .onChange(of: weightText) { _, new in
                        if let v = Double(new) { onChangeWeight(v) }
                    }
                Button(action: onTapPlate) {
                    Image(systemName: "circle.grid.2x2")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(LifeOSColor.elevated)
            )

            Text("×")
                .font(.system(size: 14))
                .foregroundStyle(LifeOSColor.fg3)

            // Reps
            TextField("0", text: $repsText)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 16, weight: .semibold).monospacedDigit())
                .frame(minWidth: 40)
                .padding(.vertical, 6)
                .padding(.horizontal, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(LifeOSColor.elevated)
                )
                .onChange(of: repsText) { _, new in
                    if let r = Int(new) { onChangeReps(r) }
                }

            // RPE button (if set)
            Button(action: onOpenRPE) {
                if let rpe = set.rpe {
                    Text("RPE \(formatRPE(rpe))")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LifeOSColor.Metric.peak)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(LifeOSColor.Metric.peak.opacity(0.15)))
                } else {
                    Image(systemName: "gauge.with.dots.needle.bottom.50percent")
                        .font(.system(size: 13))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            .buttonStyle(.plain)

            Spacer()

            Button(action: onToggleComplete) {
                Image(systemName: set.completed ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 26))
                    .foregroundStyle(set.completed ? LifeOSColor.success : LifeOSColor.fg3)
            }
            .buttonStyle(.plain)
        }
        // Drop sets indent so the parent-vs-child relationship is
        // visible at a glance — matches the web app's nested rendering.
        .padding(.leading, set.isDropSet ? 24 : 0)
        .overlay(alignment: .leading) {
            if set.isDropSet {
                Rectangle()
                    .fill(LifeOSColor.warning.opacity(0.4))
                    .frame(width: 2)
                    .padding(.vertical, 4)
            }
        }
        .contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("Delete set", systemImage: "trash")
            }
        }
        .onAppear {
            weightText = set.weight > 0 ? String(format: "%g", set.weight) : ""
            repsText = "\(set.reps)"
        }
    }

    /// The 22pt leading badge — either the set number for a regular set
    /// or a small "DROP" chip for a drop set. The chip is colored with
    /// the warning token to match the menu / button accent already
    /// used for drop-set affordances elsewhere in the screen.
    @ViewBuilder
    private var leadingBadge: some View {
        if set.isDropSet {
            Text("DROP")
                .font(.system(size: 9, weight: .heavy))
                .tracking(0.6)
                .foregroundStyle(LifeOSColor.warning)
                .padding(.horizontal, 5)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(LifeOSColor.warning.opacity(0.16))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(LifeOSColor.warning.opacity(0.4), lineWidth: 0.5)
                )
        } else {
            Text("\(index)")
                .font(.system(size: 12, weight: .bold))
                .frame(width: 22, height: 28)
                .foregroundStyle(LifeOSColor.fg3)
        }
    }

    private func formatRPE(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", r)
            : String(format: "%.1f", r)
    }
}
