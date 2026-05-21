"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * RepCount-style number stepper. Big +/- pads on each side, huge center
 * value display. Long-press a pad to repeat increments (every 80ms after
 * 350ms hold). No keyboard pops up — the entire interaction is taps.
 *
 * If the user wants to type a precise number, tap the center value — it
 * swaps to a text input briefly (handled by InlineEdit if you need to wire
 * one).
 */

type Props = {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Suffix rendered below the value (e.g. "lb", "reps"). */
  unit?: string;
  /** Display label rendered above the stepper. */
  label?: string;
  /** Decimal places to display. Defaults to 0 for integer-feel. */
  decimals?: number;
  /** Optional accent for the unit + label color. Defaults to fg-3. */
  accentColor?: string;
};

export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999999,
  unit,
  label,
  decimals = 0,
  accentColor = "var(--color-fg-3)",
}: Props) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const dec = () => {
    const next = clamp(round(value - step, decimals));
    if (next !== value) {
      onChange(next);
      haptic("soft");
    }
  };
  const inc = () => {
    const next = clamp(round(value + step, decimals));
    if (next !== value) {
      onChange(next);
      haptic("soft");
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      {label && (
        <div
          className="text-[10px] uppercase tracking-wider text-center"
          style={{ color: accentColor }}
        >
          {label}
        </div>
      )}
      <div className="flex items-center gap-2">
        <RepeatPressButton onPress={dec} aria-label="Decrease">
          <Minus size={20} strokeWidth={2.5} />
        </RepeatPressButton>
        <div className="flex-1 flex flex-col items-center justify-center min-w-0">
          <span className="text-[34px] leading-none font-bold tnum tracking-tight">
            {value.toFixed(decimals)}
          </span>
          {unit && (
            <span
              className="text-[11px] uppercase tracking-wider mt-0.5"
              style={{ color: accentColor }}
            >
              {unit}
            </span>
          )}
        </div>
        <RepeatPressButton onPress={inc} aria-label="Increase">
          <Plus size={20} strokeWidth={2.5} />
        </RepeatPressButton>
      </div>
    </div>
  );
}

/**
 * Press-and-hold button. Fires onPress once on initial press, then again
 * every 80ms after a 350ms hold (auto-repeat). Releases cancel the loop.
 * The repeat speeds up after 2 seconds to make scrubbing through big
 * ranges (e.g. weight from 45 → 225) feel fast.
 */
function RepeatPressButton({
  onPress,
  children,
  "aria-label": ariaLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const initialTimerRef = React.useRef<number | null>(null);
  const repeatTimerRef = React.useRef<number | null>(null);
  const fastRepeatTimerRef = React.useRef<number | null>(null);

  const clear = () => {
    if (initialTimerRef.current) {
      window.clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (repeatTimerRef.current) {
      window.clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    if (fastRepeatTimerRef.current) {
      window.clearTimeout(fastRepeatTimerRef.current);
      fastRepeatTimerRef.current = null;
    }
  };

  const handleDown = () => {
    onPress();
    // After 350ms hold, start repeating every 80ms.
    initialTimerRef.current = window.setTimeout(() => {
      repeatTimerRef.current = window.setInterval(onPress, 80);
      // After another 2 seconds, switch to faster 40ms repeat.
      fastRepeatTimerRef.current = window.setTimeout(() => {
        if (repeatTimerRef.current) window.clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = window.setInterval(onPress, 40);
      }, 2000);
    }, 350);
  };

  React.useEffect(() => clear, []);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        handleDown();
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      className={cn(
        "h-14 w-14 grid place-items-center rounded-2xl shrink-0",
        "bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
        "text-[var(--color-fg)] active:scale-[0.94] active:bg-[var(--color-card-hover)]",
        "transition-[transform,background-color] duration-[60ms] ease-out",
        "select-none"
      )}
    >
      {children}
    </button>
  );
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
