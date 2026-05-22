"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { computeReadiness } from "@/lib/readiness";
import {
  aggregateDailyStrain,
} from "@/lib/workout-strain";
import { writeTodaySnapshot } from "@/lib/native/shared-storage";
import type { WorkoutHRSeries } from "@/lib/types";
import useSWR from "swr";

/**
 * Background component — every time today's relevant data changes,
 * rewrites the App Group snapshot so widgets reflect it on next refresh.
 * No-op on web. Mount once at app-shell level.
 */
export function SnapshotWriter() {
  const date = todayStr();
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);
  const macroTargets = useStore((s) => s.settings.macroTargets);

  // HR series for today's sessions (drives strain rollup)
  const { data: allSeries } = useSWR<WorkoutHRSeries[]>(
    "/api/data/workout-hr-series"
  );

  React.useEffect(() => {
    const todaysSessionIds = new Set(
      liftSessions.filter((s) => s.date === date).map((s) => s.id)
    );
    const todaysSeries =
      allSeries?.filter((hr) => todaysSessionIds.has(hr.sessionId)) ?? [];
    const strain = aggregateDailyStrain(todaysSeries);
    const readiness = computeReadiness({
      health,
      liftSessions,
      today: date,
      waterTargetOz,
    });
    const log = health[date];
    const sleep = log?.sleepHours ?? null;
    const steps = log?.steps ?? null;
    const calories = null; // not stored on HealthLog; derive later from meals
    const calTarget = macroTargets?.calories ?? null;
    const caloriesPct =
      calories != null && calTarget && calTarget > 0
        ? Math.min(1, calories / calTarget)
        : null;

    void writeTodaySnapshot({
      date,
      strain: strain?.score ?? null,
      readiness: readiness?.score ?? null,
      sleep,
      steps,
      calories,
      caloriesPct,
      updatedAt: Date.now(),
    });
  }, [
    date,
    health,
    liftSessions,
    waterTargetOz,
    macroTargets,
    allSeries,
  ]);

  return null;
}
