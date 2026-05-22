import SwiftUI

/// One row of a workout — set number, weight, reps, completed toggle.
/// Tappable weight/reps fields open inline numeric editors.
///
/// Drop sets render indented under their parent set with a "DROP" chip
/// replacing the index number, mirroring how the web app renders them.
///
/// Swipe left to reveal a red Delete affordance, or release past the
/// commit threshold (~80pt) to delete in one motion. Long-press anywhere
/// on the row also surfaces a context-menu Delete as a discoverable
/// fallback. We can't use SwiftUI's `.swipeActions` here because the
/// active workout view stacks rows in a VStack, not a List.
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
    @State private var dragOffset: CGFloat = 0
    @State private var isAtRest: Bool = true

    /// Past this offset, the row is "revealed" and a tap on the trash
    /// commits the delete. Past `commitThreshold` on release, the row
    /// auto-deletes without needing the trash tap.
    private let revealOffset: CGFloat = -76
    private let commitThreshold: CGFloat = -160

    var body: some View {
        ZStack(alignment: .trailing) {
            // Red delete background — visible behind the row as it
            // slides left. Tapping the trash icon commits the delete.
            HStack {
                Spacer()
                Button(action: commitDelete) {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 64, height: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(LifeOSColor.danger)
                        )
                }
                .buttonStyle(.plain)
                .opacity(dragOffset < -8 ? 1 : 0)
                .padding(.trailing, 4)
            }

            rowContent
                .background(
                    // Opaque so dragging reveals red behind, not the
                    // card surface bleeding through.
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(LifeOSColor.card)
                )
                .offset(x: dragOffset)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 18)
                        .onChanged { value in
                            // Ignore vertical-dominant drags so the
                            // outer ScrollView still scrolls cleanly.
                            guard abs(value.translation.width) > abs(value.translation.height) else { return }
                            isAtRest = false
                            // Resistance once past reveal — feels like a hinge.
                            let raw = value.translation.width
                            if raw < revealOffset {
                                let extra = raw - revealOffset
                                dragOffset = revealOffset + extra * 0.4
                            } else {
                                dragOffset = min(0, raw)
                            }
                        }
                        .onEnded { value in
                            isAtRest = true
                            if value.translation.width < commitThreshold {
                                // Full-swipe commit: slide off-screen then delete.
                                withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
                                    dragOffset = -400
                                }
                                Haptics.warning()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                                    onDelete()
                                }
                            } else if value.translation.width < revealOffset {
                                // Snap to the reveal position so the trash stays visible.
                                withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                                    dragOffset = revealOffset
                                }
                                Haptics.tick()
                            } else {
                                // Snap back home.
                                withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
                                    dragOffset = 0
                                }
                            }
                        }
                )
        }
        .contextMenu {
            Button(role: .destructive, action: commitDelete) {
                Label("Delete set", systemImage: "trash")
            }
        }
        .onAppear {
            weightText = set.weight > 0 ? String(format: "%g", set.weight) : ""
            repsText = "\(set.reps)"
        }
    }

    private var rowContent: some View {
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
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        // Drop sets indent so the parent-vs-child relationship is
        // visible at a glance — matches the web app's nested rendering.
        .padding(.leading, set.isDropSet ? 24 : 0)
        .overlay(alignment: .leading) {
            if set.isDropSet {
                Rectangle()
                    .fill(LifeOSColor.warning.opacity(0.4))
                    .frame(width: 2)
                    .padding(.vertical, 8)
                    .padding(.leading, 4)
            }
        }
    }

    /// The 22pt leading badge — either the set number for a regular set
    /// or a small "DROP" chip for a drop set. Warning-token-colored so
    /// drop sets are unambiguously labeled, not just orange-tinted.
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

    private func commitDelete() {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
            dragOffset = -400
        }
        Haptics.warning()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            onDelete()
        }
    }

    private func formatRPE(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", r)
            : String(format: "%.1f", r)
    }
}
