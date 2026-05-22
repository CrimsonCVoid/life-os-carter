import SwiftUI

/// Visual plate calculator — given a total weight + bar weight, shows
/// which plates load each side. Defaults to 45 lb Olympic bar.
struct PlateCalculator: View {
    let totalWeight: Double
    @State private var barWeight: Double = 45
    @Environment(\.dismiss) private var dismiss

    private let plates: [Double] = [45, 35, 25, 10, 5, 2.5]

    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 2) {
                Text("Per side")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)
                Text("\(Int(totalWeight)) lb")
                    .font(.system(size: 36, weight: .bold, design: .rounded).monospacedDigit())
            }

            HStack(spacing: 4) {
                Capsule()
                    .fill(LifeOSColor.fg2)
                    .frame(width: 12, height: 22)
                ForEach(perSidePlates, id: \.self) { plate in
                    plateView(plate)
                }
                Spacer(minLength: 0)
                ForEach(perSidePlates.reversed(), id: \.self) { plate in
                    plateView(plate)
                }
                Capsule()
                    .fill(LifeOSColor.fg2)
                    .frame(width: 12, height: 22)
            }
            .padding(.horizontal, 6)

            VStack(spacing: 6) {
                ForEach(plateCounts, id: \.0) { plate, count in
                    HStack {
                        Circle().fill(color(for: plate)).frame(width: 14, height: 14)
                        Text("\(format(plate)) lb")
                            .font(.system(size: 14, weight: .medium))
                        Spacer()
                        Text("× \(count) per side")
                            .font(.system(size: 13).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                }
            }

            Picker("Bar", selection: $barWeight) {
                Text("45 lb (Olympic)").tag(45.0)
                Text("35 lb (Women's)").tag(35.0)
                Text("15 lb (Trap)").tag(15.0)
                Text("0 (None)").tag(0.0)
            }
            .pickerStyle(.segmented)
        }
        .padding(20)
        .background(LifeOSColor.card.ignoresSafeArea())
    }

    private var perSide: Double {
        max(0, (totalWeight - barWeight) / 2)
    }

    private var perSidePlates: [Double] {
        var remaining = perSide
        var result: [Double] = []
        for plate in plates {
            while remaining >= plate {
                result.append(plate)
                remaining -= plate
            }
        }
        return result
    }

    private var plateCounts: [(Double, Int)] {
        let groups = Dictionary(grouping: perSidePlates, by: { $0 })
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!.count) }
    }

    private func plateView(_ plate: Double) -> some View {
        let height: CGFloat = plate >= 45 ? 64 : plate >= 25 ? 52 : plate >= 10 ? 42 : 32
        return RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(color(for: plate))
            .frame(width: 8, height: height)
            .overlay(
                Text(format(plate))
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.white)
                    .rotationEffect(.degrees(-90))
                    .opacity(plate >= 25 ? 1 : 0)
            )
    }

    private func color(for plate: Double) -> Color {
        switch plate {
        case 45: return Color(hex: 0x1E40AF)
        case 35: return Color(hex: 0xEAB308)
        case 25: return Color(hex: 0x16A34A)
        case 10: return Color(hex: 0xFFFFFF).opacity(0.7)
        case 5:  return Color(hex: 0x64748B)
        default: return Color(hex: 0x94A3B8)
        }
    }

    private func format(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", v)
            : String(format: "%.1f", v)
    }
}
