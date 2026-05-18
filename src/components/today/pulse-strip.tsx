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
import { averageOfPeriodValues } from "@/store/selectors";
import type { GoogleHealthDaySource } from "@/lib/types";
import { MoodLogModal } from "./log-modals/mood-modal";
import { WaterLogModal } from "./log-modals/water-modal";
import { WeightLogModal } from "./log-modals/weight-modal";
import { EnergyLogModal } from "./log-modals/energy-modal";

type Metric = "mood" | "energy" | "water" | "weight";

export function PulseStrip() {
  const today = todayStr();
  const dates = React.useMemo(() => lastNDates(7), []);
  const health = useStore((s) => s.health);
  const energy = useStore((s) => s.energy);
  const todayHealth = health[today];
  const waterTarget = useStore((s) => s.settings.waterTargetOz);
  const liquidUnit = useStore((s) => s.settings.units.liquid);
  const weightUnit = useStore((s) => s.settings.units.weight);

  const [open, setOpen] = React.useState<Metric | null>(null);

  const get = (m: Metric, date: string): number | null => {
    const h = health[date];
    if (m === "energy") {
      const e = energy[date];
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

  const waterPct = Math.min(
    1,
    (todayHealth?.waterOz ?? 0) / Math.max(1, waterTarget)
  );

  const todayEnergyAvg = get("energy", today);

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
          todayHealth?.mood != null ? `${todayHealth.mood}/10` : "—"
        )}
        {tile(
          "energy",
          "Energy",
          Zap,
          todayEnergyAvg != null ? `${round1(todayEnergyAvg)}/10` : "—"
        )}
        {tile(
          "water",
          "Water",
          Droplet,
          todayHealth?.waterOz != null
            ? liquidUnit === "ml"
              ? `${Math.round(todayHealth.waterOz * 29.5735)}ml`
              : `${todayHealth.waterOz}oz`
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
          todayHealth?.weight != null
            ? weightUnit === "kg"
              ? `${round1(todayHealth.weight * 0.453592)}kg`
              : `${round1(todayHealth.weight)}lb`
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
