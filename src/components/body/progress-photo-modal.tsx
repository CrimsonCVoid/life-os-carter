"use client";

import * as React from "react";
import { Camera } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadProgressPhoto } from "@/lib/storage/blob";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ANGLES = ["front", "side", "back"] as const;
type Angle = (typeof ANGLES)[number];

const TIME_OF_DAY = ["morning", "midday", "evening"] as const;
type TimeOfDay = (typeof TIME_OF_DAY)[number];

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  onCreated: () => void;
};

type Stage = "form" | "uploading" | "saving";

export function ProgressPhotoModal({ open, onClose, userId, onCreated }: Props) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const [angle, setAngle] = React.useState<Angle>("front");
  const [weightKg, setWeightKg] = React.useState("");
  const [timeOfDay, setTimeOfDay] = React.useState<TimeOfDay | "">("");
  const [fasted, setFasted] = React.useState(false);
  const [hydrationState, setHydrationState] = React.useState<"low" | "normal" | "high" | "">("");
  const [lightingNotes, setLightingNotes] = React.useState("");

  const [stage, setStage] = React.useState<Stage>("form");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreviewUrl(null);
    setAngle("front");
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
    try {
      blobUrl = await uploadProgressPhoto(
        userId,
        new Date().toISOString().slice(0, 10),
        angle,
        file
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStage("form");
      return;
    }

    // Extract the pathname after the Vercel Blob base.
    let blobPathname = "";
    try {
      const u = new URL(blobUrl);
      blobPathname = u.pathname.replace(/^\//, "");
    } catch {
      blobPathname = blobUrl;
    }

    setStage("saving");
    const captureMeta: Record<string, unknown> = {};
    const w = parseFloat(weightKg);
    if (Number.isFinite(w)) captureMeta.weightKg = w;
    if (timeOfDay) captureMeta.timeOfDay = timeOfDay;
    if (fasted) captureMeta.fasted = true;
    if (hydrationState) captureMeta.hydrationState = hydrationState;
    if (lightingNotes.trim()) captureMeta.lightingNotes = lightingNotes.trim();

    try {
      const r = await fetch("/api/body/progress-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blobUrl,
          blobPathname,
          angle,
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
      title="New progress photo"
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
          <div className="label mb-2">Angle</div>
          <div className="grid grid-cols-3 gap-2">
            {ANGLES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAngle(a)}
                className={cn(
                  "py-2 rounded-lg text-sm capitalize border transition",
                  a === angle
                    ? "bg-[var(--color-accent)] text-white border-transparent"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Attached"
                  className="w-full rounded-lg max-h-72 object-contain bg-[var(--color-elevated)]"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Camera size={12} />
                  Replace
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full py-8 flex flex-col items-center justify-center gap-1 text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] transition"
              >
                <Camera size={22} />
                <span className="text-xs">Attach image</span>
              </button>
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
            <span className="text-[var(--color-fg-3)]">(optional)</span>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Weight (kg)</div>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <div className="label mb-1">Time of day</div>
                <select
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay | "")}
                  className="w-full h-9 rounded-md border border-[var(--color-stroke)] bg-[var(--color-bg)] px-2 text-sm"
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
              <label className="flex items-center gap-2 text-sm text-[var(--color-fg-2)]">
                <input
                  type="checkbox"
                  checked={fasted}
                  onChange={(e) => setFasted(e.target.checked)}
                />
                Fasted
              </label>
              <div>
                <div className="label mb-1">Hydration</div>
                <select
                  value={hydrationState}
                  onChange={(e) =>
                    setHydrationState(e.target.value as "low" | "normal" | "high" | "")
                  }
                  className="w-full h-9 rounded-md border border-[var(--color-stroke)] bg-[var(--color-bg)] px-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </div>
            </div>
            <div>
              <div className="label mb-1">Lighting / notes</div>
              <Textarea
                value={lightingNotes}
                onChange={(e) => setLightingNotes(e.target.value)}
                rows={2}
                placeholder="e.g. bathroom overhead, same as last week"
              />
            </div>
          </div>
        </details>

        {error && (
          <div className="rounded-lg border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
