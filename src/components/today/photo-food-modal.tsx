"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Camera,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/textarea";
import { ToggleRow } from "@/components/ui/toggle";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { uid, cn } from "@/lib/utils";
import { saveMealPhoto } from "@/lib/meal-photo-store";
import { compressImage } from "@/lib/photo-store";
import type { Meal, MealAiAnalysis } from "@/lib/types";
import type { FoodPhotoPayload } from "@/app/api/food-photo/route";

const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.85;
const THUMB_WIDTH = 80;

type Phase =
  | { kind: "capture" }
  | { kind: "preview"; blob: Blob; objectUrl: string }
  | { kind: "processing"; blob: Blob; objectUrl: string }
  | {
      kind: "upload-error";
      blob: Blob;
      objectUrl: string;
      message: string;
    }
  | { kind: "not-food"; blob: Blob; objectUrl: string; notes: string }
  | {
      kind: "review";
      blob: Blob;
      objectUrl: string;
      review: ReviewState;
    };

type ReviewItem = {
  id: string;
  name: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type ReviewState = {
  name: string;
  confidence: "high" | "medium" | "low";
  items: ReviewItem[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  notes: string;
  time: string; // HH:MM
  totalsManual: boolean;
};

export function PhotoFoodModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && <PhotoFoodModalBody onClose={onClose} />}
    </AnimatePresence>
  );
}

