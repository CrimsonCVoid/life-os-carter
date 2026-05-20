"use client";

import * as React from "react";
import { Camera } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const TIME_OF_DAY = ["morning", "midday", "evening"] as const;
type TimeOfDay = (typeof TIME_OF_DAY)[number];

type Props = {
  open: boolean;
  onClose: () => void;
  userId?: string;
  /** Pathname of the prior front photo so we can show it as a ghost overlay
   *  in the preview, helping the user match pose/lighting/distance. */
  priorPhotoId?: string | null;
  onCreated: () => void;
};

type Stage = "form" | "uploading" | "saving";

// Hard-coded to "front". Daily-cadence progress photos work best when the
// angle is invariant — the monthly compilation needs a single perspective
// to read as continuous motion, not a slideshow of three views.
const ANGLE = "front" as const;

export function ProgressPhotoModal({ open, onClose, priorPhotoId, onCreated }: Props) {
  const bodyProfile = useStore((s) => s.settings.bodyProfile);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const [weightKg, setWeightKg] = React.useState("");
  const [timeOfDay, setTimeOfDay] = React.useState<TimeOfDay | "">("");
  const [fasted, setFasted] = React.useState(false);
  const [hydrationState, setHydrationState] =
    React.useState<"low" | "normal" | "high" | "">("");
  const [lightingNotes, setLightingNotes] = React.useState("");

  const [stage, setStage] = React.useState<Stage>("form");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreviewUrl(null);
    setWeightKg("");
    setTimeOfDay("");
    setFasted(false);
    setHydrationState("");
    setLightingNotes("");
    setStage("form");
    setError(null);
  }, [open]);

  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSubmit = async () => {
    if (!file) {
      setError("Pick a photo first.");
      return;
    }
    setError(null);
    setStage("uploading");

    let blobUrl: string;
    let blobPathname: string;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("angle", ANGLE);
      const r = await fetch("/api/body/progress-photos/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `upload http ${r.status}`);
      }
      const j = (await r.json()) as { blobUrl: string; blobPathname: string };
      blobUrl = j.blobUrl;
      blobPathname = j.blobPathname;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStage("form");
      return;
    }

    setStage("saving");
    const captureMeta: Record<string, unknown> = {};
    const w = parseFloat(weightKg);
    if (Number.isFinite(w)) captureMeta.weightKg = w;
    if (timeOfDay) captureMeta.timeOfDay = timeOfDay;
    if (fasted) captureMeta.fasted = true;
    if (hydrationState) captureMeta.hydrationState = hydrationState;
    if (lightingNotes.trim()) captureMeta.lightingNotes = lightingNotes.trim();
    if (bodyProfile.heightCm) captureMeta.heightCm = bodyProfile.heightCm;
    if (bodyProfile.biologicalSex) captureMeta.sex = bodyProfile.biologicalSex;

    try {
      const r = await fetch("/api/body/progress-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blobUrl,
          blobPathname,
          angle: ANGLE,
          capturedAt: new Date().toISOString(),
          captureMeta,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `http ${r.status}`);
      }
      haptic("success");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStage("form");
    }
  };

  const busy = stage !== "form";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daily progress photo"
      description="Same mirror, same lighting, same time of day if you can. The monthly compilation will thank you."
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !file}>
            {stage === "uploading" ? "Uploading…" : stage === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="label mb-2">Photo</div>
          <div
            className={cn(
              "rounded-xl border border-dashed border-[var(--color-stroke-strong)] p-3",
              previewUrl && "border-solid border-[var(--color-stroke)]"
            )}
          >
            {previewUrl ? (
              <div className="space-y-3">
                {/* Stack: prior photo at low opacity, current photo on top.
                 *  Helps the user spot pose/lighting/distance differences
                 *  before committing the upload. */}
                <div className="relative w-full rounded-lg overflow-hidden bg-[var(--color-elevated)]">
                  {priorPhotoId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/body/progress-photos/${priorPhotoId}/image`}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-contain opacity-25 pointer-events-none"
                    />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Selected photo"
                    className="relative w-full max-h-[60dvh] object-contain"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Camera size={12} />
                  Retake
                </Button>
              </div>
            ) : (
              <div className="relative">
                {priorPhotoId && (
                  // Ghost reference while empty so the user knows the frame to
                  // match before they even open the camera.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/body/progress-photos/${priorPhotoId}/image`}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-contain opacity-15 pointer-events-none rounded-lg"
                  />
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className={cn(
                    "relative w-full py-12 flex flex-col items-center justify-center gap-2",
                    "text-[var(--color-fg-2)]",
                    "transition active:scale-[0.99]"
                  )}
                >
                  <Camera size={26} />
                  <span className="text-[13px] font-semibold">
                    {priorPhotoId ? "Match the ghost, take photo" : "Take photo"}
                  </span>
                  <span className="text-[11px] text-[var(--color-fg-3)]">
                    Camera opens · tap allow
                  </span>
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setFile(f);
              }}
            />
          </div>
        </div>

        <details className="rounded-xl border border-[var(--color-stroke)] p-3">
          <summary className="cursor-pointer text-sm text-[var(--color-fg-2)]">
            Capture conditions{" "}
            <span className="text-[var(--color-fg-3)]">(optional, improves analysis)</span>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Weight</div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="kg"
                />
              </div>
              <div>
                <div className="label mb-1">Time of day</div>
                <select
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay | "")}
                  className="control h-11 w-full text-[17px] px-3"
                >
                  <option value="">—</option>
                  {TIME_OF_DAY.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 h-11 px-3 control">
                <input
                  type="checkbox"
                  id="fasted"
                  checked={fasted}
                  onChange={(e) => setFasted(e.target.checked)}
                />
                <label htmlFor="fasted" className="text-[14px]">
                  Fasted
                </label>
              </div>
              <div>
                <select
                  value={hydrationState}
                  onChange={(e) =>
                    setHydrationState(
                      e.target.value as "low" | "normal" | "high" | ""
                    )
                  }
                  className="control h-11 w-full text-[17px] px-3"
                >
                  <option value="">Hydration —</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div>
              <div className="label mb-1">Lighting notes</div>
              <Textarea
                rows={2}
                value={lightingNotes}
                onChange={(e) => setLightingNotes(e.target.value)}
                placeholder="e.g. bathroom overhead, daylight from left"
              />
            </div>
          </div>
        </details>

        {error && (
          <div className="rounded-lg bg-[color:color-mix(in_srgb,var(--color-danger)_12%,transparent)] border border-[color:color-mix(in_srgb,var(--color-danger)_35%,transparent)] px-3 py-2 text-[12px] text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
