"use client";

import * as React from "react";
import { Moon, Smile, Droplet, Scale, Footprints } from "lucide-react";
import { lastNDates, todayStr } from "@/lib/date";
import { Sparkline } from "@/components/sparkline";
import { useStore } from "@/store";
import { cn, round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { SleepLogModal } from "./log-modals/sleep-modal";
import { MoodLogModal } from "./log-modals/mood-modal";
import { EnergyLogModal } from "./log-modals/energy-modal";
import { WaterLogModal } from "./log-modals/water-modal";
import { WeightLogModal } from "./log-modals/weight-modal";
import { StepsLogModal } from "./log-modals/steps-modal";
import { EnergyTile } from "./energy-tile";

type Metric = "sleep" | "mood" | "energy" | "water" | "weight" | "steps";

export function PulseStrip() {
  const today = todayStr();
  const dates = React.useMemo(() => lastNDates(7), []);
  const health = useStore((s) => s.health);
  const todayHealth = health[today];
  const waterTarget = useStore((s) => s.settings.waterTargetOz);
  const liquidUnit = useStore((s) => s.settings.units.liquid);
  const weightUnit = useStore((s) => s.settings.units.weight);

  const [open, setOpen] = React.useState<Metric | null>(null);

  const get = (m: Exclude<Metric, "energy">, date: string): number | null => {
    const h = health[date];
    if (!h) return null;
    switch (m) {
      case "sleep":
        return h.sleepHours ?? null;
      case "mood":
        return h.mood ?? null;
      case "water":
        return h.waterOz ?? null;
      case "weight":
        return h.weight ?? null;
      case "steps":
        return h.steps ?? null;
    }
  };

  const sparkValues = (m: Exclude<Metric, "energy">) =>
    dates.map((d) => get(m, d));

  const tile = (
    m: Exclude<Metric, "energy">,
    label: string,
    Icon: typeof Moon,
    value: React.ReactNode,
    extra?: React.ReactNode
  ) => {
    const todayVal = get(m, today);
    const logged = todayVal != null;
    return (
      <button
        type="button"
        key={m}
        onClick={() => {
          haptic("tap");
          setOpen(m);
        }}
        className={cn(
          "snap-start shrink-0 w-[148px] card-hover card p-3 text-left",
          logged
            ? "border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
            : ""
        )}
      >
        <div className="flex items-center justify-between">
          <div
            className={cn(
              "h-7 w-7 grid place-items-center rounded-lg",
              logged
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "bg-[var(--color-elevated)] text-[var(--color-fg-3)]"
            )}
          >
            <Icon size={15} />
          </div>
          <Sparkline values={sparkValues(m)} />
        </div>
        <div className="mt-2 label text-[10px]">{label}</div>
        <div
          className={cn(
            "text-[18px] font-semibold tnum mt-0.5 leading-none",
            logged ? "text-[var(--color-fg)]" : "text-[var(--color-fg-3)]"
          )}
        >
          {value}
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

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="label">Daily Pulse</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto hide-scroll snap-x snap-mandatory -mx-4 px-4 pb-1">
        {tile(
          "sleep",
          "Sleep",
          Moon,
          todayHealth?.sleepHours != null
            ? `${round1(todayHealth.sleepHours)}h`
            : "—",
          todayHealth?.sleepQuality != null
            ? `Quality ${todayHealth.sleepQuality}/10`
            : null
        )}
        {tile(
          "mood",
          "Mood",
          Smile,
          todayHealth?.mood != null ? `${todayHealth.mood}/10` : "—"
        )}
        <EnergyTile onTap={() => setOpen("energy")} />
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
            <span className="flex-1 h-1 rounded-full bg-[var(--color-elevated)] overflow-hidden">
              <span
                className="block h-full bg-[var(--color-accent)]"
                style={{ width: `${waterPct * 100}%` }}
              />
            </span>
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
            : "—"
        )}
        {tile(
          "steps",
          "Steps",
          Footprints,
          todayHealth?.steps != null
            ? todayHealth.steps.toLocaleString()
            : "—"
        )}
      </div>

      <SleepLogModal open={open === "sleep"} onClose={() => setOpen(null)} />
      <MoodLogModal open={open === "mood"} onClose={() => setOpen(null)} />
      <EnergyLogModal open={open === "energy"} onClose={() => setOpen(null)} />
      <WaterLogModal open={open === "water"} onClose={() => setOpen(null)} />
      <WeightLogModal open={open === "weight"} onClose={() => setOpen(null)} />
      <StepsLogModal open={open === "steps"} onClose={() => setOpen(null)} />
    </section>
  );
}
