"use client";

import * as React from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  accent: string;        // CSS color or var(--...)
  synced?: boolean;
  onActivate?: () => void;
  empty?: boolean;
  /** Last-known sync time if data is stale (no value for today yet). */
  lastSyncedAt?: string;
  /** "Connect Google Health" CTA target when empty. */
  connectHref?: string;
  /** The hero numeric/visual content. */
  children: React.ReactNode;
  /** Optional secondary content under the value (delta, hours, mini-trend). */
  secondary?: React.ReactNode;
  ariaLabel?: string;
};

/**
 * Shared shell for the three Vitals tiles. Owns the elevated surface
 * treatment, label, sync badge, tap activation, and the "Connect Google
 * Health" CTA used in empty state. Inner numeric/visual content is
 * supplied per-tile.
 */
export function VitalsTileShell({
  label,
  accent,
  synced,
  onActivate,
  empty,
  lastSyncedAt,
  connectHref = "/settings#google-health",
  children,
  secondary,
  ariaLabel,
}: Props) {
  const interactive = !!onActivate;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onActivate : undefined}
      aria-label={ariaLabel}
      className={cn(
        "vitals-tile group snap-start shrink-0 relative text-left",
        "w-[85vw] sm:w-auto sm:flex-1",
        "aspect-[4/5] sm:aspect-auto sm:min-h-[260px]",
        "px-5 pt-5 pb-4 flex flex-col",
        interactive && "card-hover"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="label inline-flex items-center gap-1.5" style={{ color: "var(--color-fg-2)" }}>
          {label}
          {synced && (
            <Link2
              size={10}
              className="opacity-70"
              style={{ color: "var(--color-fg-3)" }}
              aria-label="Synced from Google Health"
            />
          )}
        </div>
        {lastSyncedAt && !empty && (
          <span className="text-[10px] text-[var(--color-fg-3)] tabular-nums">
            {lastSyncedAt}
          </span>
        )}
      </div>

      <div className="flex-1 mt-3 flex flex-col items-start justify-center">
        {children}
      </div>

      {secondary && !empty && (
        <div className="mt-3 text-[12px] text-[var(--color-fg-2)] min-h-[1em]">
          {secondary}
        </div>
      )}

      {empty && (
        <Link
          href={connectHref}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] inline-flex items-center gap-1.5 self-start"
          style={{ color: accent }}
        >
          <Link2 size={11} />
          Connect Google Health
        </Link>
      )}
    </Tag>
  );
}
