import * as React from "react";
import { cn } from "@/lib/utils";

type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "accent" | "success" | "warn" | "danger" | "neutral";
};

const TONES: Record<NonNullable<PillProps["tone"]>, string> = {
  default:
    "bg-[var(--color-elevated)] text-[var(--color-fg-2)] border-[var(--color-stroke)]",
  accent:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]",
  success:
    "bg-[color:color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color:color-mix(in_srgb,var(--color-success)_24%,transparent)]",
  warn:
    "bg-[color:color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)] border-[color:color-mix(in_srgb,var(--color-warning)_24%,transparent)]",
  danger:
    "bg-[color:color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)] border-[color:color-mix(in_srgb,var(--color-danger)_24%,transparent)]",
  neutral:
    "bg-transparent text-[var(--color-fg-2)] border-[var(--color-stroke)]",
};

export function Pill({
  className,
  tone = "default",
  ...props
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-medium border",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}
