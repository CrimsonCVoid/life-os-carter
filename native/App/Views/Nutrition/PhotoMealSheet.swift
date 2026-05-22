import SwiftUI
import PhotosUI

/// PhotosPicker-driven flow for the "Photo" quick action. User picks
/// (or just-took) a photo, we ship it to `/api/food-photo` and route
/// the parsed payload to the review sheet.
struct PhotoMealSheet: View {
    var onResult: (MealCapturePayload) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var pickerItem: PhotosPickerItem?
    @State private var stage: Stage = .picking
    @State private var errorText: String?
    @State private var previewImage: UIImage?

    enum Stage { case picking, uploading }

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

            VStack(spacing: 20) {
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

                Group {
                    if stage == .uploading {
                        HStack(spacing: 10) {
                            ProgressView().tint(LifeOSColor.accent)
                            Text("Estimating macros…")
                                .foregroundStyle(LifeOSColor.fg2)
                        }
                    } else if let err = errorText {
                        Text(err)
                            .font(.system(size: 13))
                            .foregroundStyle(LifeOSColor.danger)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    } else {
                        PhotosPicker(
                            selection: $pickerItem,
                            matching: .images,
                            photoLibrary: .shared()
                        ) {
                            HStack(spacing: 8) {
                                Image(systemName: "photo.on.rectangle.angled")
                                Text(previewImage == nil ? "Choose a photo" : "Pick a different photo")
                                    .fontWeight(.semibold)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 12)
                            .background(
                                Capsule().fill(LifeOSColor.accent)
                            )
                            .shadow(color: LifeOSColor.accent.opacity(0.35), radius: 12, x: 0, y: 6)
                        }
                    }
                }
                .frame(height: 60)
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .onChange(of: pickerItem) { _, newItem in
            guard let newItem else { return }
            Task { await ingest(item: newItem) }
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(LifeOSColor.card)
            .overlay(
                VStack(spacing: 8) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(LifeOSColor.fg3)
                    Text("Pick a photo of your meal")
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

    @MainActor
    private func ingest(item: PhotosPickerItem) async {
        errorText = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                errorText = "Couldn't read that photo."
                return
            }
            previewImage = image
            stage = .uploading
            Haptics.tap()
            let payload: MealCapturePayload = try await APIClient.shared.uploadJPEG(
                "/api/food-photo",
                image: image,
                fieldName: "photo",
                as: MealCapturePayload.self
            )
            onResult(payload)
            dismiss()
        } catch {
            stage = .picking
            errorText = "Upload failed: \(error.localizedDescription)"
        }
    }
}
