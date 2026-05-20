"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

// Press feel = SwiftUI Button: instantaneous scale to 0.96, brief opacity step
// to 0.85, snap back via spring. No hover states — iOS Safari leaves :hover
// "stuck" after a tap (you stay highlighted until you tap somewhere else),
// which looks broken. We use :active for the press feedback and the
// device-aware @media (hover: hover) gate for true mouse hover.
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "transition-[transform,opacity,background-color,border-color,box-shadow]",
    "duration-150 ease-[var(--ease-spring)]",
    "active:scale-[0.96] active:opacity-90",
    "disabled:pointer-events-none disabled:opacity-40",
    "accent-ring",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent-strong)] text-white shadow-[var(--shadow-glow)] hover-mouse:bg-[var(--color-accent)]",
        secondary:
          "bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg)] hover-mouse:border-[var(--color-stroke-strong)]",
        ghost:
          "text-[var(--color-fg-2)] hover-mouse:text-[var(--color-fg)] hover-mouse:bg-[var(--color-elevated)]",
        soft:
          "bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover-mouse:brightness-110",
        danger:
          "bg-[color:color-mix(in_srgb,var(--color-danger)_18%,transparent)] text-[var(--color-danger)] hover-mouse:brightness-110",
        outline:
          "border border-[var(--color-stroke-strong)] text-[var(--color-fg)] hover-mouse:bg-[var(--color-elevated)]",
      },
      size: {
        // iOS HIG: 44pt minimum tap target. We over-shoot at 44px (h-11) for
        // default + lg, 36px for sm with extra invisible hit area via padding.
        sm: "h-9 px-3 text-[13px] rounded-[10px] font-semibold",
        default: "h-11 px-4 text-[15px] rounded-xl font-semibold",
        lg: "h-12 px-5 text-[16px] rounded-xl font-semibold",
        icon: "h-11 w-11 rounded-xl",
        iconSm: "h-9 w-9 rounded-[10px]",
        pill: "h-9 px-4 text-[13px] rounded-full font-semibold",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Default "tap". Pass `false` to suppress haptic (e.g. inside a longer flow
   *  where another haptic plays). Pass a specific kind like "success" for the
   *  final action of a flow. */
  haptic?: false | "tap" | "soft" | "success" | "warn" | "error" | "long";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      onClick,
      haptic: hapticKind = "tap",
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (hapticKind) haptic(hapticKind);
        onClick?.(e);
      },
      [hapticKind, onClick]
    );
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={handleClick}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
