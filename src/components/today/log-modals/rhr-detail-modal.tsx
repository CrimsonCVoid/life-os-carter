"use client";

import * as React from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Modal } from "@/components/ui/modal";
import { format, fromDateStr, shiftDate, todayStr } from "@/lib/date";
import { metricHex } from "@/lib/metric-colors";
import { useRhrRange, type RhrRangeRow } from "@/lib/hooks/use-metrics";

/**
 * 30-day Resting Heart Rate drill-in. Mirrors the Vitals tier's chart
 * layout (Avg / Min / Max + line chart) but is its own component because
 * RHR is read straight from Neon via SWR, while the Vitals modal still
 * sources from Zustand-mirrored sync data. They'll converge once the
 * Vitals migration lands.
 */
export function RhrDetailModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const end = todayStr();
  const start = React.useMemo(() => shiftDate(end, -29), [end]);
  const { data } = useRhrRange(start, end);

  const series = React.useMemo(() => {
    const byDate = new Map<string, number>();
    for (const r of (data ?? []) as RhrRangeRow[]) {
      byDate.set(r.date, r.bpm);
    }
    const out: Array<{ date: string; value: number | null }> = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = shiftDate(end, -i);
      out.push({ date: d, value: byDate.get(d) ?? null });
    }
    return out;
  }, [data, end]);

  const stats = React.useMemo(() => {
    const vals = series.map((s) => s.value).filter((v): v is number => v != null);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { avg, min, max };
  }, [series]);

  const color = metricHex("rhr");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resting Heart Rate"
      description="Last 30 days"
      size="lg"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Avg" value={stats ? Math.round(stats.avg) : null} />
          <Stat label="Min" value={stats ? stats.min : null} />
          <Stat label="Max" value={stats ? stats.max : null} />
        </div>

        <div className="h-[220px] -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => format(fromDateStr(d), "M/d")}
                tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={["dataMin - 4", "dataMax + 4"]}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-stroke-strong)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-stroke-strong)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-fg)",
                }}
                labelFormatter={(d) =>
                  typeof d === "string"
                    ? format(fromDateStr(d), "EEE M/d")
                    : String(d)
                }
                formatter={(v) =>
                  v == null || typeof v !== "number" ? "—" : `${Math.round(v)} bpm`
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[11px] text-[var(--color-fg-3)]">
          Lower trend is generally better — sustained increases can signal
          stress, illness, or under-recovery. Synced from Google Health.
        </p>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="card p-3">
      <div className="label">{label}</div>
      <div className="mt-1 tnum text-[20px] font-semibold text-[var(--color-fg)]">
        {value != null ? value : "—"}
        {value != null && (
          <span className="text-[12px] text-[var(--color-fg-3)] ml-1">bpm</span>
        )}
      </div>
    </div>
  );
}
