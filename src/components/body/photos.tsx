"use client";

import * as React from "react";
import { Camera, Download, GitCompareArrows, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useStore } from "@/store";
import { usePhotosRaw } from "@/store/selectors";
import {
  PhotoAngle,
  PhotoMeta,
  PHOTO_ANGLE_LABELS,
  PHOTO_ANGLES,
} from "@/lib/types";
import { todayStr, format, fromDateStr } from "@/lib/date";
import { uid } from "@/lib/utils";
import {
  compressImage,
  deletePhoto,
  getPhoto,
  putPhoto,
} from "@/lib/photo-store";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type ObjUrlState = Record<string, string>;

export function PhotosTab() {
  const photos = usePhotosRaw();
  const addPhotoMeta = useStore((s) => s.addPhotoMeta);
  const removePhotoMeta = useStore((s) => s.removePhotoMeta);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<File | null>(null);
  const [pickAngle, setPickAngle] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [viewing, setViewing] = React.useState<PhotoMeta | null>(null);
  const [urls, setUrls] = React.useState<ObjUrlState>({});

  // load object URLs for all photo metas
  React.useEffect(() => {
    let active = true;
    (async () => {
      const next: ObjUrlState = {};
      await Promise.all(
        photos.map(async (p) => {
          if (urls[p.id]) {
            next[p.id] = urls[p.id];
            return;
          }
          const blob = await getPhoto(p.idbKey).catch(() => undefined);
          if (blob && active) next[p.id] = URL.createObjectURL(blob);
        })
      );
      if (active) setUrls(next);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  const onPickFile = async (file: File) => {
    setPending(file);
    setPickAngle(true);
  };

  const onAnglePicked = async (angle: PhotoAngle) => {
    if (!pending) return;
    setPickAngle(false);
    try {
      const compressed = await compressImage(pending);
      const idbKey = `photo-${uid()}`;
      await putPhoto(idbKey, compressed);
      addPhotoMeta({
        date: todayStr(),
        angle,
        idbKey,
      });
      haptic("success");
    } catch (e) {
      alert("Couldn't save photo");
      console.error(e);
    } finally {
      setPending(null);
    }
  };

  const removePhoto = async (p: PhotoMeta) => {
    if (!confirm("Delete this photo?")) return;
    await deletePhoto(p.idbKey).catch(() => {});
    removePhotoMeta(p.id);
    if (urls[p.id]) URL.revokeObjectURL(urls[p.id]);
    haptic("warn");
  };

  const exportZip = async () => {
    setExporting(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = zip.folder("life-os-photos");
      if (!folder) throw new Error("zip folder");
      for (const p of photos) {
        const blob = await getPhoto(p.idbKey).catch(() => undefined);
        if (!blob) continue;
        const name = `${p.date}_${p.angle}_${p.id}.jpg`;
        folder.file(name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `life-os-photos-${todayStr()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const grouped = React.useMemo(() => {
    const map = new Map<string, PhotoMeta[]>();
    for (const p of [...photos].sort((a, b) =>
      b.date.localeCompare(a.date)
    )) {
      const arr = map.get(p.date) ?? [];
      arr.push(p);
      map.set(p.date, arr);
    }
    return Array.from(map.entries());
  }, [photos]);

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={() => fileRef.current?.click()}
          className="flex-1"
        >
          <Camera size={14} />
          Take photo
        </Button>
        <Button
          variant="secondary"
          onClick={() => setCompareOpen(true)}
          disabled={photos.length < 2}
        >
          <GitCompareArrows size={14} />
        </Button>
        <Button
          variant="secondary"
          onClick={exportZip}
          disabled={photos.length === 0 || exporting}
        >
          <Download size={14} />
        </Button>
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

      {photos.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-sm text-[var(--color-fg-2)]">
            No photos yet
          </div>
          <div className="mt-1 text-xs text-[var(--color-fg-3)]">
            Take your first front/side/back set.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="label text-[10px] mb-1.5">
                {format(fromDateStr(date), "EEEE, MMM d")}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setViewing(p)}
                    className="aspect-[3/4] rounded-lg overflow-hidden border border-[var(--color-stroke)] bg-[var(--color-elevated)] relative group"
                  >
                    {urls[p.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urls[p.id]}
                        alt={p.angle}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-[10px] text-[var(--color-fg-3)]">
                        loading…
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 text-[9px] uppercase font-semibold tracking-wider text-white bg-black/40 backdrop-blur-sm rounded px-1.5">
                      {PHOTO_ANGLE_LABELS[p.angle]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={pickAngle}
        onClose={() => {
          setPickAngle(false);
          setPending(null);
        }}
        title="Which angle?"
        size="md"
        footer={
          <Button
            variant="ghost"
            onClick={() => {
              setPickAngle(false);
              setPending(null);
            }}
          >
            Cancel
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {PHOTO_ANGLES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onAnglePicked(a)}
              className="h-20 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] text-sm font-medium hover:border-[var(--color-stroke-strong)]"
            >
              {PHOTO_ANGLE_LABELS[a]}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={
          viewing
            ? `${PHOTO_ANGLE_LABELS[viewing.angle]} · ${format(
                fromDateStr(viewing.date),
                "MMM d, yyyy"
              )}`
            : ""
        }
        size="lg"
        footer={
          <div className="flex items-center justify-between">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (viewing) {
                  removePhoto(viewing);
                  setViewing(null);
                }
              }}
            >
              <Trash2 size={12} />
              Delete
            </Button>
            <Button onClick={() => setViewing(null)}>Done</Button>
          </div>
        }
      >
        {viewing && urls[viewing.id] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urls[viewing.id]}
            alt={viewing.angle}
            className="w-full rounded-xl"
          />
        )}
      </Modal>

      <ComparePanel
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        photos={photos}
        urls={urls}
      />
    </>
  );
}

function ComparePanel({
  open,
  onClose,
  photos,
  urls,
}: {
  open: boolean;
  onClose: () => void;
  photos: PhotoMeta[];
  urls: ObjUrlState;
}) {
  const [angle, setAngle] = React.useState<PhotoAngle>("front");
  const sameAngle = React.useMemo(
    () => [...photos.filter((p) => p.angle === angle)].sort((a, b) => a.date.localeCompare(b.date)),
    [photos, angle]
  );
  const [beforeId, setBeforeId] = React.useState<string | null>(null);
  const [afterId, setAfterId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (sameAngle.length < 2) {
      setBeforeId(null);
      setAfterId(null);
      return;
    }
    setAfterId(sameAngle[sameAngle.length - 1].id);
    const target = sameAngle[sameAngle.length - 1];
    const earlier = sameAngle.find((p) => {
      const days =
        (new Date(target.date).getTime() - new Date(p.date).getTime()) /
        (1000 * 60 * 60 * 24);
      return days >= 90;
    });
    setBeforeId((earlier ?? sameAngle[0]).id);
  }, [open, sameAngle]);

  const before = photos.find((p) => p.id === beforeId);
  const after = photos.find((p) => p.id === afterId);
  const days =
    before && after
      ? Math.round(
          (new Date(after.date).getTime() -
            new Date(before.date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;
  const dWeight =
    before?.weightAtTime != null && after?.weightAtTime != null
      ? after.weightAtTime - before.weightAtTime
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compare"
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {PHOTO_ANGLES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAngle(a)}
              className={cn(
                "h-8 px-3 rounded-full border text-xs",
                angle === a
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                  : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
              )}
            >
              {PHOTO_ANGLE_LABELS[a]}
            </button>
          ))}
        </div>

        {sameAngle.length < 2 ? (
          <div className="text-sm text-[var(--color-fg-2)] py-6 text-center">
            Need at least 2 photos of this angle.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: beforeId, label: "Before", set: setBeforeId },
                { id: afterId, label: "After", set: setAfterId },
              ].map((slot) => (
                <div key={slot.label}>
                  <div className="label text-[10px] mb-1.5">{slot.label}</div>
                  <select
                    value={slot.id ?? ""}
                    onChange={(e) => slot.set(e.target.value)}
                    className="control no-zoom h-9 w-full px-2 outline-none accent-ring text-xs"
                  >
                    {sameAngle.map((p) => (
                      <option key={p.id} value={p.id}>
                        {format(fromDateStr(p.date), "MMM d, yyyy")}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[before, after].map((p, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-xl overflow-hidden bg-[var(--color-elevated)] border border-[var(--color-stroke)]"
                >
                  {p && urls[p.id] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[p.id]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>

            {days != null && (
              <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-2 text-center text-sm">
                {days} day{days === 1 ? "" : "s"} between
                {dWeight != null && (
                  <span className="ml-2 text-[var(--color-fg-2)]">
                    · {dWeight > 0 ? "+" : ""}
                    {dWeight.toFixed(1)} lb
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
