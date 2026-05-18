"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr, lastNDates } from "@/lib/date";
import { metricColors } from "@/lib/metric-colors";
import { haptic } from "@/lib/haptics";
import { VitalsTileShell } from "./vitals-tile-shell";
import { MiniTrend } from "./mini-trend";
import { useCountUp } from "./use-count-up";

type Props = {
  onActivate?: () => void;
};

export function HrvTile({ onActivate }: Props) {
  const today = todayStr();
  const connected = useStore((s) => s.googleHealth.connected);
  const health = useStore((s) => s.health);
  const provenance = useStore(
    (s) => s.googleHealth.sourceByDate[today]?.heartRateVariability
  );

  const todayLog = health[today];
  const hrv = todayLog?.heartRateVariability ?? null;
  const synced = !!provenance?.syncedAt &&
    (!provenance.manualOverrideAt || provenance.manualOverrideAt < provenance.syncedAt);

  // 14-day series for the mini-trend, oldest → newest.
  const series = React.useMemo(() => {
    return lastNDates(14).map((d) => health[d]?.heartRateVariability ?? null);
  }, [health]);

  // 7-day average (excluding today) for the delta line.
  const avg7 = React.useMemo(() => {
    const past7 = series.slice(-8, -1).filter((v): v is number => v != null);
    if (!past7.length) return null;
    return past7.reduce((a, b) => a + b, 0) / past7.length;
  }, [series]);

  const c = metricColors("hrv");
  const empty = hrv == null;
  const animated = useCountUp(hrv, `hrv:${today}`);

  const delta = hrv != null && avg7 != null ? Math.round(hrv - avg7) : null;

  return (
    <VitalsTileShell
      label="HRV"
      accent={c.base}
      synced={synced}
      empty={empty && !connected}
      onActivate={onActivate ? () => { haptic("tap"); onActivate(); } : undefined}
      ariaLabel="HRV detail"
      secondary={
        delta != null ? (
          <DeltaMs delta={delta} />
        ) : empty && connected ? (
          <span className="text-[var(--color-fg-3)]">No reading yet</span>
        ) : null
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-bold tnum leading-none text-[48px] sm:text-[60px]"
          style={{ color: empty ? "var(--color-fg-3)" : c.base }}
        >
          {empty ? "—" : Math.round(animated)}
        </span>
        <span className="text-[14px] uppercase tracking-[0.14em] text-[var(--color-fg-3)]">
          ms
        </span>
      </div>
      <div className="mt-3 -mx-1 self-stretch">
        <MiniTrend
          values={series}
          width={240}
          height={32}
          color={c.base}
          ariaLabel="14-day HRV trend"
        />
      </div>
    </VitalsTileShell>
  );
}

function DeltaMs({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-[var(--color-fg-3)]">— vs 7-day avg</span>;
  }
  const positive = delta > 0;
  const color = positive ? "var(--color-success)" : "var(--color-danger)";
  const sign = positive ? "+" : "−";
  return (
    <span style={{ color }}>
      {sign}
      {Math.abs(delta)}ms vs avg
    </span>
  );
}
