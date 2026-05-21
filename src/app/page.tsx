"use client";

import * as React from "react";
import { motion, PanInfo } from "motion/react";
import { Screen } from "@/components/screen";
import { TodayHeader } from "@/components/today/header";
// SleepCard removed — Fitbit / Google Health sync owns sleep tracking; manual
// entry only appears as a fallback in the ActivityRings (read-only display).
import { MorningBriefing } from "@/components/today/morning-briefing";
import { DailyBriefingCard } from "@/components/today/daily-briefing-card";
import { QuickLogTiles } from "@/components/today/quick-log-tiles";
import { ActivityRings } from "@/components/today/activity-rings";
import { ReadinessHero } from "@/components/today/readiness-hero";
import { PillarTiles } from "@/components/today/pillar-tiles";
import { MorningRoutine } from "@/components/today/morning-routine";
import { EveningRoutine } from "@/components/today/evening-routine";
import { Goals } from "@/components/today/goals";
import { ReflectionCard } from "@/components/today/reflection";
import { WeeklyReviewCard } from "@/components/today/weekly-review-card";
import { PatternCard } from "@/components/today/pattern-card";
import { DayProvider, useDay } from "@/components/today/day-context";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { maybeAutoSync } from "@/lib/integrations/google-health/sync-client";
import { VitalsTier } from "@/components/today/vitals";

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
  const { isFuture, step, canGoBack, canGoForward } = useDay();
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

  return (
    <motion.div
      onPanEnd={swipeEnabled ? onPanEnd : undefined}
      // Allow vertical scroll; only intercept horizontal pans
      style={{ touchAction: "pan-y" }}
    >
      <Screen>
        {!isFuture && <ReadinessHero />}
        {!isFuture && <PillarTiles />}
        {!isFuture && <DailyBriefingCard />}
        {!isFuture && <ActivityRings />}
        {!isFuture && <VitalsTier />}
        {!isFuture && <QuickLogTiles />}
        <MorningBriefing />
        <TodayHeader />
        <WeeklyReviewCard />
        <PatternCard />
        {isFuture ? <FutureBody /> : <PresentOrPastBody />}
      </Screen>
    </motion.div>
  );
}

function PresentOrPastBody() {
  return (
    <>
      <MorningRoutine />
      <Goals />
      <EveningRoutine />
      <ReflectionCard />
    </>
  );
}

/**
 * Future days only show planning surfaces. Recurring goals that *will*
 * generate on this date are surfaced in the Goals card itself.
 */
function FutureBody() {
  return (
    <>
      <Goals />
    </>
  );
}
