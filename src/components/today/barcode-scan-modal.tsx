"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ScanBarcode,
  X,
  Loader2,
  Camera,
  AlertTriangle,
  Plus,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import { useSelectedDate } from "./day-context";
import { haptic } from "@/lib/haptics";
import {
  hasNativeDetector,
  requestCamera,
  scanFromVideo,
} from "@/lib/barcode-scanner";
import {
  lookupBarcode,
  macrosFor,
  type OpenFoodFactsProduct,
} from "@/lib/open-food-facts";

type Phase =
  | { kind: "scanning" }
  | { kind: "looking-up"; barcode: string }
  | {
      kind: "not-found";
      barcode: string;
      message?: string;
    }
  | {
      kind: "camera-denied";
      reason: "denied" | "unsupported";
    }
  | {
      kind: "review";
      product: OpenFoodFactsProduct;
    };

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export function BarcodeScanModal({
  open,
  onClose,
  onFallbackManual,
  onFallbackPhoto,
}: {
  open: boolean;
  onClose: () => void;
  /** "Type it instead" callback — opens the manual-log meal modal. */
  onFallbackManual?: () => void;
  /** "Scan label / photo" — opens the photo-food modal. */
  onFallbackPhoto?: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <BarcodeScanModalBody
          onClose={onClose}
          onFallbackManual={onFallbackManual}
          onFallbackPhoto={onFallbackPhoto}
        />
      )}
    </AnimatePresence>
  );
}

function BarcodeScanModalBody({
  onClose,
  onFallbackManual,
  onFallbackPhoto,
}: {
  onClose: () => void;
  onFallbackManual?: () => void;
  onFallbackPhoto?: () => void;
}) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "scanning" });

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="absolute inset-0 flex flex-col overflow-hidden text-white"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <header className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <ScanBarcode size={16} className="text-[var(--color-accent)]" />
            <span className="text-base font-semibold tracking-tight">
              Scan a barcode
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 grid place-items-center rounded-full text-white/80 hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {phase.kind === "scanning" && (
            <ScanningScreen
              onDetected={(barcode) =>
                setPhase({ kind: "looking-up", barcode })
              }
              onCameraIssue={(reason) =>
                setPhase({ kind: "camera-denied", reason })
              }
            />
          )}
          {phase.kind === "looking-up" && (
            <LookingUpScreen
              barcode={phase.barcode}
              onResult={(product) => {
                if (product) {
                  setPhase({ kind: "review", product });
                } else {
                  setPhase({ kind: "not-found", barcode: phase.barcode });
                }
              }}
            />
          )}
          {phase.kind === "not-found" && (
            <NotFoundScreen
              barcode={phase.barcode}
              onRetry={() => setPhase({ kind: "scanning" })}
              onFallbackManual={onFallbackManual}
              onFallbackPhoto={onFallbackPhoto}
              onClose={onClose}
            />
          )}
          {phase.kind === "camera-denied" && (
            <CameraDeniedScreen
              reason={phase.reason}
              onClose={onClose}
              onFallbackManual={onFallbackManual}
              onFallbackPhoto={onFallbackPhoto}
            />
          )}
          {phase.kind === "review" && (
            <ReviewScreen
              product={phase.product}
              onSaved={() => {
                haptic("success");
                onClose();
              }}
              onCancel={() => setPhase({ kind: "scanning" })}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ScanningScreen({
  onDetected,
  onCameraIssue,
}: {
  onDetected: (barcode: string) => void;
  onCameraIssue: (reason: "denied" | "unsupported") => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [starting, setStarting] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    let mounted = true;
    (async () => {
      let stream: MediaStream;
      try {
        stream = await requestCamera();
      } catch (e) {
        if (!mounted) return;
        const reason =
          (e as Error).message === "camera_unsupported" ||
          (e as DOMException).name === "NotFoundError"
            ? "unsupported"
            : "denied";
        onCameraIssue(reason);
        return;
      }
      if (!mounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setStarting(false);

      try {
        const result = await scanFromVideo(video, controller.signal);
        if (mounted) onDetected(result.text);
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
        if (mounted) onCameraIssue("unsupported");
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onCameraIssue, onDetected]);

  return (
    <div className="relative h-full flex flex-col">
      <div className="relative flex-1 grid place-items-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />
        {/* Viewfinder overlay */}
        <div className="relative z-10 w-[78vw] max-w-[420px] aspect-[4/3] rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        {starting && (
          <div className="absolute z-20 inset-0 grid place-items-center text-white/80">
            <div className="inline-flex items-center gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Starting camera…
            </div>
          </div>
        )}
      </div>
      <div className="px-5 py-4 text-center text-[12px] text-white/80">
        Center the barcode in the box.{" "}
        {hasNativeDetector() ? "Using native detector." : "Using ZXing fallback."}
      </div>
    </div>
  );
}

function LookingUpScreen({
  barcode,
  onResult,
}: {
  barcode: string;
  onResult: (product: OpenFoodFactsProduct | null) => void;
}) {
  React.useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const p = await lookupBarcode(barcode, controller.signal);
        if (!controller.signal.aborted) onResult(p);
      } catch {
        if (!controller.signal.aborted) onResult(null);
      }
    })();
    return () => controller.abort();
  }, [barcode, onResult]);
  return (
    <div className="h-full grid place-items-center px-6 text-white/85">
      <div className="text-center space-y-2">
        <Loader2 size={28} className="animate-spin mx-auto" />
        <div className="text-sm">Looking up {barcode}…</div>
        <div className="text-[11px] text-white/50">Open Food Facts</div>
      </div>
    </div>
  );
}

