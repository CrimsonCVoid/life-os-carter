"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr, shiftDate } from "@/lib/date";
import { metricColors } from "@/lib/metric-colors";
import { haptic } from "@/lib/haptics";
import { round1 } from "@/lib/utils";
import { VitalsTileShell } from "./vitals-tile-shell";
import { ProgressRing } from "./progress-ring";
import { useCountUp } from "./use-count-up";
import { computeSleepScore } from "./sleep-score";

type Props = {
  onActivate?: () => void;
};

export function SleepScoreTile({ onActivate }: Props) {
  const today = todayStr();
  const yesterday = React.useMemo(() => shiftDate(today, -1), [today]);
  const todayLog = useStore((s) => s.health[today]);
  const yesterdayLog = useStore((s) => s.health[yesterday]);
  const connected = useStore((s) => s.googleHealth.connected);
  const provenance = useStore((s) => s.googleHealth.sourceByDate[today]?.sleep);

  const breakdown = React.useMemo(() => {
    if (!todayLog?.sleepHours) return null;
    return computeSleepScore({
      sleepHours: todayLog.sleepHours,
      sleepStages: todayLog.sleepStages,
    });
  }, [todayLog?.sleepHours, todayLog?.sleepStages]);

  const prevBreakdown = React.useMemo(() => {
    if (!yesterdayLog?.sleepHours) return null;
    return computeSleepScore({
      sleepHours: yesterdayLog.sleepHours,
      sleepStages: yesterdayLog.sleepStages,
    });
  }, [yesterdayLog?.sleepHours, yesterdayLog?.sleepStages]);

  const score = breakdown?.score ?? null;
  const synced = !!provenance?.syncedAt &&
    (!provenance.manualOverrideAt || provenance.manualOverrideAt < provenance.syncedAt);
  const empty = score == null;

  const c = metricColors("sleep");
  const animated = useCountUp(score, `sleep:${today}`);

  const hours = todayLog?.sleepHours ?? null;
  const delta = score != null && prevBreakdown != null ? score - prevBreakdown.score : null;

  return (
    <VitalsTileShell
      label="Sleep Score"
      accent={c.base}
      synced={synced}
      empty={empty && !connected}
      onActivate={onActivate ? () => { haptic("tap"); onActivate(); } : undefined}
      ariaLabel="Sleep score detail"
      secondary={
        hours != null ? (
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums">{round1(hours)}h</span>
            {delta != null && <DeltaScore delta={delta} />}
          </span>
        ) : empty && connected ? (
          <span className="text-[var(--color-fg-3)]">No sleep logged</span>
        ) : null
      }
    >
      <ProgressRing
        progress={(score ?? 0) / 100}
        size={88}
        color={c.base}
        ariaLabel="Sleep score, out of 100"
      >
        <div className="flex items-baseline gap-1">
          <span
            className="font-bold tnum leading-none text-[40px]"
            style={{ color: empty ? "var(--color-fg-3)" : c.base }}
          >
            {empty ? "—" : Math.round(animated)}
          </span>
          {!empty && (
            <span className="text-[11px] text-[var(--color-fg-3)]">/100</span>
          )}
        </div>
      </ProgressRing>
    </VitalsTileShell>
  );
}

function DeltaScore({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-[var(--color-fg-3)]">— vs yesterday</span>;
  }
  const positive = delta > 0;
  const color = positive ? "var(--color-success)" : "var(--color-danger)";
  const sign = positive ? "+" : "−";
  return (
    <span style={{ color }}>
      {sign}
      {Math.abs(delta)} vs yesterday
    </span>
  );
}
