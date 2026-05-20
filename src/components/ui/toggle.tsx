"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

/**
 * Toggle — renders as a native `<input type="checkbox" switch>` underneath
 * the custom pill UI. iOS 17.4+ Safari recognizes the `switch` attribute
 * and fires a real OS-level haptic when the user flips it. The visible
 * skin sits on top via absolute positioning; the input itself is invisible
 * but full-size, so taps land on it (and Safari handles the haptic).
 *
 * Browsers without `switch` support fall back to a normal checkbox — the
 * visual chrome still works, just no native haptic.
 */
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
    <label
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full select-none",
        "transition-colors duration-150 ease-out",
        checked
          ? "bg-[var(--color-accent-strong)]"
          : "bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
        className
      )}
      style={{ width: w, height: h }}
      aria-label={rest["aria-label"] ?? label}
    >
      {/* Native iOS switch element — fires a real haptic when toggled on
       * iOS 17.4+. Visually hidden but accepts the tap. Using JSX
       * 'is="..."' via spread because the `switch` attribute isn't in
       * React's typings yet. */}
      <input
        type="checkbox"
        role="switch"
        // @ts-expect-error — `switch` is an HTML attribute added in iOS 17.4
        // for native haptic toggle behavior; React's typings don't have it.
        switch=""
        checked={checked}
        onChange={(e) => {
          // Fallback vibrate for Android (no-op on iOS).
          haptic("tap");
          onChange(e.currentTarget.checked);
        }}
        aria-label={rest["aria-label"] ?? label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-full bg-white",
          "shadow-[0_2px_6px_rgba(0,0,0,0.4)]",
          "transition-[left,transform] duration-150 ease-out",
          // pressed knob slightly elongates per iOS — done with scaleX on the
          // parent label's :active state by reading from the input.
        )}
        style={{
          width: knob,
          height: knob,
          left: checked ? w - knob - 3 : 3,
        }}
      />
    </label>
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
        <div className="text-[15px]">{label}</div>
        {description && (
          <div className="text-[12px] text-[var(--color-fg-3)] mt-0.5">
            {description}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}
