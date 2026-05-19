"use client";

import * as React from "react";
import { Smile, Droplet, Scale, Zap } from "lucide-react";
import { lastNDates, todayStr } from "@/lib/date";
import { Sparkline } from "@/components/sparkline";
import { useStore } from "@/store";
import { cn, round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { metricColors, type Metric as MetricKey } from "@/lib/metric-colors";
import { MetricBar } from "@/components/ui/metric-bar";
import { SyncedBadge } from "@/components/integrations/synced-badge";
import { useMood, useWater, useWeight, useEnergy } from "@/lib/hooks/use-metrics";
import { averageOfPeriodValues } from "@/store/selectors";
import type { EnergyPeriod, GoogleHealthDaySource } from "@/lib/types";
import { MoodLogModal } from "./log-modals/mood-modal";
import { WaterLogModal } from "./log-modals/water-modal";
import { WeightLogModal } from "./log-modals/weight-modal";
import { EnergyLogModal } from "./log-modals/energy-modal";

type Metric = "mood" | "energy" | "water" | "weight";

export function PulseStrip() {
  const today = todayStr();
  const dates = React.useMemo(() => lastNDates(7), []);
  // Today's values come from Neon via SWR. 7-day sparkline still reads
  // Zustand history until the range-reader hooks are wired through the
  // pulse strip charts (follow-up commit — sparkline cosmetic only).
  const { mood: todayMood } = useMood(today);
  const { water: todayWater } = useWater(today);
  const { weight: todayWeight } = useWeight(today);
  const { energy: todayEnergyRows } = useEnergy(today);
  const health = useStore((s) => s.health);
  const energyMap = useStore((s) => s.energy);
  const waterTarget = useStore((s) => s.settings.waterTargetOz);
  const liquidUnit = useStore((s) => s.settings.units.liquid);
  const weightUnit = useStore((s) => s.settings.units.weight);

  const [open, setOpen] = React.useState<Metric | null>(null);

  const todayEnergyAvgValue = React.useMemo(() => {
    if (todayEnergyRows.length === 0) return null;
    const values: Partial<Record<EnergyPeriod, number>> = {};
    for (const row of todayEnergyRows) {
      values[row.period as EnergyPeriod] = row.value;
    }
    return averageOfPeriodValues(values);
  }, [todayEnergyRows]);

  const get = (m: Metric, date: string): number | null => {
    // Today's values come from SWR; trailing 6 days still come from
    // Zustand (sparkline rendering only — no writes).
    if (date === today) {
      switch (m) {
        case "mood":
          return todayMood?.value ?? null;
        case "water":
          return todayWater?.oz ?? null;
        case "weight":
          return todayWeight?.lb ?? null;
        case "energy":
          return todayEnergyAvgValue;
      }
    }
    const h = health[date];
    if (m === "energy") {
      const e = energyMap[date];
      return e ? averageOfPeriodValues(e.values) : null;
    }
    if (!h) return null;
    switch (m) {
      case "mood":
        return h.mood ?? null;
      case "water":
        return h.waterOz ?? null;
      case "weight":
        return h.weight ?? null;
    }
  };

  const sparkValues = (m: Metric) => dates.map((d) => get(m, d));

  const tile = (
    m: Metric,
    label: string,
    Icon: typeof Smile,
    value: React.ReactNode,
    extra?: React.ReactNode,
    syncedSource?: keyof GoogleHealthDaySource
  ) => {
    const todayVal = get(m, today);
    const logged = todayVal != null;
    const c = metricColors(m as MetricKey);
    return (
      <button
        type="button"
        key={m}
        onClick={() => {
          haptic("tap");
          setOpen(m);
        }}
        className="card-hover card p-3 text-left"
        style={
          logged
            ? {
                borderColor: `color-mix(in srgb, ${c.base} 28%, transparent)`,
              }
            : undefined
        }
      >
        <div className="flex items-center justify-between">
          <div
            className="h-7 w-7 grid place-items-center rounded-lg"
            style={
              logged
                ? { background: c.soft, color: c.base }
                : {
                    background: "var(--color-elevated)",
                    color: "var(--color-fg-3)",
                  }
            }
          >
            <Icon size={15} />
          </div>
          <Sparkline values={sparkValues(m)} color={c.base} />
        </div>
        <div className="mt-2 label text-[10px]">{label}</div>
        <div
          className={cn(
            "text-[18px] font-semibold tnum mt-0.5 leading-none inline-flex items-center gap-1.5",
            logged ? "" : "text-[var(--color-fg-3)]"
          )}
          style={logged ? { color: c.base } : undefined}
        >
          {value}
          {logged && syncedSource && (
            <SyncedBadge date={today} source={syncedSource} size={11} />
          )}
        </div>
        {extra && (
          <div className="text-[10px] text-[var(--color-fg-3)] mt-1">
            {extra}
          </div>
        )}
      </button>
    );
  };

  const waterOzToday = todayWater?.oz ?? 0;
  const waterPct = Math.min(1, waterOzToday / Math.max(1, waterTarget));
  const weightLbToday = todayWeight?.lb ?? null;
  const moodValueToday = todayMood?.value ?? null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="label">Daily Pulse</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tile(
          "mood",
          "Mood",
          Smile,
          moodValueToday != null ? `${moodValueToday}/10` : "—"
        )}
        {tile(
          "energy",
          "Energy",
          Zap,
          todayEnergyAvgValue != null ? `${round1(todayEnergyAvgValue)}/10` : "—"
        )}
        {tile(
          "water",
          "Water",
          Droplet,
          todayWater?.oz != null
            ? liquidUnit === "ml"
              ? `${Math.round(waterOzToday * 29.5735)}ml`
              : `${waterOzToday}oz`
            : "—",
          <span className="flex items-center gap-1.5">
            <MetricBar
              metric="water"
              value={waterPct}
              height={4}
              className="flex-1"
            />
            <span className="tnum">
              {liquidUnit === "ml"
                ? `${Math.round(waterTarget * 29.5735)}ml`
                : `${waterTarget}oz`}
            </span>
          </span>
        )}
        {tile(
          "weight",
          "Weight",
          Scale,
          weightLbToday != null
            ? weightUnit === "kg"
              ? `${round1(weightLbToday * 0.453592)}kg`
              : `${round1(weightLbToday)}lb`
            : "—",
          undefined,
          "weight"
        )}
      </div>

      <MoodLogModal open={open === "mood"} onClose={() => setOpen(null)} />
      <EnergyLogModal open={open === "energy"} onClose={() => setOpen(null)} />
      <WaterLogModal open={open === "water"} onClose={() => setOpen(null)} />
      <WeightLogModal open={open === "weight"} onClose={() => setOpen(null)} />
    </section>
  );
}
