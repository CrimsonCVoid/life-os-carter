import SwiftUI
import SwiftData

/// Bottom-sheet to log a tape measurement. Wraps its own NavigationStack
/// (presented via .sheet). Input fields are in the user's display unit; we
/// store cm internally. Empty fields stay nil — log just what you measured.
struct AddMeasurementSheet: View {
    let unit: WeightUnit
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    @State private var waist = ""
    @State private var chest = ""
    @State private var hips = ""
    @State private var lArm = ""
    @State private var rArm = ""
    @State private var thigh = ""
    @State private var neck = ""

    private var imperial: Bool { unit == .lb }
    private var unitLabel: String { imperial ? "in" : "cm" }

    var body: some View {
        NavigationStack {
            Form {
                Section("Sites (\(unitLabel))") {
                    field("Waist", $waist); field("Chest", $chest); field("Hips", $hips)
                    field("Left arm", $lArm); field("Right arm", $rArm)
                    field("Thigh", $thigh); field("Neck", $neck)
                }
            }
            .navigationTitle("Log Measurement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(allEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var allEmpty: Bool {
        [waist, chest, hips, lArm, rArm, thigh, neck].allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private func field(_ label: String, _ binding: Binding<String>) -> some View {
        HStack {
            Text(label).foregroundStyle(LifeOSColor.fg)
            Spacer()
            TextField("—", text: binding)
                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                .frame(width: 80)
        }
    }

    /// Parse a display value → cm. nil for blank/unparseable.
    private func cm(_ s: String) -> Double? {
        guard let v = Double(s.trimmingCharacters(in: .whitespaces)), v > 0 else { return nil }
        return imperial ? v * 2.54 : v
    }

    private func save() {
        let m = BodyMeasurement(date: Self.ymd.string(from: Date()))
        m.waistCm = cm(waist); m.chestCm = cm(chest); m.hipsCm = cm(hips)
        m.leftArmCm = cm(lArm); m.rightArmCm = cm(rArm); m.thighCm = cm(thigh); m.neckCm = cm(neck)
        ctx.insert(m); try? ctx.save()
        Haptics.success(); dismiss()
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
}
