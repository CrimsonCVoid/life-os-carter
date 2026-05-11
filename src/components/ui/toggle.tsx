"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

export function Toggle({
  checked,
  onChange,
  label,
  size = "md",
  className,
  ...rest
}: Props) {
  const w = size === "sm" ? 36 : 44;
  const h = size === "sm" ? 20 : 26;
  const knob = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"] ?? label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors",
        checked
          ? "bg-[var(--color-accent-strong)]"
          : "bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
        className
      )}
      style={{ width: w, height: h }}
    >
      <span
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-all"
        style={{
          width: knob,
          height: knob,
          left: checked ? w - knob - 3 : 3,
        }}
      />
    </button>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && (
          <div className="text-xs text-[var(--color-fg-3)] mt-0.5">
            {description}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
