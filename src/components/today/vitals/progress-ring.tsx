"use client";

import * as React from "react";

type Props = {
  /** 0..1 (or higher — we cap visual fill at 1, but caller can show glow on >=1). */
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  /** Whether to show the subtle glow at 100%+. */
  glowAtFull?: boolean;
  children?: React.ReactNode;
  ariaLabel?: string;
};

export function ProgressRing({
  progress,
  size = 88,
  stroke = 2,
  color,
  glowAtFull = true,
  children,
  ariaLabel,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const dash = c * clamped;
  const isFull = progress >= 1;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        className="-rotate-90"
        style={
          isFull && glowAtFull
            ? { filter: `drop-shadow(0 0 8px ${color}55)` }
            : undefined
        }
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={0.1}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 360ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center">{children}</div>
      )}
    </div>
  );
}
