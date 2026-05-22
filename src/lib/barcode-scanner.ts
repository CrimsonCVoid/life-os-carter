/**
 * Barcode detection abstraction. Two backends, picked at runtime:
 *
 *  1. Native `BarcodeDetector` — Chrome, Edge, Samsung Internet, recent
 *     Android Chrome. Fastest, zero JS overhead.
 *  2. `@zxing/library` — pure-JS fallback for Safari (mobile + desktop)
 *     and Firefox. MIT-licensed, dependency-free at runtime.
 *
 * Both backends scan a single MediaStream (the user's camera) and emit
 * the first valid barcode they see, then stop. Callers don't need to
 * know which one fired.
 */

export type ScanResult = {
  text: string;
  /** EAN_13, UPC_A, CODE_128, etc. — informational only. */
  format: string;
};

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect(source: ImageBitmapSource): Promise<
    Array<{ rawValue: string; format: string }>
  >;
};

export function hasNativeDetector(): boolean {
  if (typeof window === "undefined") return false;
  return "BarcodeDetector" in window;
}

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
];

/**
 * Start scanning. Resolves with the first detected code, or rejects on
 * camera-access failure / abort. Caller is responsible for tearing down
 * the MediaStream tracks when the returned promise settles.
 */
export async function scanFromVideo(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<ScanResult> {
  if (hasNativeDetector()) {
    return scanWithNative(video, signal);
  }
  return scanWithZxing(video, signal);
}

async function scanWithNative(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<ScanResult> {
  const Ctor = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  ).BarcodeDetector;
  if (!Ctor) throw new Error("BarcodeDetector unavailable");
  const detector = new Ctor({ formats: FORMATS });

  return new Promise<ScanResult>((resolve, reject) => {
    let stopped = false;
    const onAbort = () => {
      stopped = true;
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    const tick = async () => {
      if (stopped) return;
      try {
        const results = await detector.detect(video);
        if (results.length > 0) {
          stopped = true;
          signal.removeEventListener("abort", onAbort);
          resolve({ text: results[0].rawValue, format: results[0].format });
          return;
        }
      } catch {
        // Transient detect errors — try the next frame.
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function scanWithZxing(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<ScanResult> {
  // Lazy import keeps zxing out of the initial bundle.
  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } =
    await import("@zxing/library");

  // Limit the decoder to the formats food labels actually use. Without
  // hints, BrowserMultiFormatReader walks every decoder per frame, which
  // is what made the scan feel broken on lower-end iPhones — frames
  // arrived but each one took 200+ms to process so a held-still barcode
  // never landed in the active frame.
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const reader = new BrowserMultiFormatReader(hints, 250);

  return new Promise<ScanResult>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reader.reset();
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    // Continuous callback pattern — fires every decoded frame. Reliable
    // when the parent has already attached a MediaStream to the video
    // element (which we do — see ScanningScreen useEffect). The promise
    // version (decodeFromVideoElement) is flaky with pre-attached
    // streams in 0.23.
    try {
      reader.decodeFromVideoElementContinuously(video, (result, err) => {
        if (settled) return;
        if (result) {
          settled = true;
          signal.removeEventListener("abort", onAbort);
          reader.reset();
          resolve({
            text: result.getText(),
            format: result.getBarcodeFormat?.()?.toString() ?? "unknown",
          });
          return;
        }
        // err is NotFoundException on every frame without a barcode —
        // expected, just keep scanning. Only surface "checksum" / "format"
        // exceptions if they persist (caller's AbortController will
        // eventually fire when the user closes the modal).
        void err;
      });
    } catch (e) {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reader.reset();
      reject(e);
    }
  });
}

/**
 * Request the user's camera with a back-facing preference. Returns the
 * MediaStream so callers can attach to a <video> and later stop tracks.
 * Throws on permission denial or no camera.
 */
export async function requestCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("camera_unsupported");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}
