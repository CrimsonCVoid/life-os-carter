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
        "vitals-tile group snap-start shrink-0 relative text-center",
        // Width: ~78% of viewport on mobile so two tiles + a peek
        // sliver are visible at once and the snap rhythm reads. On
        // sm+ they share a row equally.
        "w-[78vw] sm:w-auto sm:flex-1",
        // Height: capped at ~62vw on mobile (≈233px on a 375 phone)
        // with a 220px floor so empty states don't shrink awkwardly.
        // Desktop drops the cap entirely.
        "min-h-[220px] max-h-[62vw] sm:max-h-none sm:min-h-[260px]",
        "px-4 pt-4 pb-4 flex flex-col",
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

      {/* Hero content sits center-stage; per-tile components render
       *  number/ring/mini-trend here. Children own their own vertical
       *  margins so we don't double-space via parent gap. */}
      <div className="flex-1 mt-2 flex flex-col items-center justify-center">
        {children}
      </div>

      {secondary && !empty && (
        <div className="mt-2 text-[12px] text-[var(--color-fg-2)] min-h-[1em]">
          {secondary}
        </div>
      )}

      {empty && (
        <Link
          href={connectHref}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 mx-auto text-[11px] uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
          style={{ color: accent }}
        >
          <Link2 size={11} />
          Connect Google Health
        </Link>
      )}
    </Tag>
  );
}
