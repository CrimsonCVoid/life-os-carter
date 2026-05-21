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

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

type CameraState = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

const SCAN_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

const MANUAL_RE = /^\d{8,14}$/;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return ctor ?? null;
}

export function BarcodeScannerModal({ open, onClose, onDetected }: Props) {
  const detectorCtor = React.useMemo(getBarcodeDetector, []);
  const supportsCamera = detectorCtor !== null;

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const intervalRef = React.useRef<number | null>(null);
  const detectorRef = React.useRef<BarcodeDetectorLike | null>(null);
  const firedRef = React.useRef(false);

  const [cameraState, setCameraState] = React.useState<CameraState>(
    supportsCamera ? "idle" : "unsupported"
  );
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
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      firedRef.current = false;
      setManual("");
      setManualError(null);
      stopCamera();
      if (supportsCamera) setCameraState("idle");
      return;
    }
    if (!supportsCamera) {
      setCameraState("unsupported");
      return;
    }

    let cancelled = false;
    setCameraState("starting");
    detectorRef.current = detectorCtor
      ? new detectorCtor({ formats: SCAN_FORMATS })
      : null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
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
          await video.play().catch(() => undefined);
        }
        setCameraState("running");

        intervalRef.current = window.setInterval(async () => {
          const det = detectorRef.current;
          const v = videoRef.current;
          if (!det || !v || v.readyState < 2) return;
          try {
            const results = await det.detect(v);
            if (results.length > 0 && results[0].rawValue) {
              fire(results[0].rawValue);
            }
          } catch {
            /* transient detection errors are fine */
          }
        }, 500);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setCameraState("denied");
        } else {
          setCameraState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, supportsCamera, detectorCtor, fire, stopCamera]);

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
        {supportsCamera ? (
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
              <ScannerOverlay state={cameraState} />
            </div>
            <p className="text-[12px] text-[var(--color-fg-2)] text-center">
              {cameraStateLabel(cameraState)}
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-control)] border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-4 text-[13px] text-[var(--color-fg-2)] leading-snug">
            Camera scanning isn’t supported in this browser. Enter the barcode
            number below.
          </div>
        )}

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

function cameraStateLabel(state: CameraState): string {
  switch (state) {
    case "starting":
      return "Starting camera…";
    case "running":
      return "Hold the barcode in the frame";
    case "denied":
      return "Camera permission denied — use manual entry below";
    case "unsupported":
      return "Camera scanning unavailable on this device";
    case "error":
      return "Couldn’t start camera — use manual entry below";
    default:
      return "Preparing…";
  }
}

function ScannerOverlay({ state }: { state: CameraState }) {
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
              className="absolute left-2 right-2 h-[2px] rounded-full"
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
            {cameraStateLabel(state)}
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
