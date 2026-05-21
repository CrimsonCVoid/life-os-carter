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
import { useStore } from "@/store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { todayStr } from "@/lib/date";

type Range = "30" | "90" | "365";

export function HrvTrendCard() {
  const health = useStore((s) => s.health);
  const [range, setRange] = React.useState<Range>("30");

  const today = todayStr();
  const days = parseInt(range, 10);

  const data = React.useMemo(() => {
    const out: { date: string; hrv: number | null; rhr: number | null }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = shiftDate(today, -i);
      const log = health[d];
      out.push({
        date: shortLabel(d),
        hrv:
          typeof log?.heartRateVariability === "number"
            ? log.heartRateVariability
            : null,
        rhr:
          typeof log?.restingHeartRate === "number"
            ? log.restingHeartRate
            : null,
      });
    }
    return out;
  }, [health, today, days]);

  const hasData = data.some((d) => d.hrv != null || d.rhr != null);

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
          <div className="text-[10px] text-[var(--color-fg-3)]">
            HRV (ms) — pillar-recovery · RHR — pillar-strain
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
                />
                <Line
                  yAxisId="hrv"
                  type="monotone"
                  dataKey="hrv"
                  stroke="#16C47F"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="rhr"
                  type="monotone"
                  dataKey="rhr"
                  stroke="#38BDF8"
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

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortLabel(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
