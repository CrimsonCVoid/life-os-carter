"use client";

import * as React from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/store";
import { useBodyRaw } from "@/store/selectors";
import { BodyMeasurement } from "@/lib/types";
import { todayStr, format, fromDateStr } from "@/lib/date";
import { round1, uid, cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { compressImage, deletePhoto, getPhoto, putPhoto } from "@/lib/photo-store";
import { DailyWeightCard } from "@/components/body/daily-weight-card";
import { PhotoSessionsCard } from "@/components/body/photo-sessions-card";
import { DailyWeightNudge } from "@/components/body/daily-weight-nudge";
import { PhotoDayBanner } from "@/components/body/photo-day-banner";

export default function BodyPage() {
  const body = useBodyRaw();
  const [logOpen, setLogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BodyMeasurement | null>(null);

  const sorted = React.useMemo(
    () =>
      [...body].sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      ),
    [body]
  );

  return (
    <Screen title="Body" subtitle="Weight, notes, photos — one entry at a time.">
      {/* Reminders render only when relevant: PhotoDayBanner self-hides
       *  off-window or once the session exists; DailyWeightNudge hides
       *  once today's weight is logged. */}
      <PhotoDayBanner placement="body" />
      <DailyWeightNudge tone="strong" />

      {/* Daily weight + rolling-average trend (per-day singletons in
       *  weight_logs). The richer measurement+notes+photo entries below
       *  remain on the Zustand body-measurements path. */}
      <DailyWeightCard />

      <PhotoSessionsCard />

      <Card>
        <CardHeader>
          <CardTitle>Detailed entries</CardTitle>
          <Button onClick={() => setLogOpen(true)} size="sm">
            <Plus size={13} />
            New
          </Button>
        </CardHeader>
        <span className="text-xs text-[var(--color-fg-3)] block mb-3">
          {sorted.length} entr{sorted.length === 1 ? "y" : "ies"} — for notes, body fat, and progress photos
        </span>
        {sorted.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-sm text-[var(--color-fg-2)]">
              No entries yet.
            </div>
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="mt-2 text-xs text-[var(--color-accent)]"
            >
              Log your first →
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((m) => (
              <EntryRow key={m.id} m={m} onEdit={() => setEditing(m)} />
            ))}
          </ul>
        )}
      </Card>

      <BodyEntryModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        initial={null}
      />
      <BodyEntryModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing}
      />
    </Screen>
  );
}

