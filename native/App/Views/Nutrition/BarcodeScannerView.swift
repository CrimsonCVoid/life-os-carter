import SwiftUI
import VisionKit
import AVFoundation

/// Live-camera barcode scanner. Wraps VisionKit's
/// `DataScannerViewController` which Apple ships for exactly this. Only
/// supports EAN-8/13 and UPC-A/E (food barcodes — no QR clutter).
///
/// Sends each scanned code through `onScan`; the caller dismisses the
/// sheet and runs the OpenFoodFacts lookup. We don't deduplicate codes
/// — DataScannerViewController already coalesces detections.
@MainActor
struct BarcodeScannerView: UIViewControllerRepresentable {
    var onScan: (String) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [
                .barcode(symbologies: [.ean13, .ean8, .upce])
            ],
            qualityLevel: .accurate,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        if !vc.isScanning {
            try? vc.startScanning()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan, onCancel: onCancel)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void
        let onCancel: () -> Void
        private var handled = false

        init(onScan: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
            self.onScan = onScan
            self.onCancel = onCancel
        }

        func dataScanner(_ scanner: DataScannerViewController, didAdd added: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !handled else { return }
            for item in added {
                if case .barcode(let code) = item, let payload = code.payloadStringValue {
                    handled = true
                    onScan(payload)
                    return
                }
            }
        }
    }
}

/// SwiftUI wrapper that gates the scanner behind the device's
/// "is this even supported?" check. iPhone XS and newer support
/// DataScannerViewController; everything else gets an inline error.
struct BarcodeScannerSheet: View {
    var onResult: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                BarcodeScannerView(
                    onScan: { code in
                        Haptics.success()
                        onResult(code)
                        dismiss()
                    },
                    onCancel: { dismiss() }
                )
                .ignoresSafeArea()
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(LifeOSColor.warning)
                    Text("Barcode scanning isn't available on this device.")
                        .font(.system(size: 14))
                        .foregroundStyle(LifeOSColor.fg2)
                        .multilineTextAlignment(.center)
                    Button("Close") { dismiss() }
                        .foregroundStyle(LifeOSColor.accent)
                }
                .padding(32)
            }
            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.black.opacity(0.55)))
                    }
                    Spacer()
                    Text("Scan a barcode")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Capsule().fill(.black.opacity(0.55)))
                    Spacer()
                    Color.clear.frame(width: 36, height: 36)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                Spacer()
            }
        }
    }
}
