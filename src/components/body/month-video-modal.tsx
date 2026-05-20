"use client";

import * as React from "react";
import { Download, Film, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { ProgressPhoto } from "@/lib/hooks/use-progress-photos";

type Props = {
  open: boolean;
  onClose: () => void;
  photos: ProgressPhoto[];
};

// Frame held per photo. 1 second → "1 photo per second" feel the user asked
// for. Each second is rendered at SECOND_FPS frames so the canvas.captureStream
// has continuous content (some encoders drop static frames).
const SECOND_PER_PHOTO = 1;
const SECOND_FPS = 30;
const OUT_W = 1080;
const OUT_H = 1440; // 3:4 portrait — matches the AngleTile aspect ratio.

type Status =
  | { kind: "idle" }
  | { kind: "preparing"; loaded: number; total: number }
  | { kind: "encoding"; frame: number; total: number }
  | { kind: "done"; url: string; mimeType: string; sizeBytes: number }
  | { kind: "error"; message: string };

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* some browsers throw — ignore */
    }
  }
  return "";
}

function fileExt(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  // Cover: fill the target box, crop overflow. Matches the AngleTile's
  // object-cover rendering so the video looks like the on-page photo.
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, dx, dy, dw, dh);
}

export function MonthVideoModal({ open, onClose, photos }: Props) {
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const cancelRef = React.useRef<boolean>(false);
  const objectUrlRef = React.useRef<string | null>(null);

  // Photos arrive newest-first; the compilation wants oldest→newest.
  const ordered = React.useMemo(
    () =>
      [...photos].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    [photos]
  );

  React.useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setStatus({ kind: "idle" });
    } else {
      cancelRef.current = false;
    }
  }, [open]);

  const handleGenerate = async () => {
    if (ordered.length < 2) {
      setStatus({
        kind: "error",
        message: "Need at least 2 photos to make a video.",
      });
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      setStatus({
        kind: "error",
        message: "This browser doesn't support video export. Try Safari on iOS or Chrome.",
      });
      return;
    }

    cancelRef.current = false;
    setStatus({ kind: "preparing", loaded: 0, total: ordered.length });

    // Pre-load every image so the encoder never stalls waiting on network.
    const images: HTMLImageElement[] = [];
    for (let i = 0; i < ordered.length; i++) {
      if (cancelRef.current) return;
      try {
        const img = await loadImage(
          `/api/body/progress-photos/${ordered[i].id}/image`
        );
        images.push(img);
        setStatus({ kind: "preparing", loaded: i + 1, total: ordered.length });
      } catch (err) {
        setStatus({
          kind: "error",
          message: `Couldn't load photo ${i + 1}: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        });
        return;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus({ kind: "error", message: "Canvas 2D context unavailable." });
      return;
    }

    // captureStream gives the encoder a continuous video track tied to canvas
    // draws. We draw fresh on a rAF loop to keep the stream "live."
    const stream = canvas.captureStream(SECOND_FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    const totalFrames = ordered.length * SECOND_PER_PHOTO * SECOND_FPS;
    setStatus({ kind: "encoding", frame: 0, total: totalFrames });

    recorder.start();

    // Draw the first frame so the stream isn't empty.
    drawCover(ctx, images[0], OUT_W, OUT_H);

    let frameIdx = 0;
    let photoIdx = 0;
    let framesInPhoto = 0;

    const drawNext = () =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelRef.current) {
            try {
              recorder.stop();
            } catch {
              /* ignore */
            }
            resolve();
            return;
          }
          // Switch to next photo when its hold time elapses.
          if (framesInPhoto >= SECOND_PER_PHOTO * SECOND_FPS) {
            framesInPhoto = 0;
            photoIdx++;
            if (photoIdx >= images.length) {
              resolve();
              return;
            }
          }
          drawCover(ctx, images[photoIdx], OUT_W, OUT_H);
          framesInPhoto++;
          frameIdx++;
          if (frameIdx % 6 === 0) {
            setStatus({ kind: "encoding", frame: frameIdx, total: totalFrames });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

    await drawNext();

    // Stop and wait for the final chunk.
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

    if (cancelRef.current) return;

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setStatus({ kind: "done", url, mimeType, sizeBytes: blob.size });
  };

  const download = () => {
    if (status.kind !== "done") return;
    const ext = fileExt(status.mimeType);
    const dateLabel = new Date().toISOString().slice(0, 7); // YYYY-MM
    const a = document.createElement("a");
    a.href = status.url;
    a.download = `life-os-progress-${dateLabel}.${ext}`;
    a.click();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Monthly progress video"
      description={`${ordered.length} photo${ordered.length === 1 ? "" : "s"} this month · ${ordered.length} second${ordered.length === 1 ? "" : "s"} long`}
      size="md"
      footer={
        status.kind === "done" ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={download}>
              <Download size={14} />
              Save video
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                cancelRef.current = true;
                onClose();
              }}
              disabled={false}
            >
              {status.kind === "preparing" || status.kind === "encoding" ? "Cancel" : "Close"}
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={
                status.kind === "preparing" || status.kind === "encoding" || ordered.length < 2
              }
            >
              <Film size={14} />
              {status.kind === "idle" || status.kind === "error" ? "Generate" : "Working…"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {status.kind === "idle" && (
          <p className="text-[13px] text-[var(--color-fg-2)] leading-relaxed">
            Your photos this month, compiled into a {ordered.length}-second video at 1
            second per photo. Best results when you've captured in the same mirror
            with similar lighting each day.
          </p>
        )}

        {status.kind === "preparing" && (
          <ProgressBar
            label={`Loading photo ${status.loaded} of ${status.total}`}
            pct={(status.loaded / Math.max(1, status.total)) * 100}
          />
        )}

        {status.kind === "encoding" && (
          <ProgressBar
            label={`Encoding · frame ${status.frame}/${status.total}`}
            pct={(status.frame / Math.max(1, status.total)) * 100}
          />
        )}

        {status.kind === "done" && (
          <div className="space-y-3">
            <video
              src={status.url}
              controls
              autoPlay
              playsInline
              className="w-full rounded-lg bg-black"
              style={{ aspectRatio: "3 / 4" }}
            />
            <div className="text-[11px] text-[var(--color-fg-3)] tnum">
              {(status.sizeBytes / 1024 / 1024).toFixed(1)} MB ·{" "}
              {status.mimeType.includes("mp4") ? "MP4" : "WebM"}
            </div>
            <p className="text-[12px] text-[var(--color-fg-2)] leading-relaxed">
              Tap save, then in your camera roll → share → save to Photos so iOS keeps it.
            </p>
          </div>
        )}

        {status.kind === "error" && (
          <div className="rounded-lg bg-[color:color-mix(in_srgb,var(--color-danger)_12%,transparent)] border border-[color:color-mix(in_srgb,var(--color-danger)_35%,transparent)] px-3 py-2 text-[12px] text-[var(--color-danger)] flex items-start gap-2">
            <X size={14} className="mt-0.5 shrink-0" />
            <div>{status.message}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-[var(--color-fg-2)]">{label}</div>
      <div className="h-2 rounded-full bg-[var(--color-stroke)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)] transition-[width] duration-150 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
