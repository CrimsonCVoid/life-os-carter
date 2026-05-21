"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Activity, Flame, HeartPulse } from "lucide-react";
import type { WorkoutHRSeries, ZoneMinutes } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { series: WorkoutHRSeries };

export function HROverlayChart({ series }: Props) {
  const start = new Date(series.startedAt).getTime();
  const data = React.useMemo(
    () =>
      series.samples.map((s) => ({
        t: (new Date(s.at).getTime() - start) / 60000,
        bpm: s.bpm,
      })),
    [series, start]
  );

  if (series.samples.length < 3) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-stroke-strong)] p-4 text-center text-[12px] text-[var(--color-fg-3)]">
        Not enough heart-rate data for this workout.
      </div>
    );
  }

  const duration =
    (new Date(series.endedAt).getTime() - start) / 60000;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[11px] tnum text-[var(--color-fg-2)]">
        <span className="inline-flex items-center gap-1">
          <HeartPulse size={11} className="text-[#FB7185]" />
          Peak {series.peakBpm ?? "—"}
        </span>
        <span>Avg {series.avgBpm ?? "—"}</span>
        <span>Duration {fmtMin(duration)}</span>
        {series.caloriesBurned != null && (
          <span className="inline-flex items-center gap-1">
            <Flame size={11} className="text-[#FBBF24]" />
            {Math.round(series.caloriesBurned)} kcal
          </span>
        )}
      </div>

      <div className="h-36 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke="var(--color-stroke)"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, "dataMax"]}
              tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${Math.round(v as number)}m`}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-stroke-strong)",
                fontSize: 11,
                borderRadius: 8,
              }}
              labelFormatter={(l) => `${Math.round(l as number)} min in`}
              formatter={(v) => [`${v} bpm`, "Heart rate"]}
            />
            <Line
              type="monotone"
              dataKey="bpm"
              stroke="#FB7185"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {series.zoneMinutes && (
        <ZoneBar zones={series.zoneMinutes} />
      )}
    </div>
  );
}

const ZONE_COLORS = [
  "color-mix(in srgb, var(--pillar-strain) 30%, var(--color-elevated))",
  "var(--pillar-strain)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
];

const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"];

function ZoneBar({ zones }: { zones: ZoneMinutes }) {
  const values = [
    zones.zone1 ?? 0,
    zones.zone2 ?? 0,
    zones.zone3 ?? 0,
    zones.zone4 ?? 0,
    zones.zone5 ?? 0,
  ];
  const total = values.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)] p-2">
      <div className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-wider text-[var(--color-fg-3)]">
        <Activity size={10} />
        Time in zones
      </div>
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-[var(--color-elevated)]">
        {values.map((v, i) => {
          const pct = (v / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={i}
              style={{
                width: `${pct}%`,
                background: ZONE_COLORS[i],
              }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-5 gap-1 mt-1.5 text-[10px] text-center tnum">
        {values.map((v, i) => (
          <div key={i}>
            <div className="text-[var(--color-fg-3)]">{ZONE_LABELS[i]}</div>
            <div className={cn("font-semibold", v === 0 && "opacity-40")}>
              {Math.round(v)}m
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  if (m < 1) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
