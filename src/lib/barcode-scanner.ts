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
  const { BrowserMultiFormatReader } = await import("@zxing/library");
  const reader = new BrowserMultiFormatReader();

  // `decodeFromVideoElement` resolves on the first detected barcode and
  // rejects when reset() is called — that's how we hook the abort
  // signal up to the otherwise-opaque scan loop.
  const onAbort = () => reader.reset();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    const result = await reader.decodeFromVideoElement(video);
    return {
      text: result.getText(),
      format: result.getBarcodeFormat?.()?.toString() ?? "unknown",
    };
  } catch (e) {
    if (signal.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    throw e;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.reset();
  }
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
