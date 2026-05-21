"use client";

import * as React from "react";
import { motion, PanInfo } from "motion/react";
import { Screen } from "@/components/screen";
import { TodayHeader } from "@/components/today/header";
import { AttentionTicker } from "@/components/today/attention-ticker";
import { MorningBriefing } from "@/components/today/morning-briefing";
import { MorningRoutine } from "@/components/today/morning-routine";
import { EveningRoutine } from "@/components/today/evening-routine";
import { Goals } from "@/components/today/goals";
import { TodayRoutineCard } from "@/components/today/today-routine-card";
import { DailyStrainCard } from "@/components/today/daily-strain-card";
import { ReflectionCard } from "@/components/today/reflection";
import { WeeklyReviewCard } from "@/components/today/weekly-review-card";
import { PatternCard } from "@/components/today/pattern-card";
import { DashboardHero } from "@/components/today/dashboard-hero";
import { FuelCard } from "@/components/today/fuel-card";
import { PerformanceLane } from "@/components/today/performance-lane";
import { RecoveryLane } from "@/components/today/recovery-lane";
import { MovementLane } from "@/components/today/movement-lane";
import { DayProvider, useDay } from "@/components/today/day-context";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { maybeAutoSync } from "@/lib/integrations/google-health/sync-client";
import { PhotoDayBanner } from "@/components/body/photo-day-banner";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { mutate as swrMutate } from "swr";

export default function Page() {
  React.useEffect(() => {
    // Fire-and-forget; the sync client guards against concurrency and
    // freshness so this is safe to call on every mount.
    void maybeAutoSync();
  }, []);
  return (
    <DayProvider>
      <DaySurface />
    </DayProvider>
  );
}

function DaySurface() {
  const { step, canGoBack, canGoForward } = useDay();
  const swipeEnabled = useStore((s) => s.settings.dayNavigation.swipeEnabled);

  const onPanEnd = (
    _e: PointerEvent | MouseEvent | TouchEvent,
    info: PanInfo
  ) => {
    if (!swipeEnabled) return;
    // Require a decisive horizontal swipe; ignore drift / vertical motion.
    const dx = info.offset.x;
    const dy = info.offset.y;
    const vx = info.velocity.x;
    if (Math.abs(dy) > Math.abs(dx)) return;
    const fast = Math.abs(vx) > 400;
    const far = Math.abs(dx) > 80;
    if (!fast && !far) return;
    if (dx < 0 && canGoForward) {
      haptic("tap");
      step(1);
    } else if (dx > 0 && canGoBack) {
      haptic("tap");
      step(-1);
    }
  };

  /** Revalidate every /api/data/* SWR cache key + nudge a sync. The
   *  pull-to-refresh handler awaits this so the spinner stays up until
   *  the new data lands. */
  const onRefresh = React.useCallback(async () => {
    await Promise.all([
      swrMutate(
        (k) => typeof k === "string" && k.startsWith("/api/data/"),
        undefined,
        { revalidate: true }
      ),
      maybeAutoSync(),
    ]);
  }, []);

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <motion.div
        onPanEnd={swipeEnabled ? onPanEnd : undefined}
        // Allow vertical scroll; only intercept horizontal pans
        style={{ touchAction: "pan-y" }}
      >
        <Screen>
          <TodayHeader />
          <PhotoDayBanner placement="today" />
          <AttentionTicker />
          <DashboardHero />
          <PerformanceLane />
          <RecoveryLane />
          <FuelCard />
          <MovementLane />
          <DailyStrainCard />
          <MorningBriefing />
          <WeeklyReviewCard />
          <PatternCard />
          <PresentOrPastBody />
        </Screen>
      </motion.div>
    </PullToRefresh>
  );
}

function PresentOrPastBody() {
  return (
    <>
      <div id="anchor-morning" style={{ scrollMarginTop: "5rem" }}>
        <MorningRoutine />
      </div>
      <div id="anchor-goals" style={{ scrollMarginTop: "5rem" }}>
        <Goals />
      </div>
      <TodayRoutineCard />
      <div id="anchor-evening" style={{ scrollMarginTop: "5rem" }}>
        <EveningRoutine />
      </div>
      <ReflectionCard />
    </>
  );
}

