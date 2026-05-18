"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr, shiftDate } from "@/lib/date";
import { metricColors } from "@/lib/metric-colors";
import { haptic } from "@/lib/haptics";
import { VitalsTileShell } from "./vitals-tile-shell";
import { ProgressRing } from "./progress-ring";
import { useCountUp } from "./use-count-up";

const DEFAULT_STEPS_GOAL = 10000;

type Props = {
  onActivate?: () => void;
};

export function StepsTile({ onActivate }: Props) {
  const today = todayStr();
  const yesterday = React.useMemo(() => shiftDate(today, -1), [today]);
  const todayLog = useStore((s) => s.health[today]);
  const yesterdayLog = useStore((s) => s.health[yesterday]);
  const connected = useStore((s) => s.googleHealth.connected);
  const provenance = useStore(
    (s) => s.googleHealth.sourceByDate[today]?.steps
  );

  const steps = todayLog?.steps ?? null;
  const synced = !!provenance?.syncedAt &&
    (!provenance.manualOverrideAt || provenance.manualOverrideAt < provenance.syncedAt);

  const goal = DEFAULT_STEPS_GOAL;
  const c = metricColors("steps");
  const empty = steps == null;

  const animated = useCountUp(steps, `steps:${today}`);
  const progress = (steps ?? 0) / goal;

  const delta = steps != null && yesterdayLog?.steps != null
    ? steps - yesterdayLog.steps
    : null;

  return (
    <VitalsTileShell
      label="Steps"
      accent={c.base}
      synced={synced}
      empty={empty && !connected}
      onActivate={onActivate ? () => { haptic("tap"); onActivate(); } : undefined}
      ariaLabel="Steps detail"
      secondary={
        delta != null ? (
          <DeltaText delta={delta} suffix="vs yesterday" />
        ) : empty && connected ? (
          <span className="text-[var(--color-fg-3)]">No data yet today</span>
        ) : null
      }
    >
      <ProgressRing
        progress={progress}
        size={88}
        color={c.base}
        ariaLabel="Steps progress toward daily goal"
      >
        <div className="flex flex-col items-center">
          <div
            className="font-bold tnum leading-none text-[40px] sm:text-[44px]"
            style={{ color: empty ? "var(--color-fg-3)" : c.base }}
          >
            {empty ? "—" : compactNumber(Math.round(animated))}
          </div>
        </div>
      </ProgressRing>
      <div className="mt-2 text-[11px] text-[var(--color-fg-3)] tabular-nums">
        {empty ? "of " + goal.toLocaleString() : `of ${goal.toLocaleString()}`}
      </div>
    </VitalsTileShell>
  );
}

function compactNumber(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString();
}

function DeltaText({ delta, suffix }: { delta: number; suffix: string }) {
  if (delta === 0) {
    return <span className="text-[var(--color-fg-3)]">— {suffix}</span>;
  }
  const positive = delta > 0;
  const color = positive ? "var(--color-success)" : "var(--color-danger)";
  const sign = positive ? "+" : "−";
  return (
    <span style={{ color }}>
      {sign}
      {Math.abs(delta).toLocaleString()} {suffix}
    </span>
  );
}
