"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { useDay } from "@/components/today/day-context";
import { useMealsForDate } from "@/lib/hooks/use-meals";
import { cn } from "@/lib/utils";
import {
  computeMacroProgress,
  type MacroProgress,
} from "@/lib/macro-progress";
import type { Meal } from "@/lib/types";

const RING_SIZE = 96;
const RING_STROKE = 10;

export function MacroRings() {
  const { date, isFuture } = useDay();
  const { meals } = useMealsForDate(date);
  const macroTargets = useStore((s) => s.settings.macroTargets);

  if (isFuture) return null;

  const hasTargets =
    !!macroTargets &&
    Object.values(macroTargets).some(
      (v) => typeof v === "number" && v > 0
    );

  if (!hasTargets) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Macros</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--color-fg-2)] leading-snug">
            Track calories, protein, carbs and fat against daily goals.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link href="/settings#macros">Set targets</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const progress = computeMacroProgress({
    meals: meals as unknown as Meal[],
    date,
    targets: macroTargets!,
  });

  const calories = progress.find((p) => p.metric === "calories");
  const bars = progress.filter(
    (p) => p.metric === "protein" || p.metric === "carbs" || p.metric === "fat"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Macros</CardTitle>
        <span className="text-[11px] text-[var(--color-fg-3)] tnum">Today</span>
      </CardHeader>
      <div className="flex items-center gap-5">
        {calories ? (
          <CaloriesRing item={calories} />
        ) : (
          <div className="text-[11px] text-[var(--color-fg-3)] w-[96px] text-center">
            No kcal target
          </div>
        )}
        <div className="flex-1 flex flex-col gap-3">
          {bars.map((b, i) => (
            <motion.div
              key={b.metric}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.32,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.04 * i,
              }}
            >
              <MacroBar item={b} />
            </motion.div>
          ))}
          {bars.length === 0 && (
            <p className="text-[11px] text-[var(--color-fg-3)]">
              Add protein / carbs / fat targets in settings.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function CaloriesRing({ item }: { item: MacroProgress }) {
  const radius = RING_SIZE / 2 - RING_STROKE / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const pct = clamp01(item.pct);
  const offset = circumference * (1 - pct);
  const center = RING_SIZE / 2;

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        style={{ transform: "translateZ(0)" }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={item.color}
          strokeOpacity={0.18}
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={item.color}
          strokeWidth={RING_STROKE}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: "stroke-dashoffset 480ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[18px] font-semibold tnum leading-none">
          {formatNumber(item.current)}
        </span>
        <span className="text-[10px] text-[var(--color-fg-3)] tnum mt-1">
          / {formatNumber(item.target)}
        </span>
      </div>
    </motion.div>
  );
}

function MacroBar({ item }: { item: MacroProgress }) {
  const pct = clamp01(item.pct);
  const letter = item.metric.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-5 w-5 grid place-items-center rounded-full shrink-0 text-[10px] font-semibold"
        style={{
          background: `color-mix(in srgb, ${item.color} 18%, transparent)`,
          color: item.color,
        }}
      >
        {letter}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
            {item.label}
          </span>
          <span className="text-[11px] tnum text-[var(--color-fg-2)]">
            <span className={cn("font-semibold", statusColorClass(item.status))}>
              {formatNumber(item.current)}
            </span>
            <span className="text-[var(--color-fg-3)]">
              {" / "}
              {formatNumber(item.target)}g
            </span>
          </span>
        </div>
        <div
          className="mt-1 h-1.5 rounded-full overflow-hidden"
          style={{
            background: `color-mix(in srgb, ${item.color} 12%, transparent)`,
          }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(pct * 100)}%`,
              background: item.color,
              transition: "width 480ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function statusColorClass(status: MacroProgress["status"]): string {
  if (status === "over") return "text-[var(--color-warning)]";
  if (status === "on") return "text-[var(--color-success)]";
  return "text-[var(--color-fg)]";
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return n.toLocaleString();
  return String(Math.round(n));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
