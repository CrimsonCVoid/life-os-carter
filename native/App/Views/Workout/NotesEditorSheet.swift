import SwiftUI

/// Minimal text editor sheet for per-session workout notes. Trims on
/// save; empty input clears the note. Single TextEditor inside a
/// card with a Save toolbar action.
struct NotesEditorSheet: View {
    let initialText: String
    let onSave: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("How did it feel? What worked, what didn't, what to try next session…")
                            .font(.system(size: 14))
                            .foregroundStyle(LifeOSColor.fg3)
                            .padding(.horizontal, 18).padding(.top, 18)
                    }
                    TextEditor(text: $text)
                        .scrollContentBackground(.hidden)
                        .focused($focused)
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                        .font(.system(size: 14))
                }
                Spacer()
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        onSave(text.trimmingCharacters(in: .whitespacesAndNewlines))
                        Haptics.success()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(LifeOSColor.accent)
                }
            }
            .onAppear {
                text = initialText
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                    focused = true
                }
            }
        }
    }
}
