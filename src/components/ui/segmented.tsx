"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Option<T extends string> = { value: T; label: React.ReactNode };

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center p-1 rounded-xl bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
        size === "sm" ? "h-9" : "h-11",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (!active) haptic("selection");
              onChange(o.value);
            }}
            className={cn(
              "h-full px-3 rounded-lg text-xs font-medium transition active:scale-[0.97]",
              active
                ? "bg-[var(--color-card)] text-[var(--color-fg)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_12px_-6px_rgba(0,0,0,0.4)]"
                : "text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