function PhotoFoodModalBody({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "capture" });

  // Revoke any object URLs we created when we move past them
  const prevUrlRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const current =
      phase.kind === "preview" ||
      phase.kind === "processing" ||
      phase.kind === "upload-error" ||
      phase.kind === "not-food" ||
      phase.kind === "review"
        ? phase.objectUrl
        : null;
    const prev = prevUrlRef.current;
    if (prev && prev !== current) URL.revokeObjectURL(prev);
    prevUrlRef.current = current;
  }, [phase]);
  React.useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

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

  const handleAnalyzed = (
    blob: Blob,
    objectUrl: string,
    payload: FoodPhotoPayload
  ) => {
    if (!payload.isFood) {
      setPhase({
        kind: "not-food",
        blob,
        objectUrl,
        notes:
          payload.notes ||
          "I don't see food in this photo — try another shot, or log manually.",
      });
      return;
    }
    setPhase({
      kind: "review",
      blob,
      objectUrl,
      review: payloadToReview(payload),
    });
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-[var(--color-bg)]/95 backdrop-blur-md"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <header className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-[var(--color-accent)]" />
            <span className="text-base font-semibold tracking-tight">
              Photo a meal
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 grid place-items-center rounded-full text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto nice-scroll">
          {phase.kind === "capture" && (
            <CaptureScreen
              onCaptured={(blob, url) =>
                setPhase({ kind: "preview", blob, objectUrl: url })
              }
              onCancel={onClose}
            />
          )}
          {phase.kind === "preview" && (
            <PreviewScreen
              objectUrl={phase.objectUrl}
              onRetake={() => setPhase({ kind: "capture" })}
              onAnalyze={() =>
                setPhase({
                  kind: "processing",
                  blob: phase.blob,
                  objectUrl: phase.objectUrl,
                })
              }
            />
          )}
          {phase.kind === "processing" && (
            <ProcessingScreen
              blob={phase.blob}
              objectUrl={phase.objectUrl}
              onDone={(p) =>
                handleAnalyzed(phase.blob, phase.objectUrl, p)
              }
              onError={(message) =>
                setPhase({
                  kind: "upload-error",
                  blob: phase.blob,
                  objectUrl: phase.objectUrl,
                  message,
                })
              }
            />
          )}
          {phase.kind === "upload-error" && (
            <UploadErrorScreen
              message={phase.message}
              objectUrl={phase.objectUrl}
              onRetry={() =>
                setPhase({
                  kind: "processing",
                  blob: phase.blob,
                  objectUrl: phase.objectUrl,
                })
              }
              onManual={onClose}
              onCancel={onClose}
            />
          )}
          {phase.kind === "not-food" && (
            <NotFoodScreen
              notes={phase.notes}
              objectUrl={phase.objectUrl}
              onRetake={() => setPhase({ kind: "capture" })}
              onClose={onClose}
            />
          )}
          {phase.kind === "review" && (
            <ReviewScreen
              blob={phase.blob}
              objectUrl={phase.objectUrl}
              initial={phase.review}
              onSaved={onClose}
              onCancel={onClose}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function payloadToReview(p: FoodPhotoPayload): ReviewState {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  return {
    name: p.suggestedMealName || "Meal",
    confidence: p.overallConfidence,
    items: p.identifiedItems.map((it) => ({
      id: uid(),
      name: it.name,
      estimatedGrams: Math.max(0, Math.round(it.estimatedGrams)),
      calories: Math.max(0, Math.round(it.calories)),
      proteinG: Math.max(0, Math.round(it.proteinG)),
      carbsG: Math.max(0, Math.round(it.carbsG)),
      fatG: Math.max(0, Math.round(it.fatG)),
    })),
    totals: {
      calories: Math.max(0, Math.round(p.totals.calories)),
      proteinG: Math.max(0, Math.round(p.totals.proteinG)),
      carbsG: Math.max(0, Math.round(p.totals.carbsG)),
      fatG: Math.max(0, Math.round(p.totals.fatG)),
    },
    notes: p.notes,
    time,
    totalsManual: false,
  };
}

/* ---------- Capture ---------- */

function CaptureScreen({
  onCaptured,
  onCancel,
}: {
  onCaptured: (blob: Blob, objectUrl: string) => void;
  onCancel: () => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fired = React.useRef(false);

  React.useEffect(() => {
    // Open native camera immediately on mount — feels like the camera tab
    if (fired.current) return;
    fired.current = true;
    // small delay so the modal animates in first
    const t = window.setTimeout(() => fileRef.current?.click(), 200);
    return () => window.clearTimeout(t);
  }, []);

  const onPick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const compressed = await compressImage(file, MAX_WIDTH, JPEG_QUALITY);
      const url = URL.createObjectURL(compressed);
      onCaptured(compressed, url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't read that image."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <Camera size={36} className="text-[var(--color-fg-3)] mb-4" />
      <div className="text-base font-semibold">
        {busy ? "Reading photo…" : "Pick a photo of your meal"}
      </div>
      <div className="text-sm text-[var(--color-fg-2)] max-w-xs mt-1">
        Camera opens automatically. Use “Choose photo” to pick from your
        library instead.
      </div>
      {error && (
        <div className="mt-3 text-sm text-[var(--color-danger)]">{error}</div>
      )}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          <Camera size={14} />
          Choose photo
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

/* ---------- Preview ---------- */

function PreviewScreen({
  objectUrl,
  onRetake,
  onAnalyze,
}: {
  objectUrl: string;
  onRetake: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="h-full flex flex-col px-5 pb-4">
      <div className="flex-1 grid place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt="Preview"
          className="max-h-[60vh] w-full object-contain rounded-xl bg-[var(--color-elevated)]"
        />
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onRetake}>
          <Camera size={14} />
          Retake
        </Button>
        <Button onClick={onAnalyze}>
          <Save size={14} />
          Analyze
        </Button>
      </div>
    </div>
  );
}

/* ---------- Processing ---------- */

const STATUS_STEPS = [
  "Reading photo…",
  "Identifying ingredients…",
  "Estimating portions…",
];

function ProcessingScreen({
  blob,
  objectUrl,
  onDone,
  onError,
}: {
  blob: Blob;
  objectUrl: string;
  onDone: (p: FoodPhotoPayload) => void;
  onError: (message: string) => void;
}) {
  const [step, setStep] = React.useState(0);
  const fired = React.useRef(false);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % STATUS_STEPS.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        const form = new FormData();
        form.append("image", blob, "meal.jpg");
        const res = await fetch("/api/food-photo", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          onError(
            (body && typeof body.message === "string" && body.message) ||
              `Server returned ${res.status}.`
          );
          return;
        }
        const payload = (await res.json()) as FoodPhotoPayload;
        haptic("success");
        onDone(payload);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Network error.");
      }
    })();
  }, [blob, onDone, onError]);

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={objectUrl}
        alt=""
        className="h-24 w-24 rounded-xl object-cover mb-4 opacity-70"
      />
      <div className="relative h-12 w-12 mb-4">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-[var(--color-accent)]/30"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-1 rounded-full border-2 border-[var(--color-accent)]/60"
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0.2, 0.7] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.25,
          }}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-[var(--color-fg-2)]"
        >
          {STATUS_STEPS[step]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------- Errors ---------- */

function UploadErrorScreen({
  message,
  objectUrl,
  onRetry,
  onManual,
  onCancel,
}: {
  message: string;
  objectUrl: string;
  onRetry: () => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={objectUrl}
        alt=""
        className="h-24 w-24 rounded-xl object-cover mb-4 opacity-60"
      />
      <div className="text-base font-semibold mb-1">Something went wrong</div>
      <div className="text-sm text-[var(--color-fg-2)] max-w-sm">{message}</div>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
        <Button onClick={onRetry}>
          <RefreshCw size={14} />
          Try again
        </Button>
        <Button variant="secondary" onClick={onManual}>
          Log manually instead
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function NotFoodScreen({
  notes,
  objectUrl,
  onRetake,
  onClose,
}: {
  notes: string;
  objectUrl: string;
  onRetake: () => void;
  onClose: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={objectUrl}
        alt=""
        className="h-24 w-24 rounded-xl object-cover mb-4 opacity-60"
      />
      <div className="text-base font-semibold mb-1">No food detected</div>
      <div className="text-sm text-[var(--color-fg-2)] max-w-sm">{notes}</div>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
        <Button onClick={onRetake}>
          <Camera size={14} />
          Take another photo
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/* ---------- Review ---------- */

const CONF_TONE: Record<"high" | "medium" | "low", "success" | "warn" | "danger"> = {
  high: "success",
  medium: "warn",
  low: "danger",
};

const CONF_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

function sumItems(items: ReviewItem[]) {
  return items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      proteinG: acc.proteinG + it.proteinG,
      carbsG: acc.carbsG + it.carbsG,
      fatG: acc.fatG + it.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

function ReviewScreen({
  blob,
  objectUrl,
  initial,
  onSaved,
  onCancel,
}: {
  blob: Blob;
  objectUrl: string;
  initial: ReviewState;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const addMeal = useStore((s) => s.addMeal);
  const saveMealPhotos = useStore((s) => s.settings.photoFood.saveMealPhotos);
  const autoFillName = useStore((s) => s.settings.photoFood.autoFillName);

  const [state, setState] = React.useState<ReviewState>(() => ({
    ...initial,
    name: autoFillName ? initial.name : "",
  }));
  const [confInfoOpen, setConfInfoOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Recompute totals from items unless user has opted into manual override
  React.useEffect(() => {
    if (state.totalsManual) return;
    const t = sumItems(state.items);
    setState((s) => ({ ...s, totals: t }));
  }, [state.items, state.totalsManual]);

  const editItem = (id: string, patch: Partial<ReviewItem>) =>
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));

  const removeItem = (id: string) =>
    setState((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));

  const addItem = () =>
    setState((s) => ({
      ...s,
      items: [
        ...s.items,
        {
          id: uid(),
          name: "",
          estimatedGrams: 0,
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
      ],
    }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let photoId: string | undefined;
      let thumbnailDataUrl: string | undefined;
      if (saveMealPhotos) {
        photoId = `meal-${uid()}`;
        try {
          await saveMealPhoto(photoId, blob);
        } catch {
          photoId = undefined;
        }
      }
      try {
        thumbnailDataUrl = await makeThumbnail(blob, THUMB_WIDTH);
      } catch {
        thumbnailDataUrl = undefined;
      }

      const ai: MealAiAnalysis = {
        overallConfidence: state.confidence,
        identifiedItems: state.items.map((it) => ({
          name: it.name,
          estimatedGrams: it.estimatedGrams,
        })),
        notes: state.notes,
      };

      const meal: Omit<Meal, "id" | "createdAt"> = {
        date: todayStr(),
        time: state.time,
        name: state.name.trim() || undefined,
        calories: Math.round(state.totals.calories),
        protein: Math.round(state.totals.proteinG),
        carbs: Math.round(state.totals.carbsG),
        fat: Math.round(state.totals.fatG),
        photoId,
        thumbnailDataUrl,
        aiAnalysis: ai,
      };
      addMeal(meal);
      haptic("success");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 pt-2 pb-32 max-w-2xl mx-auto space-y-4">
      <div className="text-lg font-semibold tracking-tight">
        Review your meal
      </div>

      <section className="card p-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt=""
          className="h-20 w-20 rounded-xl object-cover bg-[var(--color-elevated)] shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setConfInfoOpen((v) => !v)}
              className="inline-block"
            >
              <Pill tone={CONF_TONE[state.confidence]} className="h-6 px-2">
                {CONF_LABEL[state.confidence]}
              </Pill>
            </button>
            {confInfoOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close popover"
                  onClick={() => setConfInfoOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)] shadow-[var(--shadow-float)] px-3 py-2 text-[11px] text-[var(--color-fg-2)] leading-relaxed">
                  Confidence drops when portions are hard to see (no
                  utensil/hand for scale), when foods are stacked or
                  obscured, or when cooking method is ambiguous. The model
                  is honest about uncertainty — adjust the grams manually
                  for a more accurate log.
                </div>
              </>
            )}
          </div>
          <Input
            value={state.name}
            onChange={(e) =>
              setState((s) => ({ ...s, name: e.target.value }))
            }
            placeholder="Meal name"
            className="mt-1.5"
          />
        </div>
      </section>

      {/* Identified items */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="label">Identified items</div>
        </div>
        {state.items.length === 0 ? (
          <div className="text-xs text-[var(--color-fg-3)] italic">
            No items detected. Add some manually below.
          </div>
        ) : (
          <ul className="space-y-2">
            {state.items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                onChange={(patch) => editItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addItem}
          className="mt-3 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
        >
          <Plus size={12} />
          Add item
        </button>
      </section>

      {/* Totals */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="label">Totals</div>
          <ToggleRow
            label="Edit totals manually"
            checked={state.totalsManual}
            onChange={(v) =>
              setState((s) => ({
                ...s,
                totalsManual: v,
              }))
            }
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { key: "calories", label: "Cal" },
              { key: "proteinG", label: "Protein (g)" },
              { key: "carbsG", label: "Carbs (g)" },
              { key: "fatG", label: "Fat (g)" },
            ] as const
          ).map((m) => (
            <div key={m.key}>
              <div className="label mb-1 text-[9px]">{m.label}</div>
              <Input
                type="number"
                inputMode="numeric"
                value={state.totals[m.key]}
                disabled={!state.totalsManual}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    totals: {
                      ...s.totals,
                      [m.key]: Math.max(0, parseInt(e.target.value, 10) || 0),
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      {/* AI notes */}
      {state.notes && (
        <section className="card p-3 border-l-2 border-[var(--color-accent)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1">
            AI notes
          </div>
          <div className="text-[12px] italic text-[var(--color-fg-2)] leading-relaxed">
            {state.notes}
          </div>
        </section>
      )}

      {/* Time */}
      <section className="card p-4">
        <div className="label mb-2">Time</div>
        <Input
          type="time"
          value={state.time}
          onChange={(e) =>
            setState((s) => ({ ...s, time: e.target.value }))
          }
        />
      </section>

      {/* Bottom action bar */}
      <div
        className="fixed left-0 right-0 bottom-0 z-10 border-t border-[var(--color-stroke)] bg-[var(--color-bg)]/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: ReviewItem;
  onChange: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <li className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-2.5">
      <div className="flex items-center gap-2">
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Item"
          className="flex-1 h-9"
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label="Edit details"
          className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-fg)]"
        >
          <ChevronDown
            size={14}
            className={cn(
              "transition-transform",
              expanded ? "rotate-180" : ""
            )}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[var(--color-fg-3)] inline-flex items-center gap-1"
        >
          <Pencil size={10} />
          {item.estimatedGrams}g · {item.calories} cal · {item.proteinG}p
        </button>
      </div>
      {expanded && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumField
            label="Grams"
            value={item.estimatedGrams}
            onChange={(v) => onChange({ estimatedGrams: v })}
          />
          <NumField
            label="Calories"
            value={item.calories}
            onChange={(v) => onChange({ calories: v })}
          />
          <NumField
            label="Protein (g)"
            value={item.proteinG}
            onChange={(v) => onChange({ proteinG: v })}
          />
          <NumField
            label="Carbs (g)"
            value={item.carbsG}
            onChange={(v) => onChange({ carbsG: v })}
          />
          <NumField
            label="Fat (g)"
            value={item.fatG}
            onChange={(v) => onChange({ fatG: v })}
          />
        </div>
      )}
    </li>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="block label mb-1 text-[9px]">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
        }}
      />
    </label>
  );
}

async function makeThumbnail(blob: Blob, maxW: number): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.7);
}
