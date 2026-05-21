"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Footprints, ChevronRight, Flame } from "lucide-react";
import useSWR from "swr";
import { useDay } from "@/components/today/day-context";
import { useStepsRange, useCardioLoadRange } from "@/lib/hooks/use-metrics";
import { useStore } from "@/store";
import { shiftDate } from "@/lib/date";
import { metricHex } from "@/lib/metric-colors";
import { cn } from "@/lib/utils";
import type { WorkoutHRSeries } from "@/lib/types";

/**
 * Movement lane — non-strength activity. Today's steps, weekly cardio
 * load (already a v2 concept), and the high-intensity minutes pulled
 * from any HR-tracked workouts today.
 */
export function MovementLane() {
  const { date } = useDay();
  const stepsRange = useStepsRange(date, date);
  const cardioRange = useCardioLoadRange(shiftDate(date, -6), date);
  const liftSessions = useStore((s) => s.liftSessions);

  const stepsToday = React.useMemo<number>(() => {
    const data = stepsRange.data as Array<{ date: string; count?: number }> | undefined;
    return data?.find((r) => r?.date === date)?.count ?? 0;
  }, [stepsRange.data, date]);

  const weeklyCardio = React.useMemo<number>(() => {
    const data = cardioRange.data as Array<{ date: string; minutes?: number }> | undefined;
    return data?.reduce((acc, r) => acc + (r?.minutes ?? 0), 0) ?? 0;
  }, [cardioRange.data]);

  // High-intensity minutes today — sum Z4+Z5 across any HR series whose
  // session was today.
  const todaysSessionIds = React.useMemo(
    () => new Set(liftSessions.filter((s) => s.date === date).map((s) => s.id)),
    [liftSessions, date]
  );
  const { data: allSeries } = useSWR<WorkoutHRSeries[]>(
    todaysSessionIds.size > 0 ? "/api/data/workout-hr-series" : null
  );
  const highIntensityMin = React.useMemo<number>(() => {
    if (!allSeries) return 0;
    let sum = 0;
    for (const hr of allSeries) {
      if (!todaysSessionIds.has(hr.sessionId)) continue;
      sum += (hr.zoneMinutes?.zone4 ?? 0) + (hr.zoneMinutes?.zone5 ?? 0);
    }
    return sum;
  }, [allSeries, todaysSessionIds]);

  const stepsTarget = 10000;
  const stepsPct = Math.min(1, stepsToday / stepsTarget);
  const accent = metricHex("steps");

  return (
    <Link href="/stats" aria-label="Movement details">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative w-full rounded-2xl border overflow-hidden p-4",
          "active:scale-[0.995] transition-transform duration-[80ms]"
        )}
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, var(--color-card)) 0%, var(--color-card) 70%)`,
          borderColor: `color-mix(in srgb, ${accent} 28%, var(--color-stroke))`,
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <Footprints size={13} style={{ color: accent }} strokeWidth={2.5} />
            <span
              className="text-[10px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: accent }}
            >
              Movement
            </span>
          </div>
          <ChevronRight size={14} className="text-[var(--color-fg-3)]" />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-bold tnum leading-none text-[var(--color-fg)]">
                {stepsToday.toLocaleString()}
              </span>
              <span className="text-[11px] text-[var(--color-fg-3)] uppercase tracking-wider">
                steps
              </span>
            </div>
            <div className="text-[11px] text-[var(--color-fg-3)] mt-0.5 tnum">
              of {stepsTarget.toLocaleString()} · {Math.round(stepsPct * 100)}%
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[var(--color-elevated)] overflow-hidden border border-[var(--color-stroke)]">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${stepsPct * 100}%`,
                  background: `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 60%, white) 100%)`,
                }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
              Cardio · 7d
            </div>
            <div className="text-[18px] font-bold tnum leading-none text-[var(--color-fg)] tnum mt-0.5">
              {Math.round(weeklyCardio)}
              <span className="text-[11px] text-[var(--color-fg-3)] font-normal ml-0.5">
                min
              </span>
            </div>
          </div>
        </div>

        {highIntensityMin > 0 && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--mc-calories) 16%, transparent)",
              color: "var(--mc-calories)",
            }}
          >
            <Flame size={11} />
            {highIntensityMin} high-intensity min today
          </div>
        )}
      </motion.div>
    </Link>
  );
}
