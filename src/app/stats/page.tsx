"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Dumbbell, Moon, Flame } from "lucide-react";
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
import { MorningRoutineStatsCard } from "@/components/stats/morning-routine-card";
import { EveningRoutineStatsCard } from "@/components/stats/evening-routine-card";
import { TimeSpentCard } from "@/components/stats/time-spent-card";
import { EnergyCurveCard } from "@/components/stats/energy-curve-card";
import { NutritionStatsCard } from "@/components/stats/nutrition-card";
import { RecurringGoalsCard } from "@/components/stats/recurring-goals-card";
import { useStore } from "@/store";
import { todayStr, shiftDate, fromDateStr, format } from "@/lib/date";
import { cn } from "@/lib/utils";

type Range = "7" | "30" | "90" | "365";

const OPTIONS: Array<{ value: Range; label: string }> = [
  { value: "7", label: "Week" },
  { value: "30", label: "Month" },
  { value: "90", label: "90d" },
  { value: "365", label: "Year" },
];

const RANGE_LABEL: Record<Range, string> = {
  "7": "last 7 days",
  "30": "last 30 days",
  "90": "last 90 days",
  "365": "last year",
};

export default function StatsPage() {
  const [range, setRange] = React.useState<Range>("30");
  const days = parseInt(range, 10);

  const startDate = shiftDate(todayStr(), -(days - 1));
  const periodLabel = `${format(fromDateStr(startDate), "MMM d")} – today`;

  return (
    <Screen title="Stats" subtitle={periodLabel}>
      <div className="flex justify-center">
        <Segmented<Range>
          value={range}
          options={OPTIONS}
          onChange={setRange}
          size="sm"
        />
      </div>

      <HeroBand days={days} rangeLabel={RANGE_LABEL[range]} />

      <Section label="Activity">
        <TimeSpentCard days={days} />
        <WorkoutsDonut days={days} />
        <HabitRatesBars days={days} />
      </Section>

      <Section label="Recovery">
        <SleepChart days={days} />
        <MoodEnergyChart days={days} />
        <WeightChart days={days} />
      </Section>

      <Section label="Nutrition">
        <NutritionStatsCard days={days} />
        <EnergyCurveCard days={days} />
      </Section>

      <Section label="Habits & routines">
        <Heatmap days={Math.min(days, 90)} />
        <RecurringGoalsCard days={days} />
        <MorningRoutineStatsCard days={days} />
        <EveningRoutineStatsCard days={days} />
        <StreakLeaderboard />
      </Section>
    </Screen>
  );
}

/* ───────────────────────── hero summary band ───────────────────────── */

/**
 * Three at-a-glance stats for the selected range: workouts logged, avg
 * sleep, current lifting streak. Derived locally from Zustand state to
 * stay snappy without an extra fetch round-trip.
 */
function HeroBand({ days, rangeLabel }: { days: number; rangeLabel: string }) {
  const liftSessions = useStore((s) => s.liftSessions);
  const health = useStore((s) => s.health);

  const startDate = shiftDate(todayStr(), -(days - 1));

  const stats = React.useMemo(() => {
    const workouts = liftSessions.filter((s) => s.date >= startDate).length;
    const sleepValues: number[] = [];
    for (let i = 0; i < days; i++) {
      const d = shiftDate(todayStr(), -i);
      const hrs = health[d]?.sleepHours;
      if (typeof hrs === "number" && hrs > 0) sleepValues.push(hrs);
    }
    const avgSleep =
      sleepValues.length > 0
        ? sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length
        : null;
    // Current lifting streak (consecutive days ending today or yesterday)
    const days_set = new Set(liftSessions.map((s) => s.date));
    let streak = 0;
    for (let i = 0; i < days; i++) {
      const d = shiftDate(todayStr(), -i);
      if (days_set.has(d)) streak += 1;
      else if (i > 0) break; // gap after day 0 → streak ends
    }
    return { workouts, avgSleep, streak };
  }, [liftSessions, health, days, startDate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-3 gap-2"
    >
      <HeroStat
        icon={<Dumbbell size={13} />}
        label="Workouts"
        value={`${stats.workouts}`}
        unit={rangeLabel}
        tone="var(--pillar-strain)"
      />
      <HeroStat
        icon={<Moon size={13} />}
        label="Avg sleep"
        value={stats.avgSleep != null ? stats.avgSleep.toFixed(1) : "—"}
        unit={stats.avgSleep != null ? "hours" : rangeLabel}
        tone="var(--pillar-sleep)"
      />
      <HeroStat
        icon={<Flame size={13} />}
        label="Lift streak"
        value={`${stats.streak}`}
        unit={stats.streak === 1 ? "day" : "days"}
        tone="var(--color-accent)"
      />
    </motion.div>
  );
}

function HeroStat({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-2xl border p-3"
      style={{
        background: `color-mix(in srgb, ${tone} 10%, var(--color-card))`,
        borderColor: `color-mix(in srgb, ${tone} 26%, var(--color-stroke))`,
      }}
    >
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: tone }}
      >
        {icon}
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[22px] font-bold tnum leading-none text-[var(--color-fg)]">
          {value}
        </span>
        <span className="text-[10px] text-[var(--color-fg-3)] truncate">
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── themed section ───────────────────────── */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 md:space-y-4">
      <div
        className={cn(
          "pt-1 text-[10px] uppercase tracking-[0.16em] font-semibold",
          "text-[var(--color-fg-3)]"
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
