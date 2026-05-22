import SwiftUI
import SwiftData

/// Edit one day's template — reorder + add/remove exercises. Changes
/// persist live to the underlying `WorkoutTemplate`.
struct TemplateEditorView: View {
    @Bindable var template: WorkoutTemplate
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var pickerOpen = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text("Rest target")
                            .foregroundStyle(LifeOSColor.fg2)
                        Spacer()
                        Stepper(value: $template.defaultRestSeconds, in: 30...600, step: 15) {
                            Text("\(template.defaultRestSeconds / 60):\(String(format: "%02d", template.defaultRestSeconds % 60))")
                                .font(.system(size: 14).monospacedDigit())
                                .foregroundStyle(.white)
                        }
                        .labelsHidden()
                    }
                }
                .listRowBackground(LifeOSColor.card)

                Section("Exercises") {
                    ForEach(template.exerciseNames, id: \.self) { name in
                        HStack {
                            Text(name).foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "line.3.horizontal")
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    .onMove { from, to in
                        var arr = template.exerciseNames
                        arr.move(fromOffsets: from, toOffset: to)
                        template.exerciseNames = arr
                        try? modelContext.save()
                    }
                    .onDelete { offsets in
                        var arr = template.exerciseNames
                        arr.remove(atOffsets: offsets)
                        template.exerciseNames = arr
                        try? modelContext.save()
                        Haptics.warning()
                    }

                    Button {
                        pickerOpen = true
                        Haptics.tap()
                    } label: {
                        Label("Add exercise", systemImage: "plus.circle.fill")
                            .foregroundStyle(LifeOSColor.accent)
                    }
                }
                .listRowBackground(LifeOSColor.card)
            }
            .scrollContentBackground(.hidden)
            .background(LifeOSColor.base.ignoresSafeArea())
            .environment(\.editMode, .constant(.active))
            .navigationTitle(template.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                        .foregroundStyle(LifeOSColor.accent)
                }
            }
            .sheet(isPresented: $pickerOpen) {
                ExercisePickerView { name in
                    var arr = template.exerciseNames
                    arr.append(name)
                    template.exerciseNames = arr
                    try? modelContext.save()
                }
            }
        }
    }
}
