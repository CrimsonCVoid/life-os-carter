"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
import useSWR from "swr";
import { useDay } from "@/components/today/day-context";
import { useStore } from "@/store";
import {
  aggregateDailyStrain,
  STRAIN_BAND_LABEL,
  strainBandColor,
} from "@/lib/workout-strain";
import {
  computeStrainTarget,
  type StrainTargetResult,
} from "@/lib/strain-target";
import { computeReadiness } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import type { WorkoutHRSeries } from "@/lib/types";

/**
 * Daily strain rollup — Whoop-style. Sums TRIMP across every lift session
 * the user logged today that has an HR series, displays the resulting 0–21
 * strain score with band label, and compares to today's strain target so
 * the user knows whether they undershot, hit, or overshot.
 *
 * Hides on future days. Hides when there's no workout data for the day.
 */
export function DailyStrainCard() {
  const { date, isFuture } = useDay();
  const liftSessions = useStore((s) => s.liftSessions);
  const health = useStore((s) => s.health);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);

  const todaysSessions = React.useMemo(
    () => liftSessions.filter((s) => s.date === date),
    [liftSessions, date]
  );

  // Pull HR series for each of today's sessions. We fetch in parallel via
  // a single SWR call to the list endpoint (cheaper than N per-session
  // calls) and filter client-side.
  const { data: allSeries } = useSWR<WorkoutHRSeries[]>(
    todaysSessions.length > 0 ? "/api/data/workout-hr-series" : null
  );

  const todaysSeries = React.useMemo<WorkoutHRSeries[]>(() => {
    if (!allSeries || todaysSessions.length === 0) return [];
    const idSet = new Set(todaysSessions.map((s) => s.id));
    return allSeries.filter((hr) => idSet.has(hr.sessionId));
  }, [allSeries, todaysSessions]);

  const dailyStrain = React.useMemo(
    () => aggregateDailyStrain(todaysSeries),
    [todaysSeries]
  );

  const target = React.useMemo<StrainTargetResult | null>(() => {
    const readiness = computeReadiness({
      health,
      liftSessions,
      today: date,
      waterTargetOz,
    });
    return computeStrainTarget({
      readiness,
      liftSessions,
      today: date,
    });
  }, [health, liftSessions, date, waterTargetOz]);

  if (isFuture) return null;
  if (todaysSessions.length === 0) return null;
  if (!dailyStrain) {
    // Sessions exist but no HR data yet — show a stub prompting sync
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-card)] p-4"
      >
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: "var(--pillar-strain)" }} />
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-3)] font-semibold">
            Daily strain
          </span>
        </div>
        <div className="mt-2 text-xs text-[var(--color-fg-2)]">
          {todaysSessions.length}{" "}
          {todaysSessions.length === 1 ? "workout" : "workouts"} logged · waiting
          for Google Health to sync heart-rate data.
        </div>
      </motion.div>
    );
  }

  const targetScore = target?.target ?? null;
  const overshootPct =
    targetScore != null && targetScore > 0
      ? Math.round(((dailyStrain.score - targetScore) / targetScore) * 100)
      : null;
  const color = strainBandColor(dailyStrain.band);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border p-4"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 16%, var(--color-card)) 0%, var(--color-card) 75%)`,
        borderColor: `color-mix(in srgb, ${color} 30%, var(--color-stroke))`,
      }}
    >
      <div className="flex items-center gap-2">
        <Activity size={14} style={{ color }} strokeWidth={2.5} />
        <span
          className="text-[10px] uppercase tracking-[0.16em] font-semibold"
          style={{ color }}
        >
          Daily strain
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[44px] font-bold tnum leading-none" style={{ color }}>
            {dailyStrain.score.toFixed(1)}
          </span>
          <span className="text-[14px] text-[var(--color-fg-2)] tnum">/ 21</span>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-semibold" style={{ color }}>
            {STRAIN_BAND_LABEL[dailyStrain.band]}
          </div>
          {targetScore != null && (
            <div className="text-[10px] text-[var(--color-fg-3)] tnum">
              target {targetScore.toFixed(1)}
              {overshootPct != null && Math.abs(overshootPct) >= 5 && (
                <>
                  {" · "}
                  <span
                    style={{
                      color:
                        overshootPct > 0
                          ? "var(--color-warning)"
                          : "var(--color-fg-3)",
                    }}
                  >
                    {overshootPct > 0 ? "+" : ""}
                    {overshootPct}%
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat
          label="Work"
          value={`${dailyStrain.workMinutes}`}
          unit="min"
        />
        <Stat
          label="High intensity"
          value={`${dailyStrain.highIntensityMinutes}`}
          unit="min"
        />
        <Stat
          label="Avg %HRR"
          value={`${Math.round(dailyStrain.averagePercentHRR * 100)}`}
          unit="%"
        />
      </div>

      {target?.headline && (
        <div className="mt-3 text-[11px] text-[var(--color-fg-2)] leading-snug">
          {target.headline}
        </div>
      )}
    </motion.div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-stroke)] py-2 px-1.5",
        "bg-[color:color-mix(in_srgb,var(--color-elevated)_40%,transparent)]"
      )}
    >
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-semibold tnum text-[var(--color-fg)]">
        {value}
        <span className="ml-0.5 text-[10px] text-[var(--color-fg-3)] font-normal">
          {unit}
        </span>
      </div>
    </div>
  );
}