function EntryRow({
  m,
  onEdit,
}: {
  m: BodyMeasurement;
  onEdit: () => void;
}) {
  const removeBodyMeasurement = useStore((s) => s.removeBodyMeasurement);
  const [url, setUrl] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    let createdUrl: string | null = null;
    if (m.photoIdbKey) {
      getPhoto(m.photoIdbKey)
        .then((blob) => {
          if (!blob || !alive) return;
          createdUrl = URL.createObjectURL(blob);
          setUrl(createdUrl);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [m.photoIdbKey]);

  const handleDelete = async () => {
    if (m.photoIdbKey) await deletePhoto(m.photoIdbKey).catch(() => {});
    removeBodyMeasurement(m.id);
    haptic("warn");
  };

  return (
    <>
      <li className="group flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-elevated)]">
        <button
          type="button"
          onClick={onEdit}
          className="h-14 w-14 shrink-0 rounded-lg overflow-hidden border border-[var(--color-stroke)] bg-[var(--color-elevated)] relative"
          aria-label="Open entry"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[var(--color-fg-3)]">
              <Camera size={14} />
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">
              {format(fromDateStr(m.date), "MMM d, yyyy")}
            </div>
            {m.weight != null && (
              <span className="text-xs tnum text-[var(--color-fg-2)]">
                {round1(m.weight)} lb
              </span>
            )}
          </div>
          {m.notes && (
            <div className="text-[11px] text-[var(--color-fg-3)] truncate mt-0.5">
              {m.notes}
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete entry"
          className="h-11 w-11 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
        >
          <Trash2 size={13} />
        </button>
      </li>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this entry?"
        description="The weight, notes, and any attached photo are removed."
      />
    </>
  );
}


function BodyEntryModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: BodyMeasurement | null;
}) {
  const addBodyMeasurement = useStore((s) => s.addBodyMeasurement);
  const updateBodyMeasurement = useStore((s) => s.updateBodyMeasurement);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [date, setDate] = React.useState(todayStr());
  const [weight, setWeight] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [photoKey, setPhotoKey] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Track which photo key the modal *committed to* the entry, so we can
  // garbage-collect newly-attached photos that the user discards via Cancel.
  const originalKeyRef = React.useRef<string | null>(null);
  const newlyAttachedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDate(initial?.date ?? todayStr());
    setWeight(initial?.weight != null ? String(initial.weight) : "");
    setNotes(initial?.notes ?? "");
    setPhotoKey(initial?.photoIdbKey ?? null);
    originalKeyRef.current = initial?.photoIdbKey ?? null;
    newlyAttachedRef.current = null;
    setPreviewUrl(null);
  }, [open, initial]);

  React.useEffect(() => {
    let alive = true;
    let createdUrl: string | null = null;
    if (photoKey) {
      getPhoto(photoKey)
        .then((blob) => {
          if (!blob || !alive) return;
          createdUrl = URL.createObjectURL(blob);
          setPreviewUrl(createdUrl);
        })
        .catch(() => {});
    } else {
      setPreviewUrl(null);
    }
    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [photoKey]);

  const onPickFile = async (file: File) => {
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const key = `body-${uid()}`;
      await putPhoto(key, compressed);
      // discard a previously-newly-attached photo (user replacing before save)
      if (
        newlyAttachedRef.current &&
        newlyAttachedRef.current !== originalKeyRef.current
      ) {
        await deletePhoto(newlyAttachedRef.current).catch(() => {});
      }
      newlyAttachedRef.current = key;
      setPhotoKey(key);
      haptic("tap");
    } catch (e) {
      console.error(e);
      alert("Couldn't attach photo");
    } finally {
      setBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    // If we just attached a new photo this session, delete the blob.
    if (
      newlyAttachedRef.current &&
      newlyAttachedRef.current !== originalKeyRef.current
    ) {
      await deletePhoto(newlyAttachedRef.current).catch(() => {});
      newlyAttachedRef.current = null;
    }
    setPhotoKey(null);
  };

  const cancel = async () => {
    // Roll back any newly-attached but unsaved photo
    if (
      newlyAttachedRef.current &&
      newlyAttachedRef.current !== originalKeyRef.current
    ) {
      await deletePhoto(newlyAttachedRef.current).catch(() => {});
    }
    onClose();
  };

  const save = async () => {
    const w = weight.trim() ? parseFloat(weight) : undefined;
    const patch: Partial<BodyMeasurement> = {
      date,
      weight: Number.isFinite(w as number) ? (w as number) : undefined,
      notes: notes.trim() || undefined,
      photoIdbKey: photoKey ?? undefined,
    };

    // If the saved entry replaces an original photo, GC the old one.
    if (
      originalKeyRef.current &&
      originalKeyRef.current !== photoKey
    ) {
      await deletePhoto(originalKeyRef.current).catch(() => {});
    }

    if (initial) {
      updateBodyMeasurement(initial.id, patch);
    } else {
      addBodyMeasurement(patch as Omit<BodyMeasurement, "id" | "createdAt">);
    }
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={initial ? "Edit entry" : "New entry"}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Date</div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <div className="label mb-2">Weight (lb)</div>
          <Input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="—"
          />
        </div>
        <div>
          <div className="label mb-2">Notes (optional)</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="How you're feeling, context, etc."
          />
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
                  className="w-full rounded-lg max-h-64 object-contain bg-[var(--color-elevated)]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                  >
                    <Camera size={12} />
                    Replace
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemovePhoto}
                    disabled={busy}
                  >
                    <Trash2 size={12} />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full py-6 flex flex-col items-center justify-center gap-1 text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] transition"
              >
                <Camera size={20} />
                <span className="text-xs">
                  {busy ? "Attaching…" : "Attach image (optional)"}
                </span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onPickFile(file);
              }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
