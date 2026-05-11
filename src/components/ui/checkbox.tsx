"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  checked: boolean;
  onChange: () => void;
  label?: string;
  size?: number;
  className?: string;
};

export function Checkbox({
  checked,
  onChange,
  label,
  size = 22,
  className,
}: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? "Checkbox"}
      onClick={onChange}
      className={cn(
        "shrink-0 grid place-items-center rounded-md border transition active:scale-90",
        checked
          ? "bg-[var(--color-accent-strong)] border-[var(--color-accent-strong)] text-white"
          : "bg-transparent border-[var(--color-stroke-strong)] hover:border-[var(--color-fg-2)]",
        className
      )}
      style={{ width: size, height: size }}
    >
      {checked && <Check size={size * 0.62} strokeWidth={3.2} />}
    </button>
  );
}
