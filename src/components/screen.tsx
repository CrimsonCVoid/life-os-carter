"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Props = {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
};

export function Screen({ children, className, title, subtitle }: Props) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "mx-auto w-full max-w-[640px] px-4 pt-4 pb-[7.5rem]",
        className
      )}
    >
      {(title || subtitle) && (
        <header className="mb-5">
          {title && (
            <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
          )}
          {subtitle && (
            <p className="text-sm text-[var(--color-fg-2)] mt-1">{subtitle}</p>
          )}
        </header>
      )}
      <div className="space-y-4">{children}</div>
    </motion.main>
  );
}
