"use client";

import * as React from "react";
import { CountUp } from "./count-up";

type Props = {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  showLabel?: boolean;
};

export function ScoreRing({
  value,
  size = 80,
  stroke = 7,
  showLabel = true,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const offset = c * (1 - v);
  const pct = Math.round(v * 100);

  return (
    <div
      role="img"
      aria-label={`Day score ${pct}%`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-stroke-strong)"
          strokeWidth={stroke}
          fill="none"
          opacity={0.7}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="ring-anim"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 grid place-items-center">
          <CountUp
            value={pct}
            suffix="%"
            className="text-[15px] font-semibold tabular-nums"
          />
        </div>
      )}
    </div>
  );
}
