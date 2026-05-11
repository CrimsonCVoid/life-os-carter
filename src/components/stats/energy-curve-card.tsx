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
  ReferenceArea,
} from "recharts";
import { Sun } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnergyRaw } from "@/store/selectors";
import {
  ENERGY_PERIODS,
  ENERGY_PERIOD_LABELS,
  EnergyPeriod,
} from "@/lib/types";
import { lastNDates } from "@/lib/date";
import { round1 } from "@/lib/utils";

const tickStyle = { fill: "var(--color-fg-3)", fontSize: 10 };
const gridStroke = "var(--color-stroke)";

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-[var(--color-stroke-strong)] bg-[var(--color-card)] px-2.5 py-1.5 shadow-[var(--shadow-card)] text-xs">
      <div className="text-[10px] text-[var(--color-fg-3)]">{label}</div>
      <div className="text-[var(--color-accent)] tnum">
        avg {p.payload.avg}{" "}
        <span className="text-[var(--color-fg-3)]">± {p.payload.std}</span>
      </div>
      <div className="text-[10px] text-[var(--color-fg-3)] mt-0.5">
        {p.payload.n} logs
      </div>
    </div>
  );
}

export function EnergyCurveCard({ days }: { days: number }) {
  const energyMap = useEnergyRaw();

  const data = React.useMemo(() => {
    const dates = lastNDates(days);
    const buckets: Record<EnergyPeriod, number[]> = {
      morning: [],
      midday: [],
      afternoon: [],
      evening: [],
    };
    for (const d of dates) {
      const log = energyMap[d];
      if (!log) continue;
      for (const p of ENERGY_PERIODS) {
        const v = log.values[p];
        if (typeof v === "number") buckets[p].push(v);
      }
    }
    return ENERGY_PERIODS.map((p) => {
      const xs = buckets[p];
      if (xs.length === 0) {
        return {
          period: ENERGY_PERIOD_LABELS[p],
          avg: null as number | null,
          std: 0,
          n: 0,
        };
      }
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance =
        xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
      return {
        period: ENERGY_PERIOD_LABELS[p],
        avg: round1(mean),
        std: round1(Math.sqrt(variance)),
        n: xs.length,
      };
    });
  }, [energyMap, days]);

  const validPoints = data.filter((d) => d.avg != null) as Array<{
    period: string;
    avg: number;
    std: number;
    n: number;
  }>;
  const sharpest = validPoints.length
    ? validPoints.reduce((a, b) => (b.avg > a.avg ? b : a))
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily energy curve · {days}d</CardTitle>
      </CardHeader>
      {validPoints.length === 0 ? (
        <div className="text-xs text-[var(--color-fg-3)] text-center py-6">
          Log a few energy periods to see your curve.
        </div>
      ) : (
        <>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
                <XAxis dataKey="period" tick={tickStyle} stroke={gridStroke} />
                <YAxis
                  domain={[0, 10]}
                  tick={tickStyle}
                  stroke={gridStroke}
                  width={20}
                />
                <Tooltip content={<TooltipBox />} />
                {validPoints.map((p, i) => {
                  const next = validPoints[i + 1];
                  if (!next) return null;
                  return (
                    <ReferenceArea
                      key={p.period}
                      x1={p.period}
                      x2={next.period}
                      y1={Math.min(p.avg, next.avg) - (p.std + next.std) / 2}
                      y2={Math.max(p.avg, next.avg) + (p.std + next.std) / 2}
                      stroke="none"
                      fill="var(--color-accent)"
                      fillOpacity={0.08}
                    />
                  );
                })}
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--color-accent)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "var(--color-accent)" }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {sharpest && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-fg-2)]">
              <Sun size={13} className="text-[var(--color-accent)]" />
              You&apos;re sharpest in the{" "}
              <span className="text-[var(--color-fg)] font-medium">
                {sharpest.period.toLowerCase()}
              </span>
              .
            </div>
          )}
        </>
      )}
    </Card>
  );
}
