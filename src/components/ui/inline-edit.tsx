"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tap-to-edit value. Renders as a styled span by default; on tap, swaps
 * to an <input> sized to fit, focuses it, selects all. Blur or Enter
 * commits via onCommit. Escape cancels.
 *
 * Used for the iOS-native "tap a number to change it" pattern — no modal
 * trip, no save button.
 */

type Props = {
  /** Current value as displayed (e.g. "16", "8.5"). Pass the formatted number. */
  value: string;
  /** Called when the user commits a change. Receives the raw input string. */
  onCommit: (next: string) => void;
  /** Optional units rendered as a non-editable suffix (e.g. "oz", "lb", "h"). */
  unit?: string;
  /** Placeholder for empty state. */
  placeholder?: string;
  /** Input type — defaults to "text" but "number" or "decimal" routes to the right iOS keyboard. */
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** Step / min / max forwarded to the underlying input. */
  step?: number | string;
  min?: number | string;
  max?: number | string;
  /** Display class applied to the read-only span (typography, color, etc). */
  className?: string;
  /** Class applied to the wrapping element (controls the layout). */
  wrapperClassName?: string;
  /** Aria-label for the editable region. */
  "aria-label"?: string;
  /** When true, rendering a 0 still shows "—" rather than "0" so empty values
   *  read as empty. */
  treatZeroAsEmpty?: boolean;
};

export function InlineEdit({
  value,
  onCommit,
  unit,
  placeholder = "—",
  inputMode = "decimal",
  step,
  min,
  max,
  className,
  wrapperClassName,
  "aria-label": ariaLabel,
  treatZeroAsEmpty,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  React.useEffect(() => {
    if (editing) {
      // Focus + select on next frame so the input is mounted.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const isEmpty =
    !value ||
    value === "0" ||
    value === "—" ||
    (treatZeroAsEmpty && parseFloat(value) === 0);

  if (editing) {
    return (
      <span
        className={cn(
          "inline-flex items-baseline gap-1",
          wrapperClassName
        )}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode={inputMode}
          step={step}
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          aria-label={ariaLabel}
          className={cn(
            "bg-[var(--color-elevated)] rounded-md px-1.5 py-0.5",
            "border border-[var(--color-accent)] outline-none",
            "min-w-[2ch] tnum",
            // 17px to suppress iOS focus zoom.
            "text-[17px] font-semibold",
            className
          )}
          style={{ width: `${Math.max(2, draft.length + 1)}ch` }}
        />
        {unit && (
          <span className="text-[11px] text-[var(--color-fg-3)]">{unit}</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-baseline gap-1 px-1 -mx-1 rounded-md",
        "active:bg-[var(--color-elevated)] transition-colors duration-100",
        wrapperClassName
      )}
    >
      <span className={cn("tnum", isEmpty && "text-[var(--color-fg-3)]", className)}>
        {isEmpty ? placeholder : value}
      </span>
      {unit && !isEmpty && (
        <span className="text-[11px] text-[var(--color-fg-3)]">{unit}</span>
      )}
    </button>
  );
}
