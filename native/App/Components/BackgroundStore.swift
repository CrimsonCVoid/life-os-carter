import UIKit

/// Filesystem persistence for the user's photo background. Images live
/// in Application Support (not SwiftData) — large blobs don't belong in
/// the store; SwiftData only keeps the filename key. This is the single
/// place that touches disk for backgrounds.
enum BackgroundStore {
    /// Longest edge we downscale picked images to. A phone background
    /// never needs more than this, and it keeps the on-disk file small
    /// and the blur cheap to render.
    private static let maxDimension: CGFloat = 2000
    private static let jpegQuality: CGFloat = 0.8

    /// Application Support subdirectory, created on first access.
    static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Backgrounds", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    static func url(for filename: String) -> URL {
        directory.appendingPathComponent(filename, isDirectory: false)
    }

    /// Downscale + recompress to JPEG and write under a fresh uuid name.
    /// Returns the filename to persist, or nil if the bytes failed to
    /// decode (PhotosPicker can hand back data we can't render).
    static func save(_ data: Data) -> String? {
        guard let image = UIImage(data: data) else { return nil }
        let scaled = downscale(image)
        guard let jpeg = scaled.jpegData(compressionQuality: jpegQuality) else { return nil }
        let filename = "\(UUID().uuidString).jpg"
        do {
            try jpeg.write(to: url(for: filename), options: .atomic)
            return filename
        } catch {
            return nil
        }
    }

    static func image(for filename: String?) -> UIImage? {
        guard let filename else { return nil }
        guard let data = try? Data(contentsOf: url(for: filename)) else { return nil }
        return UIImage(data: data)
    }

    static func delete(_ filename: String?) {
        guard let filename else { return }
        try? FileManager.default.removeItem(at: url(for: filename))
    }

    /// Fit the image inside `maxDimension` on its longest edge,
    /// preserving aspect ratio. No-op if already small enough.
    private static func downscale(_ image: UIImage) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > maxDimension else { return image }
        let scale = maxDimension / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
