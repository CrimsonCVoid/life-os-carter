"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  marks?: number[];
};

export function Slider({
  value,
  min = 0,
  max = 10,
  step = 1,
  onChange,
  className,
  marks,
}: Props) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("relative w-full select-none", className)}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-grab active:cursor-grabbing"
        aria-label="slider"
      />
      <div className="h-2.5 rounded-full bg-[var(--color-elevated)] border border-[var(--color-stroke)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent-strong)]"
          style={{ width: `${pct}%`, transition: "width 120ms ease" }}
        />
      </div>
      <div
        className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-[var(--shadow-float)] pointer-events-none"
        style={{
          left: `calc(${pct}% - 0.625rem)`,
          transition: "left 120ms ease",
        }}
      />
      {marks && (
        <div className="flex justify-between mt-2 px-0.5">
          {marks.map((m) => (
            <span
              key={m}
              className="text-[10px] text-[var(--color-fg-3)] tnum"
            >
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
