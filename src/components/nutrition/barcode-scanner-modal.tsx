"use client";

import * as React from "react";
import { ScanLine } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
};

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type CameraState =
  | "idle"
  | "starting"
  | "running"
  | "denied"
  | "unsupported"
  | "error";

type Engine = "native" | "zxing" | null;

// Subset of zxing-wasm v3 reader API we actually call. Typed locally to avoid
// dragging the module type at the top level (it's dynamic-imported).
type ZXingReadResult = { text?: string; isValid?: boolean };
type ZXingReader = (
  input: ImageData,
  options?: { formats?: string[]; tryHarder?: boolean; maxNumberOfSymbols?: number }
) => Promise<ZXingReadResult[]>;

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

const ZXING_FORMATS = ["EAN-13", "EAN-8", "UPC-A", "UPC-E", "Code128", "Code39", "ITF"];

const SCAN_INTERVAL_MS = 500;
const ZXING_SCAN_INTERVAL_MS = 700;
const SCAN_WIDTH = 640;
const SCAN_HEIGHT = 480;
const MANUAL_RE = /^\d{8,14}$/;

function getNativeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return ctor ?? null;
}

export function BarcodeScannerModal({ open, onClose, onDetected }: Props) {
  const nativeCtor = React.useMemo(getNativeDetector, []);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const intervalRef = React.useRef<number | null>(null);
  const nativeDetectorRef = React.useRef<BarcodeDetectorLike | null>(null);
  const zxingReadRef = React.useRef<ZXingReader | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const firedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);

  const [engine, setEngine] = React.useState<Engine>(null);
  const [cameraState, setCameraState] = React.useState<CameraState>("idle");
  const [manual, setManual] = React.useState("");
  const [manualError, setManualError] = React.useState<string | null>(null);

  const fire = React.useCallback(
    (code: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      haptic("success");
      onDetected(code);
      onClose();
    },
    [onDetected, onClose]
  );

  const stopCamera = React.useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    inFlightRef.current = false;
  }, []);

  React.useEffect(() => {
    if (!open) {
      firedRef.current = false;
      setManual("");
      setManualError(null);
      stopCamera();
      setCameraState("idle");
      return;
    }

    let cancelled = false;
    setCameraState("starting");

    (async () => {
      // 1. Pick the scanning engine.
      let chosenEngine: Engine = nativeCtor ? "native" : null;

      if (chosenEngine === "native" && nativeCtor) {
        nativeDetectorRef.current = new nativeCtor({ formats: NATIVE_FORMATS });
      } else {
        try {
          const mod = await import("zxing-wasm/reader");
          // Warm the WASM so the first scan isn't slow. Defaults to a
          // jsdelivr-hosted .wasm in v3 — no extra config needed.
          if (typeof mod.prepareZXingModule === "function") {
            try {
              await mod.prepareZXingModule({ fireImmediately: true });
            } catch {
              /* prepare can throw in older v3 patches if called twice; non-fatal */
            }
          }
          if (cancelled) return;
          zxingReadRef.current = mod.readBarcodes as unknown as ZXingReader;
          chosenEngine = "zxing";
        } catch (err) {
          if (cancelled) return;
          console.error("zxing-wasm load failed", err);
          setCameraState("unsupported");
          return;
        }
      }

      if (cancelled) return;
      setEngine(chosenEngine);

      // 2. Start the camera.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setCameraState("denied");
        } else {
          setCameraState("error");
        }
        return;
      }
      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* iOS will sometimes reject the first play() — the user-gesture
             that opened the modal should cover us, but we don't fail if not */
        }
      }
      setCameraState("running");

      // 3. Start the scan loop.
      const interval =
        chosenEngine === "native" ? SCAN_INTERVAL_MS : ZXING_SCAN_INTERVAL_MS;
      intervalRef.current = window.setInterval(() => {
        if (inFlightRef.current || firedRef.current) return;
        void scanOnce(chosenEngine).catch(() => undefined);
      }, interval);
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nativeCtor]);

  const scanOnce = React.useCallback(async (engineMode: Engine) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    inFlightRef.current = true;
    try {
      if (engineMode === "native") {
        const det = nativeDetectorRef.current;
        if (!det) return;
        const results = await det.detect(video);
        if (results.length > 0 && results[0].rawValue) {
          fire(results[0].rawValue);
        }
        return;
      }
      if (engineMode === "zxing") {
        const reader = zxingReadRef.current;
        if (!reader) return;
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement("canvas");
          canvasRef.current = canvas;
        }
        canvas.width = SCAN_WIDTH;
        canvas.height = SCAN_HEIGHT;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, SCAN_WIDTH, SCAN_HEIGHT);
        const imageData = ctx.getImageData(0, 0, SCAN_WIDTH, SCAN_HEIGHT);
        const results = await reader(imageData, {
          formats: ZXING_FORMATS,
          tryHarder: true,
          maxNumberOfSymbols: 1,
        });
        const hit = results.find(
          (r) => r.text && (r.isValid ?? true)
        );
        if (hit?.text) fire(hit.text);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [fire]);

  const submitManual = () => {
    const value = manual.trim();
    if (!MANUAL_RE.test(value)) {
      setManualError("Enter 8–14 digits");
      haptic("warn");
      return;
    }
    setManualError(null);
    fire(value);
  };

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode" size="md">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-control)]",
              "bg-[var(--color-elevated)] border border-[var(--color-stroke)]"
            )}
          >
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
            />
            <ScannerOverlay state={cameraState} engine={engine} />
          </div>
          <p className="text-[12px] text-[var(--color-fg-2)] text-center">
            {cameraStateLabel(cameraState, engine)}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
            Or enter manually
          </span>
          <div className="flex items-stretch gap-2">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 0049000028911"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value.replace(/\D/g, "").slice(0, 14));
                if (manualError) setManualError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitManual();
              }}
            />
            <Button size="default" variant="primary" onClick={submitManual}>
              Use
            </Button>
          </div>
          {manualError && (
            <span className="text-[12px] text-[var(--color-danger)]">
              {manualError}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

function cameraStateLabel(state: CameraState, engine: Engine): string {
  switch (state) {
    case "starting":
      return engine === "zxing"
        ? "Loading scanner…"
        : "Starting camera…";
    case "running":
      return engine === "zxing"
        ? "Hold steady — ZXing scanner running"
        : "Hold the barcode in the frame";
    case "denied":
      return "Camera permission denied — use manual entry below";
    case "unsupported":
      return "Couldn't load scanner — use manual entry below";
    case "error":
      return "Camera failed to start — use manual entry below";
    default:
      return "Preparing…";
  }
}

function ScannerOverlay({
  state,
  engine,
}: {
  state: CameraState;
  engine: Engine;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative h-[58%] w-[78%]">
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
          {state === "running" && (
            <div
              className="absolute left-2 right-2 h-[2px] rounded-full animate-pulse"
              style={{
                top: "50%",
                background:
                  "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
                boxShadow: "0 0 12px var(--color-accent)",
              }}
            />
          )}
        </div>
      </div>
      {state !== "running" && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[12px] text-white">
            <ScanLine size={14} />
            {cameraStateLabel(state, engine)}
          </div>
        </div>
      )}
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute h-5 w-5 border-[var(--color-accent)]";
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t-2 border-l-2 rounded-tl-md",
    tr: "top-0 right-0 border-t-2 border-r-2 rounded-tr-md",
    bl: "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md",
    br: "bottom-0 right-0 border-b-2 border-r-2 rounded-br-md",
  };
  return <span className={cn(base, map[pos])} />;
}
