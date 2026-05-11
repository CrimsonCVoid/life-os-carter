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
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { format, fromDateStr, lastNDates } from "@/lib/date";
import { useStore } from "@/store";
import {
  useLastNHealth,
  useLastNWorkouts,
  useHabits,
} from "@/store/selectors";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { round1 } from "@/lib/utils";

const tickStyle = { fill: "var(--color-fg-3)", fontSize: 10 };
const gridStroke = "var(--color-stroke)";

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-stroke-strong)] bg-[var(--color-card)] px-2.5 py-1.5 shadow-[var(--shadow-card)]">
      <div className="text-[10px] text-[var(--color-fg-3)]">{label}</div>
      {payload.map((p: any) => (
        <div
          key={p.dataKey}
          className="text-xs tnum"
          style={{ color: p.color || "var(--color-fg)" }}
        >
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export function MoodEnergyChart({ days }: { days: number }) {
  const data = useLastNHealth(days).map((d) => ({
    date: format(fromDateStr(d.date), "M/d"),
    mood: d.log?.mood ?? null,
    energy: d.log?.energy ?? null,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mood + Energy</CardTitle>
        <span className="text-xs text-[var(--color-fg-3)]">{days}d</span>
      </CardHeader>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
            <XAxis dataKey="date" tick={tickStyle} stroke={gridStroke} />
            <YAxis domain={[0, 10]} tick={tickStyle} stroke={gridStroke} width={20} />
            <Tooltip content={<TooltipBox />} cursor={{ stroke: "var(--color-stroke-strong)" }} />
            <Line
              type="monotone"
              dataKey="mood"
              name="Mood"
              stroke="#A78BFA"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="energy"
              name="Energy"
              stroke="#FBBF24"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function SleepChart({ days }: { days: number }) {
  const series = useLastNHealth(days).map((d) => ({
    date: format(fromDateStr(d.date), "M/d"),
    hours: d.log?.sleepHours ?? null,
  }));
  const valid = series.filter((s) => s.hours != null) as Array<{
    date: string;
    hours: number;
  }>;
  const avg = valid.length
    ? round1(valid.reduce((acc, x) => acc + x.hours, 0) / valid.length)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sleep</CardTitle>
        <span className="text-xs text-[var(--color-fg-2)] tnum">
          {avg != null ? `avg ${avg}h` : "—"}
        </span>
      </CardHeader>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
            <XAxis dataKey="date" tick={tickStyle} stroke={gridStroke} />
            <YAxis domain={[0, 12]} tick={tickStyle} stroke={gridStroke} width={20} />
            <Tooltip content={<TooltipBox />} />
            <Area
              type="monotone"
              dataKey="hours"
              name="Sleep"
              stroke="#A78BFA"
              fill="url(#sleepGrad)"
              strokeWidth={2}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function WeightChart({ days }: { days: number }) {
  const unit = useStore((s) => s.settings.units.weight);
  const conv = (lb: number) => (unit === "kg" ? lb * 0.453592 : lb);

  const series = useLastNHealth(days).map((d) => ({
    date: format(fromDateStr(d.date), "M/d"),
    weight: d.log?.weight != null ? round1(conv(d.log.weight)) : null,
  }));

  // 7-day moving avg
  const ma = series.map((_, i) => {
    const slice = series
      .slice(Math.max(0, i - 6), i + 1)
      .map((x) => x.weight)
      .filter((x): x is number => x != null);
    return slice.length
      ? round1(slice.reduce((a, b) => a + b, 0) / slice.length)
      : null;
  });
  const merged = series.map((s, i) => ({ ...s, ma: ma[i] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weight ({unit})</CardTitle>
      </CardHeader>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
            <XAxis dataKey="date" tick={tickStyle} stroke={gridStroke} />
            <YAxis domain={["auto", "auto"]} tick={tickStyle} stroke={gridStroke} width={32} />
            <Tooltip content={<TooltipBox />} />
            <Line
              type="monotone"
              dataKey="weight"
              name="Weight"
              stroke="#8E8E93"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="ma"
              name="7-day avg"
              stroke="#A78BFA"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const WORKOUT_COLORS: Record<string, string> = {
  Push: "#A78BFA",
  Pull: "#60A5FA",
  Legs: "#FBBF24",
  Cardio: "#34D399",
  Yoga: "#F472B6",
  Other: "#8E8E93",
};

export function WorkoutsDonut({ days }: { days: number }) {
  const list = useLastNWorkouts(days);
  const grouped: Record<string, number> = {};
  for (const w of list) {
    grouped[w.type] = (grouped[w.type] ?? 0) + 1;
  }
  const data = Object.entries(grouped).map(([type, count]) => ({
    type,
    count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workouts</CardTitle>
        <span className="text-xs text-[var(--color-fg-2)] tnum">
          {list.length} total
        </span>
      </CardHeader>
      <div className="h-44">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-xs text-[var(--color-fg-3)]">
            No workouts in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="type"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.type}
                    fill={WORKOUT_COLORS[entry.type] ?? "#8E8E93"}
                  />
                ))}
              </Pie>
              <Tooltip content={<TooltipBox />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "var(--color-fg-2)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function HabitRatesBars({ days }: { days: number }) {
  const habits = useHabits();
  const dates = lastNDates(days);
  const data = habits.map((h) => {
    const done = dates.filter((d) => h.history[d]).length;
    return {
      name: h.name,
      pct: Math.round((done / dates.length) * 100),
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Habit rates · {days}d</CardTitle>
      </CardHeader>
      {data.length === 0 ? (
        <div className="text-xs text-[var(--color-fg-3)] text-center py-6">
          Add habits to track rates.
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={tickStyle}
                stroke={gridStroke}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={tickStyle}
                width={88}
                stroke={gridStroke}
              />
              <Tooltip content={<TooltipBox />} />
              <Bar dataKey="pct" fill="#A78BFA" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
