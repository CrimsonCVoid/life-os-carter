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
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className={cn(
              "relative w-full card rounded-b-none sm:rounded-b-[var(--radius-card)] sm:mb-0 flex flex-col max-h-[90dvh] touch-pan-y",
              sizeClasses[size],
              className
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Drag-handle pill — visible on mobile, decorative on desktop */}
            <div className="pt-2 pb-1 grid place-items-center sm:hidden">
              <div className="h-1 w-9 rounded-full bg-[var(--color-stroke-strong)]" />
            </div>
            <header className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-1">
              <div className="min-w-0">
                {title && (
                  <div className="text-base font-semibold tracking-tight">
                    {title}
                  </div>
                )}
                {description && (
                  <div className="text-xs text-[var(--color-fg-2)] mt-1">
                    {description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition shrink-0 -mr-2 -mt-2"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto nice-scroll px-5 py-4">
              {children}
            </div>

            {footer && (
              <footer className="border-t border-[var(--color-stroke)] px-5 py-4">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
