"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useDay } from "@/components/today/day-context";
import {
  useStepsRange,
  useHrvRange,
  useRhrRange,
  useSleepRange,
} from "@/lib/hooks/use-metrics";
import { format, fromDateStr, lastNDates, shiftDate } from "@/lib/date";
import { metricHex } from "@/lib/metric-colors";
import { round1 } from "@/lib/utils";

/**
 * Whoop-style 14-day trend strip — three small charts stacked under the
 * dashboard hero: Steps (bar), HRV + RHR overlay (line), Sleep (area with
 * a 7.5h reference). Reads from v2's SWR range hooks so cold load paints
 * instantly from IDB cache, then revalidates from Neon.
 *
 * Hidden on future days (no data to show).
 */
export function ChartsBand() {
  const { isFuture, date } = useDay();
  const start = shiftDate(date, -13);
  const end = date;

  const steps = useStepsRange(start, end);
  const hrv = useHrvRange(start, end);
  const rhr = useRhrRange(start, end);
  const sleep = useSleepRange(start, end);

  if (isFuture) return null;

  return (
    <div className="space-y-2">
      <StepsCard data={steps.data as StepsRow[] | undefined} dateEnd={end} />
      <HrvRhrCard
        hrvData={hrv.data as HrRow[] | undefined}
        rhrData={rhr.data as HrRow[] | undefined}
        dateEnd={end}
      />
      <SleepCard data={sleep.data as SleepRow[] | undefined} dateEnd={end} />
    </div>
  );
}

type StepsRow = { date: string; count: number };
type HrRow = { date: string; ms?: number; bpm?: number };
type SleepRow = { date: string; hours: number };

