"use client";

import * as React from "react";
import { Screen } from "@/components/screen";
import { Segmented } from "@/components/ui/segmented";
import { Heatmap } from "@/components/stats/heatmap";
import {
  MoodEnergyChart,
  SleepChart,
  WeightChart,
  WorkoutsDonut,
  HabitRatesBars,
} from "@/components/stats/charts";
import { StreakLeaderboard } from "@/components/stats/streak-leaderboard";

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
      <Heatmap days={Math.min(days, 90)} />
      <MoodEnergyChart days={days} />
      <SleepChart days={days} />
      <WeightChart days={days} />
      <WorkoutsDonut days={days} />
      <HabitRatesBars days={days} />
      <StreakLeaderboard />
    </Screen>
  );
}
