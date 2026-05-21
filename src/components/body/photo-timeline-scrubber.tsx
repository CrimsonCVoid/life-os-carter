"use client";

import * as React from "react";
import { fromDateStr, format } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import type { ProgressPhoto } from "@/lib/hooks/use-progress-photos";

/**
 * Horizontal scrubber that lets the user drag through every progress photo
 * oldest → newest, seeing each one full-size in the panel above. Renders
 * nothing if there are <2 photos. The current photo's date is shown above
 * the bar so day-by-day comparisons are explicit.
 */
export function PhotoTimelineScrubber({ photos }: { photos: ProgressPhoto[] }) {
  // Sort oldest -> newest so left = older, right = newer.
  const ordered = React.useMemo(
    () => [...photos].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    [photos]
  );
  const [idx, setIdx] = React.useState(() => Math.max(0, ordered.length - 1));

  // Keep the index clamped if the photo list changes.
  React.useEffect(() => {
    if (idx >= ordered.length) setIdx(Math.max(0, ordered.length - 1));
  }, [idx, ordered.length]);

  // Pointer drag tracking for native-feeling scrub. We track the track's
  // bounding rect once on pointer-down, then map clientX → index on every
  // move. Haptic ticks fire on integer index transitions for a tactile
  // "passing photos" feel (no-op on iOS Safari, real on Capacitor / Android).
  const trackRef = React.useRef<HTMLDivElement>(null);
  const lastIdxRef = React.useRef(idx);
  const draggingRef = React.useRef(false);

  const updateFromX = React.useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, ratio));
      const next = Math.round(clamped * (ordered.length - 1));
      if (next !== lastIdxRef.current) {
        lastIdxRef.current = next;
        haptic("soft");
        setIdx(next);
      }
    },
    [ordered.length]
  );

  if (ordered.length < 2) return null;
  const current = ordered[idx];

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
        Timeline
      </div>
      <div className="relative rounded-xl overflow-hidden border border-[var(--color-stroke)] aspect-[3/4] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/body/progress-photos/${current.id}/image`}
          alt={`Progress photo from ${current.capturedAt.slice(0, 10)}`}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[11px]">
          <span className="px-2 py-0.5 rounded bg-black/55 text-white tnum">
            {format(fromDateStr(current.capturedAt.slice(0, 10)), "MMM d, yyyy")}
          </span>
          <span className="px-2 py-0.5 rounded bg-black/55 text-white tnum">
            {idx + 1} / {ordered.length}
          </span>
        </div>
      </div>

      {/* Scrub track */}
      <div
        ref={trackRef}
        className="relative h-10 select-none touch-none"
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          haptic("tap");
          updateFromX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          updateFromX(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[var(--color-stroke)]" />
        {/* Filled portion */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[var(--color-accent)]"
          style={{
            width: `${(idx / Math.max(1, ordered.length - 1)) * 100}%`,
          }}
        />
        {/* Tick marks per photo */}
        <div className="absolute inset-0 flex items-center px-2">
          {ordered.map((p, i) => (
            <div
              key={p.id}
              className="flex-1 grid place-items-center"
              style={{ minWidth: 0 }}
            >
              <div
                className="rounded-full"
                style={{
                  width: i === idx ? 14 : 6,
                  height: i === idx ? 14 : 6,
                  background:
                    i === idx
                      ? "var(--color-accent)"
                      : i < idx
                      ? "color-mix(in srgb, var(--color-accent) 40%, transparent)"
                      : "var(--color-stroke-strong)",
                  transition: "all 80ms ease-out",
                  border:
                    i === idx
                      ? "2px solid var(--color-card)"
                      : "none",
                  boxShadow:
                    i === idx
                      ? "0 0 0 2px var(--color-accent)"
                      : "none",
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
