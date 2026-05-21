"use client";

import * as React from "react";
import { Screen } from "@/components/screen";
import { Segmented } from "@/components/ui/segmented";
import { Heatmap } from "@/components/stats/heatmap";
import { WeekViewCard } from "@/components/stats/week-view-card";
import {
  MoodEnergyChart,
  SleepChart,
  WeightChart,
  WorkoutsDonut,
  HabitRatesBars,
} from "@/components/stats/charts";
import { StreakLeaderboard } from "@/components/stats/streak-leaderboard";
import { MorningRoutineStatsCard } from "@/components/stats/morning-routine-card";
import { EveningRoutineStatsCard } from "@/components/stats/evening-routine-card";
import { TimeSpentCard } from "@/components/stats/time-spent-card";
import { EnergyCurveCard } from "@/components/stats/energy-curve-card";
import { NutritionStatsCard } from "@/components/stats/nutrition-card";
import { RecurringGoalsCard } from "@/components/stats/recurring-goals-card";
import { HrvTrendCard } from "@/components/stats/hrv-trend-card";
import { MuscleFrequencyCard } from "@/components/stats/muscle-frequency-card";

type Range = "7" | "30" | "90" | "365";

const OPTIONS: Array<{ value: Range; label: string }> = [
  { value: "7", label: "Week" },
  { value: "30", label: "Month" },
  { value: "90", label: "90d" },
  { value: "365", label: "Year" },
];

export default function StatsPage() {
  const [range, setRange] = React.useState<Range>("30");
  const days = parseInt(range, 10);

  return (
    <Screen title="Stats" subtitle="Patterns over time">
      <div className="flex justify-center">
        <Segmented<Range>
          value={range}
          options={OPTIONS}
          onChange={setRange}
          size="sm"
        />
      </div>
      <WeekViewCard />
      <HrvTrendCard />
      <MuscleFrequencyCard />
      <Heatmap days={Math.min(days, 90)} />
      <TimeSpentCard days={days} />
      <RecurringGoalsCard days={days} />
      <MorningRoutineStatsCard days={days} />
      <EveningRoutineStatsCard days={days} />
      <EnergyCurveCard days={days} />
      <MoodEnergyChart days={days} />
      <SleepChart days={days} />
      <NutritionStatsCard days={days} />
      <WeightChart days={days} />
      <WorkoutsDonut days={days} />
      <HabitRatesBars days={days} />
      <StreakLeaderboard />
    </Screen>
  );
}
