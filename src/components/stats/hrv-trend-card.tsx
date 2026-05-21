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
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { useHrvRange, useRhrRange, type RhrRangeRow } from "@/lib/hooks/use-metrics";
import { format, fromDateStr, shiftDate, todayStr } from "@/lib/date";
import { metricHex } from "@/lib/metric-colors";

type Range = "30" | "90" | "365";

type HrvRow = { date: string; ms: number };

export function HrvTrendCard() {
  const [range, setRange] = React.useState<Range>("30");
  const days = parseInt(range, 10);

  const end = todayStr();
  const start = shiftDate(end, -(days - 1));

  const { data: hrvRows } = useHrvRange(start, end);
  const { data: rhrRows } = useRhrRange(start, end);

  const data = React.useMemo(() => {
    const hrvMap = new Map<string, number>();
    for (const r of (hrvRows as HrvRow[] | undefined) ?? []) {
      if (typeof r?.ms === "number") hrvMap.set(r.date, r.ms);
    }
    const rhrMap = new Map<string, number>();
    for (const r of (rhrRows as RhrRangeRow[] | undefined) ?? []) {
      if (typeof r?.bpm === "number") rhrMap.set(r.date, r.bpm);
    }

    const out: { date: string; hrv: number | null; rhr: number | null }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = shiftDate(end, -i);
      out.push({
        date: format(fromDateStr(d), "M/d"),
        hrv: hrvMap.get(d) ?? null,
        rhr: rhrMap.get(d) ?? null,
      });
    }
    return out;
  }, [hrvRows, rhrRows, end, days]);

  const hasData = data.some((d) => d.hrv != null || d.rhr != null);

  const hrvColor = metricHex("hrv");
  const rhrColor = metricHex("rhr");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery trend</CardTitle>
        <Segmented<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
            { value: "365", label: "1y" },
          ]}
          size="sm"
        />
      </CardHeader>

      {!hasData ? (
        <div className="py-8 text-center text-[12px] text-[var(--color-fg-3)]">
          Connect Google Health to see HRV + RHR trends.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-fg-3)]">
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-3 rounded-full"
                style={{ background: hrvColor }}
              />
              HRV (ms)
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-3 rounded-full"
                style={{ background: rhrColor }}
              />
              RHR (bpm)
            </span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--color-stroke)"
                  strokeDasharray="2 4"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="hrv"
                  orientation="left"
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <YAxis
                  yAxisId="rhr"
                  orientation="right"
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
                  itemStyle={{ fontVariantNumeric: "tabular-nums" }}
                  labelStyle={{ color: "var(--color-fg-3)" }}
                />
                <Line
                  yAxisId="hrv"
                  type="monotone"
                  dataKey="hrv"
                  name="HRV"
                  stroke={hrvColor}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="rhr"
                  type="monotone"
                  dataKey="rhr"
                  name="RHR"
                  stroke={rhrColor}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}
