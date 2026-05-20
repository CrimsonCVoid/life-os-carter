"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* iOS-style dim with backdrop blur. Pure black overlay reads
           * better against the dark base than a tinted one. */}
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            // Pure tween — explicit duration with iOS easing. Framer's spring
            // physics ran rAF on the main thread, which on iOS PWA shares with
            // React reconciliation and dropped frames. A CSS-style tween is
            // shorter and compositor-driven once the transform settles.
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.28 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.y > 140 || info.velocity.y > 700) onClose();
            }}
            className={cn(
              // iOS sheet: rounded ONLY on top corners when bottom-anchored.
              // On desktop / sm:, full rounded card.
              "relative w-full bg-[var(--color-card)] border border-[var(--color-stroke)]",
              "rounded-t-[20px] rounded-b-none",
              "sm:rounded-[var(--radius-card)] sm:mb-0",
              "shadow-[var(--shadow-float)]",
              "flex flex-col max-h-[92dvh] touch-pan-y",
              sizeClasses[size],
              className
            )}
            style={{
              paddingBottom: "env(safe-area-inset-bottom)",
              willChange: "transform",
            }}
          >
            {/* Drag grabber — iOS-standard 36×5px pill, ~6pt above content. */}
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
                  "active:scale-[0.92] transition-transform"
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
      )}
    </AnimatePresence>
  );
}
