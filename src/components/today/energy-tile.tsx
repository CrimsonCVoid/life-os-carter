"use client";

import * as React from "react";
import { Zap } from "lucide-react";
import { useStore } from "@/store";
import { useSelectedDate } from "./day-context";
import {
  averageOfPeriodValues,
  currentPeriod,
} from "@/store/selectors";
import {
  ENERGY_PERIODS,
  ENERGY_PERIOD_LABELS,
  EnergyPeriod,
} from "@/lib/types";
import { cn, round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

function dotColor(value: number | undefined): {
  bg: string;
  border: string;
  text: string;
} {
  if (value == null) {
    return {
      bg: "transparent",
      border: "var(--color-stroke-strong)",
      text: "var(--color-fg-3)",
    };
  }
  if (value <= 3) {
    return {
      bg: "color-mix(in srgb, var(--color-accent) 40%, transparent)",
      border: "color-mix(in srgb, var(--color-accent) 40%, transparent)",
      text: "var(--color-fg-2)",
    };
  }
  if (value <= 6) {
    return {
      bg: "color-mix(in srgb, var(--color-accent) 70%, transparent)",
      border: "color-mix(in srgb, var(--color-accent) 70%, transparent)",
      text: "var(--color-fg)",
    };
  }
  return {
    bg: "var(--color-accent)",
    border: "var(--color-accent)",
    text: "var(--color-fg)",
  };
}

export function EnergyTile({
  onTap,
}: {
  onTap: () => void;
}) {
  const date = useSelectedDate();
  const energyMap = useStore((s) => s.energy);
  const log = energyMap[date];
  const period = React.useMemo(() => currentPeriod(), []);
  const avg = averageOfPeriodValues(log?.values ?? {});
  const loggedCount = log
    ? Object.keys(log.values).filter((k) => log.values[k as EnergyPeriod] != null)
        .length
    : 0;

  return (
    <button
      type="button"
      onClick={() => {
        haptic("tap");
        onTap();
      }}
      className={cn(
        "snap-start shrink-0 w-[148px] card-hover card p-3 text-left",
        loggedCount > 0
          ? "border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
          : ""
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "h-7 w-7 grid place-items-center rounded-lg",
            loggedCount > 0
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "bg-[var(--color-elevated)] text-[var(--color-fg-3)]"
          )}
        >
          <Zap size={15} />
        </div>
        <span className="text-[10px] text-[var(--color-fg-3)] tnum">
          {loggedCount}/4
        </span>
      </div>
      <div className="mt-2 label text-[10px]">Energy</div>

      {/* 4-dot connected line */}
      <div className="relative mt-2 h-4">
        <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-[1.5px] bg-[var(--color-stroke)]" />
        <div className="absolute inset-0 flex items-center justify-between px-0.5">
          {ENERGY_PERIODS.map((p) => {
            const v = log?.values[p];
            const c = dotColor(v);
            const isCurrent = p === period;
            return (
              <span
                key={p}
                aria-label={`${ENERGY_PERIOD_LABELS[p]} ${v ?? "not logged"}`}
                className={cn(
                  "h-3 w-3 rounded-full border transition",
                  isCurrent
                    ? "ring-2 ring-offset-1 ring-offset-[var(--color-card)] ring-[var(--color-fg-3)]"
                    : ""
                )}
                style={{ background: c.bg, borderColor: c.border }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[10px] text-[var(--color-fg-3)]">AVG</span>
        <span className="text-[18px] font-semibold tnum leading-none">
          {avg != null ? round1(avg) : "—"}
        </span>
      </div>
    </button>
  );
}