function StepsCard({ data, dateEnd }: { data?: StepsRow[]; dateEnd: string }) {
  const dates = React.useMemo(() => lastNDates(14, fromDateStr(dateEnd)), [dateEnd]);
  const series = React.useMemo(
    () =>
      dates.map((d) => ({
        date: d,
        label: format(fromDateStr(d), "M/d"),
        count: data?.find((r) => r?.date === d)?.count ?? 0,
      })),
    [dates, data]
  );
  const today = series[series.length - 1]?.count ?? 0;
  const last7 = series.slice(-7);
  const avg7 = last7.length > 0 ? last7.reduce((a, r) => a + r.count, 0) / last7.length : 0;
  const delta = avg7 > 0 ? Math.round(((today - avg7) / avg7) * 100) : 0;
  const accent = metricHex("steps");

  return (
    <ChartCard
      label="Steps · 14d"
      value={`${today.toLocaleString()}`}
      subtitle={
        avg7 > 0
          ? `${Math.round(avg7).toLocaleString()} avg · ${delta >= 0 ? "+" : ""}${delta}% vs 7d`
          : "—"
      }
      deltaPositive={delta >= 0}
    >
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={series} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
            stroke="var(--color-stroke)"
            tickLine={false}
            interval={2}
          />
          <YAxis hide />
          <Tooltip content={<TooltipBox unit="steps" />} cursor={{ fill: "var(--color-elevated)" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={accent} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function HrvRhrCard({
  hrvData,
  rhrData,
  dateEnd,
}: {
  hrvData?: HrRow[];
  rhrData?: HrRow[];
  dateEnd: string;
}) {
  const dates = React.useMemo(() => lastNDates(14, fromDateStr(dateEnd)), [dateEnd]);
  const series = React.useMemo(
    () =>
      dates.map((d) => ({
        date: d,
        label: format(fromDateStr(d), "M/d"),
        hrv: hrvData?.find((r) => r?.date === d)?.ms ?? null,
        rhr: rhrData?.find((r) => r?.date === d)?.bpm ?? null,
      })),
    [dates, hrvData, rhrData]
  );
  const todayHrv = series[series.length - 1]?.hrv ?? null;
  const todayRhr = series[series.length - 1]?.rhr ?? null;
  const hrvHex = metricHex("hrv");
  const rhrHex = metricHex("rhr");

  return (
    <ChartCard
      label="Recovery · 14d"
      value={
        todayHrv != null && todayRhr != null
          ? `${Math.round(todayHrv)} · ${Math.round(todayRhr)}`
          : todayHrv != null
            ? `${Math.round(todayHrv)}`
            : todayRhr != null
              ? `${Math.round(todayRhr)}`
              : "—"
      }
      subtitle="HRV (ms) · RHR (bpm)"
      legend={
        <>
          <LegendDot color={hrvHex} label="HRV" />
          <LegendDot color={rhrHex} label="RHR" />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={series} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
            stroke="var(--color-stroke)"
            tickLine={false}
            interval={2}
          />
          <YAxis yAxisId="hrv" hide domain={["dataMin - 5", "dataMax + 5"]} />
          <YAxis yAxisId="rhr" hide orientation="right" domain={["dataMin - 3", "dataMax + 3"]} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: "var(--color-stroke-strong)" }} />
          <Line
            yAxisId="hrv"
            type="monotone"
            dataKey="hrv"
            stroke={hrvHex}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
          />
          <Line
            yAxisId="rhr"
            type="monotone"
            dataKey="rhr"
            stroke={rhrHex}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function SleepCard({ data, dateEnd }: { data?: SleepRow[]; dateEnd: string }) {
  const dates = React.useMemo(() => lastNDates(14, fromDateStr(dateEnd)), [dateEnd]);
  const series = React.useMemo(
    () =>
      dates.map((d) => ({
        date: d,
        label: format(fromDateStr(d), "M/d"),
        hours: data?.find((r) => r?.date === d)?.hours ?? 0,
      })),
    [dates, data]
  );
  const today = series[series.length - 1]?.hours ?? 0;
  const last7 = series.slice(-7).filter((r) => r.hours > 0);
  const avg7 = last7.length > 0 ? last7.reduce((a, r) => a + r.hours, 0) / last7.length : 0;
  const sleepHex = metricHex("sleep");

  return (
    <ChartCard
      label="Sleep · 14d"
      value={today > 0 ? `${round1(today)}h` : "—"}
      subtitle={avg7 > 0 ? `${round1(avg7)}h avg · target 7.5h` : "target 7.5h"}
    >
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={series} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sleep-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sleepHex} stopOpacity={0.45} />
              <stop offset="100%" stopColor={sleepHex} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
            stroke="var(--color-stroke)"
            tickLine={false}
            interval={2}
          />
          <YAxis hide domain={[0, "dataMax + 1"]} />
          <Tooltip content={<TooltipBox unit="h" />} cursor={{ stroke: "var(--color-stroke-strong)" }} />
          <ReferenceLine
            y={7.5}
            stroke={metricHex("sleep")}
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
          <Area
            type="monotone"
            dataKey="hours"
            stroke={sleepHex}
            strokeWidth={2}
            fill="url(#sleep-area)"
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartCard({
  label,
  value,
  subtitle,
  legend,
  children,
  deltaPositive,
}: {
  label: string;
  value: string;
  subtitle?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
  deltaPositive?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="card p-4"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-3)] font-semibold">
          {label}
        </span>
        {legend && <div className="flex items-center gap-3">{legend}</div>}
      </div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[22px] font-bold tnum text-[var(--color-fg)]">{value}</span>
        {subtitle && (
          <span
            className="text-[11px] tnum"
            style={{
              color:
                deltaPositive === undefined
                  ? "var(--color-fg-3)"
                  : deltaPositive
                    ? "var(--color-success)"
                    : "var(--color-warning)",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      <div className="-mx-1">{children}</div>
    </motion.div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-2)]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

interface TooltipPayloadEntry {
  dataKey: string;
  value: number | null | undefined;
  color?: string;
}

function TooltipBox({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-card)]/95 backdrop-blur px-2.5 py-1.5 shadow-[var(--shadow-float)]">
      {label && (
        <div className="text-[10px] text-[var(--color-fg-3)] mb-0.5 tnum">{label}</div>
      )}
      {payload.map((p, i) => (
        <div
          key={i}
          className="text-[11px] tnum text-[var(--color-fg)] flex items-center gap-1.5"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          <span className="capitalize text-[var(--color-fg-3)]">{p.dataKey}</span>
          <span className="ml-auto font-semibold">
            {p.value == null ? "—" : typeof p.value === "number" ? Math.round(p.value * 10) / 10 : p.value}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
