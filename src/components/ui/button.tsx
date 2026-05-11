import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 accent-ring select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent-strong)] text-white hover:bg-[var(--color-accent)] shadow-[var(--shadow-glow)]",
        secondary:
          "bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg)] hover:border-[var(--color-stroke-strong)]",
        ghost:
          "text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)]",
        soft:
          "bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:brightness-110",
        danger:
          "bg-[color:color-mix(in_srgb,var(--color-danger)_18%,transparent)] text-[var(--color-danger)] hover:brightness-110",
        outline:
          "border border-[var(--color-stroke-strong)] text-[var(--color-fg)] hover:bg-[var(--color-elevated)]",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-[10px]",
        default: "h-11 px-4 text-sm rounded-xl",
        lg: "h-12 px-5 text-base rounded-xl",
        icon: "h-10 w-10 rounded-xl",
        iconSm: "h-8 w-8 rounded-lg",
        pill: "h-9 px-4 text-xs rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
