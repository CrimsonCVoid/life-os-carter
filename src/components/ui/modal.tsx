"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

/**
 * iOS bottom-sheet modal.
 *
 * Present/dismiss is a pure CSS keyframe animation on translate3d — the
 * compositor runs it at the device's native refresh rate (120Hz on
 * ProMotion iPhones) with zero main-thread cost. We keep Framer Motion
 * ONLY for the drag-to-dismiss gesture because that needs JS to track
 * pointer movement; the moment the user releases, we either snap the
 * sheet back (via the same CSS curve) or dismiss it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: ModalProps) {
  // Mount/unmount with a CSS exit animation: keep the DOM around for one
  // extra animation frame after `open` flips to false, then unmount.
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isExiting, setIsExiting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsExiting(false);
      return;
    }
    if (!shouldRender) return;
    setIsExiting(true);
    const t = window.setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
    }, 220);
    return () => window.clearTimeout(t);
  }, [open, shouldRender]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/55 backdrop-blur-md",
          isExiting ? "animate-scrim-out" : "animate-scrim-in"
        )}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.28 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.y > 140 || info.velocity.y > 700) onClose();
        }}
        className={cn(
          "relative w-full bg-[var(--color-card)] border border-[var(--color-stroke)]",
          "rounded-t-[20px] rounded-b-none",
          "sm:rounded-[var(--radius-card)] sm:mb-0",
          "shadow-[var(--shadow-float)]",
          "flex flex-col max-h-[92dvh] touch-pan-y",
          // CSS keyframe present / dismiss — compositor-driven.
          isExiting ? "animate-panel-down" : "animate-panel-up",
          sizeClasses[size],
          className
        )}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          // Force GPU layer so the drag transforms stay on the compositor
          // thread instead of triggering paint on each pointermove.
          willChange: "transform",
          transform: "translate3d(0, 0, 0)",
        }}
      >
        <div className="pt-2 pb-1 grid place-items-center sm:hidden">
          <div className="h-[5px] w-9 rounded-full bg-[color:color-mix(in_srgb,var(--color-fg-3)_70%,transparent)]" />
        </div>
        <header className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-1">
          <div className="min-w-0">
            {title && (
              <div className="text-[17px] font-semibold tracking-tight">
                {title}
              </div>
            )}
            {description && (
              <div className="text-[13px] text-[var(--color-fg-2)] mt-1 leading-snug">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "h-9 w-9 grid place-items-center rounded-full shrink-0 -mr-1 -mt-1",
              "text-[var(--color-fg-2)] bg-[var(--color-elevated)]",
              "active:scale-[0.92] transition-transform duration-[60ms]"
            )}
          >
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto nice-scroll px-5 py-4">
          {children}
        </div>

        {footer && (
          <footer className="border-t border-[var(--color-stroke)] px-5 py-3">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>
  );
}
