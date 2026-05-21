"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ChevronLeft, Trophy } from "lucide-react";

import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { useStore } from "@/store";
import { bestE1RM, estimated1RM, topSet, totalVolume } from "@/lib/repcount";
import {
  allTimeRecords,
  compoundRecords,
  repRangePRs,
  yearsWithSessions,
  type RepRangePR,
} from "@/lib/pr-detection";
import { format, fromDateStr } from "@/lib/date";
import { round1 } from "@/lib/utils";
import { EXERCISE_LIBRARY } from "@/lib/exercise-library";

type Metric = "top" | "e1rm" | "volume" | "reps";

const METRIC_LABEL: Record<Metric, string> = {
  top: "Top set (lb)",
  e1rm: "Est. 1RM (lb)",
  volume: "Volume (lb)",
  reps: "Top reps",
};

type Grouping = "session" | "week" | "month" | "year";

const GROUPING_LABEL: Record<Grouping, string> = {
  session: "Session",
  week: "Week",
  month: "Month",
  year: "Year",
};

export default function ExerciseDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const decoded = React.useMemo(
    () => decodeURIComponent(params.name ?? ""),
    [params.name]
  );
  const normalized = decoded.trim().toLowerCase();

  const liftSessions = useStore((s) => s.liftSessions);
  const [metric, setMetric] = React.useState<Metric>("top");
  const [grouping, setGrouping] = React.useState<Grouping>("session");
  const [yearFilter, setYearFilter] = React.useState<number | null>(null);

  const allRelevant = React.useMemo(
    () =>
      liftSessions
        .filter((s) => s.exercises.some((e) => e.normalizedName === normalized))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [liftSessions, normalized]
  );

  const years = React.useMemo(
    () => yearsWithSessions(allRelevant),
    [allRelevant]
  );

  const relevant = React.useMemo(
    () =>
      yearFilter == null
        ? allRelevant
        : allRelevant.filter((s) =>
            s.date.startsWith(String(yearFilter))
          ),
    [allRelevant, yearFilter]
  );

  const displayName = React.useMemo(() => {
    for (let i = relevant.length - 1; i >= 0; i--) {
      const found = relevant[i].exercises.find(
        (e) => e.normalizedName === normalized
      );
      if (found) return found.name;
    }
    return decoded;
  }, [relevant, normalized, decoded]);

  const libraryMeta = React.useMemo(
    () =>
      EXERCISE_LIBRARY.find(
        (e) =>
          e.name.toLowerCase() === normalized ||
          e.aliases?.some((a) => a.toLowerCase() === normalized)
      ),
    [normalized]
  );

  const records = React.useMemo(
    () => allTimeRecords(normalized, liftSessions),
    [normalized, liftSessions]
  );

  const points = React.useMemo(
    () =>
      relevant.map((sess) => {
        const ex = sess.exercises.find(
          (e) => e.normalizedName === normalized
        );
        const sets = ex?.sets ?? [];
        const top = topSet(sets);
        return {
          date: sess.date,
          dateLabel: format(fromDateStr(sess.date), "M/d"),
          top: top?.weight ?? 0,
          e1rm: bestE1RM(sets),
          volume: totalVolume(sets),
          reps: sets.reduce((m, s) => Math.max(m, s.reps), 0),
          repsAtTop: top?.reps ?? 0,
          setCount: sets.length,
          avgRpe: avgRpe(sets),
        };
      }),
    [relevant, normalized]
  );

  const groupedPoints = React.useMemo(
    () => groupPoints(points, grouping),
    [points, grouping]
  );

  const chartData = React.useMemo(() => {
    const series = groupedPoints.map((p) => ({
      date: p.label,
      v:
        metric === "top"
          ? p.top
          : metric === "e1rm"
            ? p.e1rm
            : metric === "volume"
              ? p.volume
              : p.reps,
    }));
    return withMovingAverage(series, Math.min(4, Math.max(2, series.length > 8 ? 4 : 2)));
  }, [groupedPoints, metric]);

  const lastSession = relevant[relevant.length - 1];

  if (relevant.length === 0) {
    return (
      <Screen>
        <BackBar onBack={() => router.back()} />
        <Card>
          <div className="py-10 text-center">
            <div className="text-[15px] font-semibold tracking-tight">
              {displayName}
            </div>
            <div className="text-[12px] text-[var(--color-fg-3)] mt-1">
              No sessions logged for this exercise yet.
            </div>
          </div>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackBar onBack={() => router.back()} />

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] font-medium">
          {libraryMeta?.muscleGroup ?? "Exercise"}
          {libraryMeta?.equipment && ` · ${libraryMeta.equipment}`}
        </div>
        <h1 className="text-[26px] font-bold tracking-tight">{displayName}</h1>
        <div className="text-[12px] text-[var(--color-fg-3)] tnum">
          {relevant.length} session{relevant.length === 1 ? "" : "s"} · last{" "}
          {format(fromDateStr(lastSession.date), "MMM d, yyyy")}
        </div>
      </div>

      {years.length > 1 && (
        <YearFilter
          years={years}
          value={yearFilter}
          onChange={setYearFilter}
        />
      )}

      <RecordsGrid records={records} />

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <Segmented<Metric>
            value={metric}
            onChange={setMetric}
            options={[
              { value: "top", label: "Top" },
              { value: "e1rm", label: "1RM" },
              { value: "volume", label: "Vol" },
              { value: "reps", label: "Reps" },
            ]}
            size="sm"
          />
        </CardHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-[var(--color-fg-3)]">
            {METRIC_LABEL[metric]} · per {GROUPING_LABEL[grouping].toLowerCase()}
          </div>
          <Segmented<Grouping>
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: "session", label: "S" },
              { value: "week", label: "W" },
              { value: "month", label: "M" },
              { value: "year", label: "Y" },
            ]}
            size="sm"
          />
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--color-stroke)"
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-stroke-strong)",
                  fontSize: 11,
                  borderRadius: 8,
                }}
                labelStyle={{ color: "var(--color-fg-3)" }}
                formatter={(v, key) => {
                  const n = typeof v === "number" ? v : Number(v);
                  const unit = metric === "reps" ? "reps" : "lb";
                  const label = key === "ma" ? "Trend" : "Value";
                  return [`${round1(n)} ${unit}`, label];
                }}
              />
              <Line
                type="monotone"
                dataKey="ma"
                stroke="color-mix(in srgb, var(--color-accent) 50%, transparent)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "var(--color-accent)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--color-fg-3)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-3 bg-[var(--color-accent)] inline-block" />
            Actual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-3 bg-[color:color-mix(in_srgb,var(--color-accent)_50%,transparent)] inline-block" style={{ borderTop: "1px dashed currentColor" }} />
            Moving avg
          </span>
        </div>
      </Card>

      <RepRangePRsCard normalized={normalized} sessions={relevant} />
      <CompoundRecordsCard sessions={liftSessions} />

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
          <span className="text-xs text-[var(--color-fg-3)] tnum">
            {Math.min(relevant.length, 20)} of {relevant.length}
          </span>
        </CardHeader>
        <ul className="space-y-2">
          {[...points]
            .reverse()
            .slice(0, 20)
            .map((p) => (
              <li
                key={p.date}
                className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">
                    {format(fromDateStr(p.date), "EEE, MMM d")}
                  </span>
                  <span className="text-[11px] text-[var(--color-fg-3)] tnum">
                    {p.setCount} set{p.setCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-[var(--color-fg-2)] tnum">
                  Top {p.top > 0 ? `${p.top}×${p.repsAtTop}` : `BW×${p.repsAtTop}`}
                  {p.e1rm > 0 && ` · e1RM ${round1(p.e1rm)}`}
                  {` · ${formatVolume(p.volume)} vol`}
                  {p.avgRpe != null && ` · RPE ${round1(p.avgRpe)}`}
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </Screen>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-[12px] text-[var(--color-fg-2)] active:opacity-70 -ml-1"
    >
      <ChevronLeft size={16} />
      Back
    </button>
  );
}

function RecordsGrid({
  records,
}: {
  records: ReturnType<typeof allTimeRecords>;
}) {
  const tiles: Array<{ label: string; value: string; sub: string | null }> = [
    {
      label: "Top set",
      value: records.topSetWeight
        ? `${records.topSetWeight.value} lb`
        : "—",
      sub: records.topSetWeight
        ? `${records.topSetWeight.reps} reps · ${formatDate(records.topSetWeight.date)}`
        : null,
    },
    {
      label: "Est. 1RM",
      value: records.e1rm ? `${round1(records.e1rm.value)} lb` : "—",
      sub: records.e1rm ? formatDate(records.e1rm.date) : null,
    },
    {
      label: "Top reps",
      value: records.topSetReps ? String(records.topSetReps.value) : "—",
      sub: records.topSetReps
        ? `@ ${records.topSetReps.weight > 0 ? records.topSetReps.weight + " lb" : "BW"} · ${formatDate(records.topSetReps.date)}`
        : null,
    },
    {
      label: "Session vol.",
      value: records.sessionVolume
        ? formatVolume(records.sessionVolume.value)
        : "—",
      sub: records.sessionVolume ? formatDate(records.sessionVolume.date) : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)] p-3 relative overflow-hidden"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] font-medium">
            <Trophy size={10} className="text-[var(--color-warning)]" />
            {t.label}
          </div>
          <div className="text-[20px] font-bold tnum tracking-tight mt-1">
            {t.value}
          </div>
          {t.sub && (
            <div className="text-[10px] text-[var(--color-fg-3)] mt-0.5 truncate">
              {t.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function avgRpe(sets: { rpe?: number }[]): number | null {
  const vals = sets.map((s) => s.rpe).filter((n): n is number => n != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatDate(d: string): string {
  return format(fromDateStr(d), "MMM d, yyyy");
}

function formatVolume(v: number): string {
  if (v <= 0) return "0 lb";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k lb`;
  return `${Math.round(v)} lb`;
}

void estimated1RM;

/* ---------------- Year filter chip row ---------------- */

function YearFilter({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <YearChip active={value == null} onClick={() => onChange(null)} label="All time" />
      {years.map((y) => (
        <YearChip
          key={y}
          active={value === y}
          onClick={() => onChange(y)}
          label={String(y)}
        />
      ))}
    </div>
  );
}

function YearChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "h-7 px-3 rounded-full text-[11px] font-medium bg-[var(--color-accent-strong)] text-white"
          : "h-7 px-3 rounded-full text-[11px] font-medium bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)]"
      }
    >
      {label}
    </button>
  );
}

/* ---------------- Per-rep-range PRs card ---------------- */

function RepRangePRsCard({
  normalized,
  sessions,
}: {
  normalized: string;
  sessions: import("@/lib/types").LiftSession[];
}) {
  const prs = React.useMemo(
    () => repRangePRs(normalized, sessions),
    [normalized, sessions]
  );
  if (prs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rep-range records</CardTitle>
        <span className="text-xs text-[var(--color-fg-3)]">Heaviest at ≥ N reps</span>
      </CardHeader>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {prs.map((pr) => (
          <RepRangeTile key={pr.reps} pr={pr} />
        ))}
      </div>
    </Card>
  );
}

function RepRangeTile({ pr }: { pr: RepRangePR }) {
  return (
    <div className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
        ≥ {pr.reps} rep{pr.reps === 1 ? "" : "s"}
      </div>
      <div className="text-[18px] font-bold tnum tracking-tight mt-0.5">
        {pr.weight} <span className="text-[10px] font-normal text-[var(--color-fg-3)]">lb</span>
      </div>
      <div className="text-[10px] text-[var(--color-fg-3)] tnum mt-0.5 truncate">
        {pr.actualReps} reps · {format(fromDateStr(pr.date), "MMM d, yyyy")}
      </div>
    </div>
  );
}

/* ---------------- Compound records card ---------------- */

function CompoundRecordsCard({
  sessions,
}: {
  sessions: import("@/lib/types").LiftSession[];
}) {
  const recs = React.useMemo(() => compoundRecords(sessions), [sessions]);
  if (recs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session records</CardTitle>
        <span className="text-xs text-[var(--color-fg-3)]">All time</span>
      </CardHeader>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li
            key={r.label}
            className="flex items-baseline justify-between gap-2 px-2 py-1.5 rounded-lg bg-[var(--color-elevated)]/40 border border-[var(--color-stroke)]"
          >
            <span className="text-[12px] text-[var(--color-fg-2)]">{r.label}</span>
            <span className="text-[13px] font-semibold tnum">
              {r.unit === "lb" && r.value >= 1000
                ? `${(r.value / 1000).toFixed(1)}k lb`
                : `${r.value} ${r.unit}`}
              <span className="text-[10px] text-[var(--color-fg-3)] tnum font-normal ml-1.5">
                {format(fromDateStr(r.date), "MMM d, ’yy")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------- Grouping + moving-average helpers ---------------- */

type Point = {
  date: string;
  dateLabel: string;
  top: number;
  e1rm: number;
  volume: number;
  reps: number;
  repsAtTop: number;
  setCount: number;
  avgRpe: number | null;
};

type GroupedPoint = {
  label: string;
  top: number;
  e1rm: number;
  volume: number;
  reps: number;
};

function groupPoints(points: Point[], grouping: Grouping): GroupedPoint[] {
  if (grouping === "session") {
    return points.map((p) => ({
      label: p.dateLabel,
      top: p.top,
      e1rm: p.e1rm,
      volume: p.volume,
      reps: p.reps,
    }));
  }
  const buckets = new Map<string, Point[]>();
  for (const p of points) {
    const key = bucketKey(p.date, grouping);
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => ({
      label: bucketLabel(key, grouping),
      // Bests of the bucket — represents progress, not average
      top: Math.max(...group.map((g) => g.top)),
      e1rm: Math.max(...group.map((g) => g.e1rm)),
      volume: group.reduce((a, g) => a + g.volume, 0),
      reps: Math.max(...group.map((g) => g.reps)),
    }));
}

function bucketKey(dateStr: string, grouping: Grouping): string {
  const d = new Date(dateStr + "T00:00:00");
  if (grouping === "year") return `${d.getFullYear()}`;
  if (grouping === "month")
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // week: ISO-like Monday-based week key
  const monday = new Date(d);
  const day = (d.getDay() + 6) % 7; // 0..6 with Monday=0
  monday.setDate(d.getDate() - day);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function bucketLabel(key: string, grouping: Grouping): string {
  if (grouping === "year") return key;
  if (grouping === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
  }
  // week
  const d = new Date(key + "T00:00:00");
  return d.toLocaleString(undefined, { month: "short", day: "numeric" });
}

function withMovingAverage(
  series: { date: string; v: number }[],
  window: number
): { date: string; v: number; ma: number | null }[] {
  return series.map((p, i) => {
    if (i < window - 1) return { ...p, ma: null };
    let sum = 0;
    for (let j = 0; j < window; j++) sum += series[i - j].v;
    return { ...p, ma: sum / window };
  });
}
