"use client";

import * as React from "react";
import { Link2, Loader2 } from "lucide-react";
import { useStore } from "@/store";
import type { DateStr, GoogleHealthDaySource } from "@/lib/types";

/**
 * Small 🔗 icon shown next to a metric value that was last written by
 * the Google Health sync. Hidden if the user manually overrode after
 * the sync (so the icon truly means "this number came from the watch").
 *
 * Renders an inline spinner instead when a sync is currently in flight.
 */
export function SyncedBadge({
  date,
  source,
  size = 11,
  title,
}: {
  date: DateStr;
  source: keyof GoogleHealthDaySource;
  size?: number;
  title?: string;
}) {
  const isSyncing = useStore((s) => s.googleHealth.isSyncing);
  const provenance = useStore(
    (s) => s.googleHealth.sourceByDate[date]?.[source]
  );

  const syncedAt = provenance?.syncedAt;
  const overrideAt = provenance?.manualOverrideAt;
  const isOverride =
    overrideAt && (!syncedAt || overrideAt > syncedAt);
  const isSynced = Boolean(syncedAt) && !isOverride;

  if (isSyncing && isSynced) {
    return (
      <span title="Syncing from Google Health" className="inline-flex">
        <Loader2
          size={size}
          className="animate-spin shrink-0"
          style={{ color: "var(--color-fg-3)" }}
          aria-label="Syncing"
        />
      </span>
    );
  }
  if (!isSynced) return null;
  const tooltip =
    title ??
    (syncedAt
      ? `Synced from Google Health · ${formatTooltipTime(syncedAt)}`
      : "Synced from Google Health");
  return (
    <span title={tooltip} className="inline-flex">
      <Link2
        size={size}
        className="shrink-0"
        style={{ color: "var(--color-fg-3)" }}
        aria-label={tooltip}
      />
    </span>
  );
}

function formatTooltipTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