function NotFoundScreen({
  barcode,
  onRetry,
  onClose,
  onFallbackManual,
  onFallbackPhoto,
}: {
  barcode: string;
  onRetry: () => void;
  onClose: () => void;
  onFallbackManual?: () => void;
  onFallbackPhoto?: () => void;
}) {
  return (
    <div className="h-full grid place-items-center px-6 text-white">
      <div className="text-center max-w-sm space-y-3">
        <AlertTriangle size={36} className="mx-auto text-[var(--color-warning)]" />
        <div className="text-base font-semibold">
          That barcode isn&rsquo;t in Open Food Facts
        </div>
        <div className="text-[12px] text-white/70 leading-relaxed">
          We found the code{" "}
          <code className="bg-white/10 px-1.5 py-0.5 rounded text-[11px]">
            {barcode}
          </code>{" "}
          but the public database doesn&rsquo;t have macros for it. Try
          another option:
        </div>
        <div className="grid gap-2 pt-2">
          <Button variant="primary" onClick={onRetry}>
            <Camera size={14} />
            Try another barcode
          </Button>
          {onFallbackPhoto && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onFallbackPhoto();
              }}
            >
              Scan the label as a photo
            </Button>
          )}
          {onFallbackManual && (
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                onFallbackManual();
              }}
            >
              Type the macros myself
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CameraDeniedScreen({
  reason,
  onClose,
  onFallbackManual,
  onFallbackPhoto,
}: {
  reason: "denied" | "unsupported";
  onClose: () => void;
  onFallbackManual?: () => void;
  onFallbackPhoto?: () => void;
}) {
  return (
    <div className="h-full grid place-items-center px-6 text-white">
      <div className="text-center max-w-sm space-y-3">
        <Camera size={36} className="mx-auto text-white/70" />
        <div className="text-base font-semibold">
          {reason === "denied"
            ? "Camera access denied"
            : "Camera not available"}
        </div>
        <div className="text-[12px] text-white/70 leading-relaxed">
          {reason === "denied" ? (
            <>
              Life OS needs camera permission to scan barcodes. Enable
              it in your browser&rsquo;s site settings, then reload the
              page.
            </>
          ) : (
            <>
              This device or browser doesn&rsquo;t support camera
              access. Try another option below.
            </>
          )}
        </div>
        <div className="grid gap-2 pt-2">
          {onFallbackPhoto && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onFallbackPhoto();
              }}
            >
              Scan the label as a photo
            </Button>
          )}
          {onFallbackManual && (
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                onFallbackManual();
              }}
            >
              Type the macros myself
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewScreen({
  product,
  onSaved,
  onCancel,
}: {
  product: OpenFoodFactsProduct;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const addMeal = useStore((s) => s.addMeal);
  const selectedDate = useSelectedDate();

  // Default to one serving (or 100g if OFF didn't report a serving size).
  const defaultGrams = product.servingSizeG && product.servingSizeG > 0
    ? product.servingSizeG
    : 100;
  const [servings, setServings] = React.useState(1);
  const [grams, setGrams] = React.useState(defaultGrams);
  const [name, setName] = React.useState(
    product.brand ? `${product.brand} — ${product.name}` : product.name
  );
  const [time, setTime] = React.useState(nowHHMM());
  const [saving, setSaving] = React.useState(false);

  const totalGrams = grams * servings;
  const computed = macrosFor(product, totalGrams);

  const save = () => {
    if (saving) return;
    setSaving(true);
    try {
      addMeal({
        date: selectedDate,
        time,
        name: name.trim() || product.name,
        calories: Math.round(computed.calories ?? 0),
        protein: Math.round(computed.protein ?? 0),
        carbs: computed.carbs !== undefined ? Math.round(computed.carbs) : undefined,
        fat: computed.fat !== undefined ? Math.round(computed.fat) : undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 pt-2 pb-24 max-w-md mx-auto space-y-5">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="h-14 w-14 rounded-lg object-cover bg-white/10"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{product.name}</div>
          {product.brand && (
            <div className="text-[11px] text-white/60 truncate">
              {product.brand}
            </div>
          )}
          <div className="text-[10px] text-white/40 tnum mt-0.5">
            barcode {product.barcode} · Open Food Facts
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] font-medium text-white/50 mb-2">
          Name
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] font-medium text-white/50 mb-2">
            Serving (g)
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={grams}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n >= 0) setGrams(n);
            }}
          />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] font-medium text-white/50 mb-2">
            Servings
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Less"
              onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
              className="h-11 w-11 grid place-items-center rounded-lg bg-white/10 hover:bg-white/15"
            >
              <Minus size={14} />
            </button>
            <div className="flex-1 text-center text-base font-medium tnum">
              {servings % 1 === 0 ? servings : servings.toFixed(1)}
            </div>
            <button
              type="button"
              aria-label="More"
              onClick={() => setServings((s) => s + 0.5)}
              className="h-11 w-11 grid place-items-center rounded-lg bg-white/10 hover:bg-white/15"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] font-medium text-white/50 mb-2">
          Time
        </div>
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[11px] uppercase tracking-[0.14em] font-medium text-white/50 mb-2">
          Macros · {Math.round(totalGrams)}g total
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Macro label="Cal" value={computed.calories} unit="" />
          <Macro label="Protein" value={computed.protein} unit="g" />
          <Macro label="Carbs" value={computed.carbs} unit="g" />
          <Macro label="Fat" value={computed.fat} unit="g" />
        </div>
        {Object.values(computed).every((v) => v === undefined) && (
          <p className="mt-3 text-[11px] text-[var(--color-warning)]">
            Open Food Facts didn&rsquo;t have macros for this product —
            consider scanning the label as a photo instead.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sticky bottom-0 pb-4 -mx-5 px-5 bg-gradient-to-t from-black via-black/90 to-transparent pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Scan another
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || (computed.calories === undefined && computed.protein === undefined)}
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save meal"
          )}
        </Button>
      </div>
    </div>
  );
}

function Macro({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | undefined;
  unit: string;
}) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-2">
      <div className="text-[10px] text-white/50">{label}</div>
      <div className="text-sm font-medium tnum">
        {value === undefined ? "—" : Math.round(value)}
        <span className="text-[10px] text-white/40">{unit}</span>
      </div>
    </div>
  );
}
