"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * SwiftUI-feel Button with iOS-native haptic on every tap.
 *
 * The hack: render the visual button as a <div> wrapper, and overlay a
 * full-size `<input type="checkbox" switch>` on top with opacity:0. The
 * user's tap lands on the input — iOS 17.4+ Safari fires a real OS haptic
 * when a switch input toggles via user interaction. The original onClick
 * handler still fires through the input's onChange.
 *
 * We don't care what the checkbox's actual checked state is; we just need
 * it to flip each tap so iOS fires haptic. The visible content (text +
 * icons) has pointer-events:none so it never intercepts the tap from the
 * input underneath.
 *
 * Caveat: `type="submit"` no longer auto-submits a form — there are no
 * native form submissions in this app, so this is fine. If we ever need
 * one we'll call form.requestSubmit() in the handler.
 */

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "transition-[transform,opacity,background-color,border-color,box-shadow]",
    "duration-[80ms] ease-out",
    "active:scale-[0.96] active:opacity-90 active:duration-[60ms]",
    "disabled:pointer-events-none disabled:opacity-40",
    "accent-ring overflow-hidden",
    // GPU-layer promotion so the press-scale runs on the compositor at
    // the device's native refresh rate (120Hz on ProMotion iPhones).
    "transform-gpu will-change-transform",
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

type HapticKind = false | "tap" | "soft" | "success" | "warn" | "error" | "long";

export interface ButtonProps
  extends Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      "onClick" | "onKeyDown"
    >,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  haptic?: HapticKind;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
}

const Button = React.forwardRef<HTMLElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      onClick,
      disabled,
      haptic: hapticKind = "tap",
      children,
      type: _ignoredType,
      "aria-label": ariaLabel,
      onKeyDown,
      ...rest
    },
    ref
  ) => {
    void _ignoredType;
    const inputRef = React.useRef<HTMLInputElement>(null);
    const tickRef = React.useRef(false);

    // Imperatively set the `switch` attribute so iOS 17.4+ Safari recognizes
    // this as a switch element and fires native haptic on toggle.
    React.useEffect(() => {
      inputRef.current?.setAttribute("switch", "");
    }, []);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;
        tickRef.current = !tickRef.current;
        // Fallback (Android only — iOS Safari gates navigator.vibrate).
        if (hapticKind) haptic(hapticKind);
        // Re-cast the event so caller's button-typed onClick works as expected.
        onClick?.(e as unknown as React.MouseEvent<HTMLElement>);
        // Reset checked so consecutive same-action taps still fire change events.
        // Without this the second tap would just re-check the same state and
        // not fire change. We mutate via the DOM since React's controlled flow
        // would otherwise force checked back to false on render.
        if (inputRef.current && tickRef.current) {
          // Use a microtask so iOS finishes its haptic dispatch first.
          queueMicrotask(() => {
            if (inputRef.current) inputRef.current.checked = false;
            tickRef.current = false;
          });
        }
      },
      [disabled, hapticKind, onClick]
    );

    if (asChild) {
      // Slot pattern: the parent supplies its own element (e.g. <Link>).
      // We can't overlay an input on top of an arbitrary slotted child,
      // so asChild renders without the haptic input. Visual feedback still
      // works via the active:scale CSS.
      return (
        <Slot
          ref={ref as React.Ref<HTMLElement>}
          className={cn(buttonVariants({ variant, size }), className)}
          onClick={(e) => {
            if (disabled) return;
            if (hapticKind) haptic(hapticKind);
            onClick?.(e);
          }}
          {...rest}
        >
          {children}
        </Slot>
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        role="button"
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={cn(buttonVariants({ variant, size }), className)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
          onKeyDown?.(e);
        }}
        {...(rest as React.HTMLAttributes<HTMLDivElement>)}
      >
        {/* The real switch input — full-size, transparent, captures taps.
            iOS treats taps on this as user interaction with a switch
            element and fires native haptic on iOS 17.4+. */}
        <input
          ref={inputRef}
          type="checkbox"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 m-0 p-0 cursor-pointer"
        />
        {/* Visual content sits on top but accepts no pointer events, so
            taps fall through to the input behind it. */}
        <span className="relative inline-flex items-center gap-2 pointer-events-none">
          {children}
        </span>
      </div>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
