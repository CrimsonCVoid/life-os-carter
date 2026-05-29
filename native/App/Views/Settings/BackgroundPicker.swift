import SwiftUI
import SwiftData
import PhotosUI

/// Settings detail for the app background. Two choices — an animated
/// gradient ("Animated"/mesh) or a user photo behind a heavy blur
/// ("Photo"). The photo path picks an image via PhotosPicker, persists
/// it to disk through `BackgroundStore`, and exposes a blur/scrim
/// intensity slider with a live blurred preview.
///
/// Self-contained: loads the singleton UserSettings row itself so the
/// integrator only has to push this view from Settings. Image bytes
/// never enter SwiftData — only the filename key does.
struct BackgroundPicker: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var settingsRows: [UserSettings]

    @State private var pickerItem: PhotosPickerItem?
    @State private var loadFailed = false

    private var settings: UserSettings {
        settingsRows.first ?? UserSettings.loadOrCreate(in: modelContext)
    }

    private var isPhoto: Bool { settings.backgroundStyle == "photo" }

    var body: some View {
        @Bindable var bound = settings
        return ScrollView {
            VStack(spacing: 16) {
                styleCard
                if isPhoto {
                    photoCard(bound: bound)
                }
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("Background")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: pickerItem) { _, newItem in
            guard let newItem else { return }
            Task { await ingest(newItem) }
        }
        .alert("Couldn't use that image", isPresented: $loadFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("That photo couldn't be read. Try a different one.")
        }
    }

    // MARK: - Style choice

    private var styleCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("STYLE")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                Text("Choose what sits behind the glass. A photo is rendered under a heavy blur so cards and text stay readable.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                HStack(spacing: 10) {
                    styleOption(
                        title: "Animated",
                        subtitle: "Drifting gradient",
                        icon: "sparkles",
                        active: !isPhoto
                    ) { selectMesh() }
                    styleOption(
                        title: "Photo",
                        subtitle: "Your image, blurred",
                        icon: "photo.fill",
                        active: isPhoto
                    ) { selectPhoto() }
                }
            }
        }
    }

    private func styleOption(
        title: String,
        subtitle: String,
        icon: String,
        active: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(active ? LifeOSColor.accent : LifeOSColor.fg2)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(active ? LifeOSColor.fg : LifeOSColor.fg2)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill((active ? LifeOSColor.accent : LifeOSColor.fg3).opacity(0.10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke((active ? LifeOSColor.accent : LifeOSColor.stroke).opacity(active ? 0.5 : 1), lineWidth: active ? 1 : 0.5)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Photo controls

    private func photoCard(bound: UserSettings) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                Text("PHOTO")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)

                preview

                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    HStack(spacing: 10) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 15, weight: .semibold))
                        Text(settings.backgroundImageFilename == nil ? "Choose photo" : "Replace photo")
                            .font(.system(size: 14, weight: .semibold))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    .foregroundStyle(LifeOSColor.accent)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(LifeOSColor.accent.opacity(0.12))
                    )
                }
                .buttonStyle(.plain)

                if settings.backgroundImageFilename != nil {
                    intensityControl(bound: bound)
                    removeButton
                }
            }
        }
    }

    @ViewBuilder
    private var preview: some View {
        let blurRadius = 18 + 42 * settings.backgroundIntensity
        let scrimOpacity = 0.45 + 0.37 * settings.backgroundIntensity
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(LifeOSColor.elevated)
            .frame(height: 150)
            .overlay {
                if let image = BackgroundStore.image(for: settings.backgroundImageFilename) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .blur(radius: blurRadius, opaque: true)
                        .overlay(LifeOSColor.base.opacity(scrimOpacity))
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "photo")
                            .font(.system(size: 22))
                            .foregroundStyle(LifeOSColor.fg3)
                        Text("No photo yet")
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(LifeOSColor.stroke, lineWidth: 0.5)
            )
    }

    private func intensityControl(bound boundSettings: UserSettings) -> some View {
        // @Bindable on the parameter so the Slider can write straight back
        // into the SwiftData model.
        @Bindable var bound = boundSettings
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Blur intensity")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(LifeOSColor.fg2)
                Spacer()
                Text("\(Int(settings.backgroundIntensity * 100))%")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg)
            }
            Slider(value: $bound.backgroundIntensity, in: 0...1)
                .tint(LifeOSColor.accent)
                .onChange(of: bound.backgroundIntensity) { _, _ in
                    try? modelContext.save()
                }
        }
    }

    private var removeButton: some View {
        Button(role: .destructive) {
            removePhoto()
        } label: {
            Text("Remove photo")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func selectMesh() {
        Haptics.tick()
        settings.backgroundStyle = "mesh"
        try? modelContext.save()
    }

    private func selectPhoto() {
        Haptics.tick()
        settings.backgroundStyle = "photo"
        try? modelContext.save()
    }

    @MainActor
    private func ingest(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let filename = BackgroundStore.save(data) else {
            loadFailed = true
            Haptics.error()
            return
        }
        // Drop the previous file before overwriting the key so we don't
        // orphan blobs on disk.
        BackgroundStore.delete(settings.backgroundImageFilename)
        settings.backgroundImageFilename = filename
        settings.backgroundStyle = "photo"
        try? modelContext.save()
        Haptics.success()
    }

    private func removePhoto() {
        Haptics.warning()
        BackgroundStore.delete(settings.backgroundImageFilename)
        settings.backgroundImageFilename = nil
        settings.backgroundStyle = "mesh"
        try? modelContext.save()
    }
}
