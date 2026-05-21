"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Zap } from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { computeReadiness } from "@/lib/readiness";
import { computeStrainTarget, type StrainTargetResult } from "@/lib/strain-target";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const BRACKET_COLOR: Record<StrainTargetResult["bracket"], string> = {
  rest: "var(--color-fg-3)",
  light: "var(--pillar-strain)",
  moderate: "var(--color-warning)",
  high: "color-mix(in srgb, var(--color-warning) 60%, var(--color-danger) 40%)",
  peak: "var(--color-danger)",
};

const BRACKET_LABEL: Record<StrainTargetResult["bracket"], string> = {
  rest: "Rest",
  light: "Light",
  moderate: "Moderate",
  high: "High",
  peak: "Peak",
};

export function StrainTargetCard() {
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);

  const readiness = React.useMemo(
    () =>
      computeReadiness({
        health,
        liftSessions,
        today: todayStr(),
        waterTargetOz,
      }),
    [health, liftSessions, waterTargetOz]
  );

  const result = React.useMemo(
    () =>
      computeStrainTarget({
        readiness,
        liftSessions,
        today: todayStr(),
      }),
    [readiness, liftSessions]
  );

  const bracketColor = BRACKET_COLOR[result.bracket];
  const fillPct = Math.min(100, (result.current / Math.max(0.1, result.target)) * 100);
  const overshootPct =
    result.current > result.target
      ? Math.min(100, ((result.current - result.target) / Math.max(0.1, result.target)) * 100)
      : 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => haptic("tap")}
      className={cn(
        "w-full text-left overflow-hidden rounded-2xl p-4",
        "border active:scale-[0.99] transition-transform duration-[80ms] ease-out"
      )}
      style={{
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--pillar-strain) 14%, var(--color-card)) 0%, var(--color-card) 70%)",
        borderColor:
          "color-mix(in srgb, var(--pillar-strain) 28%, var(--color-stroke))",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5">
          <Zap size={13} style={{ color: "var(--pillar-strain)" }} strokeWidth={2.5} />
          <span
            className="text-[10px] uppercase tracking-[0.16em] font-semibold"
            style={{ color: "var(--pillar-strain)" }}
          >
            Strain target
          </span>
        </div>
        <span
          className="h-5 px-2 rounded-full text-[10px] uppercase tracking-wider font-semibold"
          style={{
            background: `color-mix(in srgb, ${bracketColor} 16%, transparent)`,
            color: bracketColor,
          }}
        >
          {BRACKET_LABEL[result.bracket]}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-bold tnum tracking-tight leading-none">
          {result.current.toFixed(1)}
        </span>
        <span className="text-[14px] text-[var(--color-fg-3)] tnum">
          / {result.target.toFixed(1)}
        </span>
      </div>

      <div className="mt-2 relative h-2 rounded-full bg-[var(--color-elevated)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-300"
          style={{
            width: `${fillPct}%`,
            background: "var(--pillar-strain)",
          }}
        />
        {overshootPct > 0 && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${Math.min(100, (result.target / Math.max(0.1, result.current)) * fillPct)}%`,
              width: `${overshootPct}%`,
              background:
                "color-mix(in srgb, var(--color-danger) 80%, transparent)",
            }}
          />
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--color-fg-2)] truncate">
          {result.headline}
        </span>
        <span className="text-[10px] text-[var(--color-fg-3)] tnum shrink-0">
          Wk avg {result.weekAvg.toFixed(1)}
        </span>
      </div>
    </motion.button>
  );
}
