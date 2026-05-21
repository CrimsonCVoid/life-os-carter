"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Heart, ChevronRight, Moon } from "lucide-react";
import useSWR from "swr";
import { useDay } from "@/components/today/day-context";
import { useStore } from "@/store";
import { useRhr } from "@/lib/hooks/use-metrics";
import { useBehaviors, setBehavior } from "@/lib/hooks/use-behaviors";
import { metricHex } from "@/lib/metric-colors";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { BehaviorLog } from "@/lib/types";
import { shiftDate } from "@/lib/date";

/**
 * Recovery lane — sleep, HRV, RHR, and the behavioral inputs that drive
 * tomorrow's recovery (caffeine cutoff, late meal, screen time before
 * bed). Combines what was previously SleepNeedCard + the HRV+RHR card +
 * BehaviorsCard into a single tap-target.
 */
export function RecoveryLane() {
  const { date } = useDay();
  const health = useStore((s) => s.health);
  const { rhr } = useRhr(date);
  const { behaviors } = useBehaviors();

  const todayBehavior = React.useMemo<BehaviorLog | undefined>(
    () => behaviors.find((b) => b.date === date),
    [behaviors, date]
  );

  // Sleep + HRV come from the legacy `health` blob (which Whoop-style
  // sync still updates). Bail to a placeholder if neither is set.
  const sleepHours = health[date]?.sleepHours ?? health[shiftDate(date, -1)]?.sleepHours ?? null;
  const hrvMs = health[date]?.heartRateVariability ?? null;
  const rhrBpm = rhr?.bpm ?? null;

  const accent = "var(--pillar-recovery)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative w-full rounded-2xl border overflow-hidden")}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, var(--color-card)) 0%, var(--color-card) 70%)`,
        borderColor: `color-mix(in srgb, ${accent} 28%, var(--color-stroke))`,
      }}
    >
      <Link href="/stats" className="block p-4" aria-label="Recovery details">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Heart size={13} style={{ color: accent }} strokeWidth={2.5} />
            <span
              className="text-[10px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: accent }}
            >
              Recovery
            </span>
          </div>
          <ChevronRight size={14} className="text-[var(--color-fg-3)]" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatBlock
            label="Sleep"
            value={sleepHours != null ? sleepHours.toFixed(1) : "—"}
            unit={sleepHours != null ? "h" : ""}
            color={metricHex("sleep")}
            icon={<Moon size={11} />}
          />
          <StatBlock
            label="HRV"
            value={hrvMs != null ? `${Math.round(hrvMs)}` : "—"}
            unit={hrvMs != null ? "ms" : ""}
            color={metricHex("hrv")}
          />
          <StatBlock
            label="RHR"
            value={rhrBpm != null ? `${Math.round(rhrBpm)}` : "—"}
            unit={rhrBpm != null ? "bpm" : ""}
            color={metricHex("rhr")}
          />
        </div>
      </Link>

      <div className="border-t" style={{ borderColor: `color-mix(in srgb, ${accent} 18%, var(--color-stroke))` }}>
        <BehaviorToggleRow date={date} behavior={todayBehavior} />
      </div>
    </motion.div>
  );
}

function StatBlock({
  label,
  value,
  unit,
  color,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[color:color-mix(in_srgb,var(--color-elevated)_50%,transparent)] p-2.5">
      <div
        className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold mb-1"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[18px] font-bold tnum leading-none text-[var(--color-fg)]">
          {value}
        </span>
        {unit && <span className="text-[10px] text-[var(--color-fg-3)]">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * Inline two-toggle row for the two behavioral inputs that affect tonight's
 * recovery the most: late caffeine, late meal. (Screen time + meditation
 * etc live on the full behaviors detail screen.)
 */
function BehaviorToggleRow({
  date,
  behavior,
}: {
  date: string;
  behavior: BehaviorLog | undefined;
}) {
  const caffeineLate = (behavior?.caffeineMg ?? 0) > 0;
  const lateMeal = behavior?.lateMeal === true;

  const toggleCaffeine = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    haptic("tap");
    void setBehavior(date, {
      caffeineMg: caffeineLate ? 0 : 100,
    });
  };

  const toggleLateMeal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    haptic("tap");
    void setBehavior(date, { lateMeal: !lateMeal });
  };

  return (
    <div className="grid grid-cols-2 divide-x divide-[var(--color-stroke)]">
      <BehaviorChip
        label="Late caffeine"
        active={caffeineLate}
        onClick={toggleCaffeine}
      />
      <BehaviorChip
        label="Late meal"
        active={lateMeal}
        onClick={toggleLateMeal}
      />
    </div>
  );
}

function BehaviorChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 px-3 flex items-center justify-center gap-2",
        "text-[12px] font-medium",
        "active:scale-[0.98] transition-transform duration-[60ms]",
        active
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)]"
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: active
            ? "var(--color-warning)"
            : "color-mix(in srgb, var(--color-fg-3) 50%, transparent)",
        }}
      />
      {label}
    </button>
  );
}
