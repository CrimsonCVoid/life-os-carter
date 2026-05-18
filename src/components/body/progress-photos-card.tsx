"use client";

import * as React from "react";
import { Camera, Loader2, Sparkles, Trash2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ProgressPhotoModal } from "./progress-photo-modal";
import { useProgressPhotos, type ProgressPhoto } from "@/lib/hooks/use-progress-photos";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Props = { userId?: string };

export function ProgressPhotosCard({ userId }: Props) {
  // `userId` retained for future per-user UI (e.g. multi-account picker);
  // not required by the modal anymore — server resolves it from the session.
  void userId;
  const { photos, loading, error, reload } = useProgressPhotos();
  const [open, setOpen] = React.useState(false);

  const latestByAngle = React.useMemo(() => {
    const out: Record<"front" | "side" | "back", ProgressPhoto | null> = {
      front: null,
      side: null,
      back: null,
    };
    for (const p of photos) {
      if (!out[p.angle]) out[p.angle] = p;
    }
    return out;
  }, [photos]);

  const bfTrend = React.useMemo(
    () =>
      [...photos]
        .reverse() // photos arrive newest-first; chart wants oldest→newest
        .filter((p) => p.analysis?.status === "complete" && p.analysis.bfEstimatePct != null)
        .map((p) => ({
          date: p.capturedAt.slice(0, 10),
          bf: p.analysis!.bfEstimatePct,
          low: p.analysis!.bfConfidenceLow,
          high: p.analysis!.bfConfidenceHigh,
        })),
    [photos]
  );

  const latestCommentary = React.useMemo(() => {
    return photos.find((p) => p.analysis?.status === "complete" && p.analysis.vlmCommentary)
      ?.analysis?.vlmCommentary;
  }, [photos]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress photos</CardTitle>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Camera size={12} />
          Capture
        </Button>
      </CardHeader>

      {loading && photos.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--color-fg-3)]">Loading…</div>
      ) : error ? (
        <div className="py-6 text-center text-xs text-[var(--color-danger)]">{error}</div>
      ) : photos.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--color-fg-3)]">
          No progress photos yet. Capture one to start the body-comp trend.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["front", "side", "back"] as const).map((angle) => (
              <AngleTile key={angle} photo={latestByAngle[angle]} angle={angle} onChange={reload} />
            ))}
          </div>

          {bfTrend.length >= 2 && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[var(--color-fg-3)] text-xs">BF% trend</span>
                <span className="text-base font-semibold tnum">
                  {bfTrend[bfTrend.length - 1].bf?.toFixed(1)}%
                </span>
              </div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bfTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-stroke-strong)",
                        fontSize: 11,
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bf"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {latestCommentary && (
            <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-3">
              <div className="flex items-center gap-2 mb-1 text-xs text-[var(--color-fg-3)]">
                <Sparkles size={11} />
                Latest commentary
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-fg-2)]">
                {latestCommentary}
              </p>
            </div>
          )}
        </div>
      )}

      <ProgressPhotoModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => void reload()}
      />
    </Card>
  );
}

function AngleTile({
  photo,
  angle,
  onChange,
}: {
  photo: ProgressPhoto | null;
  angle: "front" | "side" | "back";
  onChange: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const status = photo?.analysis?.status;
  const inflight = status === "pending" || status === "processing" || (photo && !status);

  const handleDelete = async () => {
    if (!photo) return;
    await fetch(`/api/body/progress-photos/${photo.id}`, { method: "DELETE" });
    haptic("warn");
    onChange();
  };

  return (
    <>
      <div className="relative rounded-xl border border-[var(--color-stroke)] overflow-hidden aspect-[3/4] bg-[var(--color-elevated)]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.blobUrl} alt={angle} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[var(--color-fg-3)]">
            <Camera size={16} />
          </div>
        )}

        <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-black/50 text-white capitalize">
          {angle}
        </div>

        {photo && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete photo"
            className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded bg-black/50 text-white"
          >
            <Trash2 size={11} />
          </button>
        )}

        {photo && inflight && (
          <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white">
            <Loader2 size={10} className="animate-spin" />
            {status === "processing" ? "analyzing" : "queued"}
          </div>
        )}

        {photo?.analysis?.bfEstimatePct != null && (
          <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white text-center tnum">
            {photo.analysis.bfEstimatePct.toFixed(1)}% BF
          </div>
        )}

        {status === "failed" && (
          <div
            title="Analysis failed"
            className={cn(
              "absolute bottom-1 left-1 right-1 px-1.5 py-0.5 text-[10px] rounded text-center",
              "bg-[var(--color-danger)]/70 text-white"
            )}
          >
            failed
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this photo?"
        description="The photo and its analysis row are removed. Blob bytes remain until the next cleanup pass."
      />
    </>
  );
}
