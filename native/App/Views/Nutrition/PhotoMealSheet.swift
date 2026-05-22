import SwiftUI
import PhotosUI
import UIKit

/// Photo source for the "Photo" quick action. The user can either take
/// a fresh photo with the camera (UIImagePickerController — SwiftUI
/// has no native camera component) or pick one from the library
/// (PhotosPicker). Both paths converge on `ingest(image:)` which
/// uploads to /api/food-photo and routes the Gemini result to the
/// review sheet.
struct PhotoMealSheet: View {
    var onResult: (MealCapturePayload) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var pickerItem: PhotosPickerItem?
    @State private var cameraPickerOpen = false
    @State private var stage: Stage = .choosing
    @State private var errorText: String?
    @State private var previewImage: UIImage?

    enum Stage { case choosing, uploading }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(LifeOSColor.fg2)
                Spacer()
                Text("Photo")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Color.clear.frame(width: 60)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            Divider().overlay(LifeOSColor.stroke)

            Spacer()

            VStack(spacing: 24) {
                if let img = previewImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 320)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(LifeOSColor.stroke, lineWidth: 0.5)
                        )
                } else {
                    placeholder
                }

                if stage == .uploading {
                    HStack(spacing: 10) {
                        ProgressView().tint(LifeOSColor.accent)
                        Text("Estimating macros…")
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    .frame(height: 60)
                } else if let err = errorText {
                    Text(err)
                        .font(.system(size: 13))
                        .foregroundStyle(LifeOSColor.danger)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                } else {
                    captureButtons
                }
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .fullScreenCover(isPresented: $cameraPickerOpen) {
            CameraPicker { taken in
                cameraPickerOpen = false
                if let img = taken {
                    Task { await ingest(image: img) }
                }
            }
            .ignoresSafeArea()
        }
        .onChange(of: pickerItem) { _, newItem in
            guard let newItem else { return }
            Task { await ingestPickerItem(newItem) }
        }
    }

    // MARK: - Choose / retry buttons

    private var captureButtons: some View {
        HStack(spacing: 12) {
            Button {
                Haptics.tap()
                cameraPickerOpen = true
            } label: {
                captureButtonLabel(
                    icon: "camera.fill",
                    title: previewImage == nil ? "Take photo" : "Retake",
                    tint: LifeOSColor.accent
                )
            }
            .buttonStyle(.plain)

            PhotosPicker(
                selection: $pickerItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                captureButtonLabel(
                    icon: "photo.on.rectangle.angled",
                    title: previewImage == nil ? "From library" : "Pick another",
                    tint: LifeOSColor.fg2,
                    filled: false
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func captureButtonLabel(icon: String, title: String, tint: Color, filled: Bool = true) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(title).fontWeight(.semibold)
        }
        .font(.system(size: 14))
        .foregroundStyle(filled ? .white : tint)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(filled ? tint : Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(filled ? Color.clear : LifeOSColor.stroke, lineWidth: 0.5)
                )
        )
        .shadow(color: filled ? tint.opacity(0.35) : .clear, radius: 12, x: 0, y: 6)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(LifeOSColor.card)
            .overlay(
                VStack(spacing: 8) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(LifeOSColor.fg3)
                    Text("Take a photo or pick one")
                        .font(.system(size: 13))
                        .foregroundStyle(LifeOSColor.fg2)
                }
            )
            .frame(maxHeight: 320)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(LifeOSColor.stroke, lineWidth: 0.5)
            )
    }

    // MARK: - Upload pipeline

    @MainActor
    private func ingestPickerItem(_ item: PhotosPickerItem) async {
        errorText = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                errorText = "Couldn't read that photo."
                return
            }
            await ingest(image: image)
        } catch {
            errorText = "Couldn't read that photo: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func ingest(image: UIImage) async {
        previewImage = image
        stage = .uploading
        errorText = nil
        Haptics.tap()
        do {
            let payload: MealCapturePayload = try await APIClient.shared.uploadJPEG(
                "/api/food-photo",
                image: image,
                fieldName: "photo",
                as: MealCapturePayload.self
            )
            onResult(payload)
            dismiss()
        } catch {
            stage = .choosing
            errorText = "Upload failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Camera (UIImagePickerController wrapper)

/// SwiftUI doesn't ship a native camera capture component, so we wrap
/// UIImagePickerController. Returns the captured UIImage on completion
/// or nil if the user tapped Cancel.
private struct CameraPicker: UIViewControllerRepresentable {
    var onCompletion: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let vc = UIImagePickerController()
        // Fall back to the photo library if the device somehow has no
        // camera (Simulator, iPad without a back camera). Better than
        // crashing on .camera.
        vc.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        vc.cameraCaptureMode = .photo
        vc.allowsEditing = false
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onCompletion: onCompletion) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCompletion: (UIImage?) -> Void
        init(onCompletion: @escaping (UIImage?) -> Void) {
            self.onCompletion = onCompletion
        }
        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            let image = (info[.originalImage] as? UIImage)
            onCompletion(image)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCompletion(nil)
        }
    }
}
