"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { useStore } from "@/store";
import { format, fromDateStr, shiftDate, todayStr } from "@/lib/date";
import { metricColors } from "@/lib/metric-colors";
import { haptic } from "@/lib/haptics";
import { round1 } from "@/lib/utils";
import { ProgressRing } from "./progress-ring";
import { computeSleepScore } from "./sleep-score";
import type { SleepStages, DateStr } from "@/lib/types";

/**
 * Detail view shown inside the Sleep Score modal. Owns the date the
 * sheet is focused on so the user can drill into past nights via the
 * 30-day grid and pop back to "last night" with the back arrow.
 *
 * The visual hierarchy mirrors how a person scans a sleep summary:
 *   score → stages bar → granular metrics → calendar history.
 */
export function SleepDetail({
  initialDate,
}: {
  /** Date the sheet should open on. Defaults to today's wake date. */
  initialDate?: DateStr;
}) {
  const today = todayStr();
  const [selected, setSelected] = React.useState<DateStr>(initialDate ?? today);

  // Reset to today whenever the sheet is freshly opened (initialDate updates).
  React.useEffect(() => {
    if (initialDate) setSelected(initialDate);
  }, [initialDate]);

  const health = useStore((s) => s.health);
  const log = health[selected];

  const breakdown = React.useMemo(() => {
    if (!log?.sleepHours) return null;
    return computeSleepScore({
      sleepHours: log.sleepHours,
      sleepStages: log.sleepStages,
    });
  }, [log?.sleepHours, log?.sleepStages]);

  const stages = log?.sleepStages;
  const hasStages = !!stages && hasAnyStage(stages);
  const c = metricColors("sleep");

  const isToday = selected === today;
  const dateLabel = isToday
    ? "Last night"
    : format(fromDateStr(selected), "EEE MMM d");

  return (
    <div className="space-y-5">
      {/* Header row with optional back-to-today */}
      <div className="flex items-center gap-2">
        {!isToday && (
          <button
            type="button"
            aria-label="Back to last night"
            onClick={() => {
              haptic("tap");
              setSelected(today);
            }}
            className="inline-flex items-center gap-1 h-8 px-2 -ml-1 rounded-lg text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
          >
            <ChevronLeft size={16} />
            <span className="text-xs">Last night</span>
          </button>
        )}
        <div className="ml-auto text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] tabular-nums">
          {dateLabel}
        </div>
      </div>

      {/* Score ring + duration */}
      <div className="flex items-center justify-center gap-6 py-2">
        <ProgressRing
          progress={(breakdown?.score ?? 0) / 100}
          size={140}
          stroke={10}
          color={c.base}
          ariaLabel={`Sleep score ${breakdown?.score ?? 0} out of 100`}
        >
          <div className="text-center">
            <div
              className="tnum text-[44px] font-bold leading-none"
              style={{ color: breakdown ? c.base : "var(--color-fg-3)" }}
            >
              {breakdown ? breakdown.score : "—"}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-3)]">
              /100
            </div>
          </div>
        </ProgressRing>
      </div>

      {/* Stages bar */}
      {hasStages ? (
        <StagesBar stages={stages!} />
      ) : log?.sleepHours ? (
        <div className="rounded-xl border border-dashed border-[var(--color-stroke)] px-4 py-3 text-center text-[12px] text-[var(--color-fg-3)]">
          Stage breakdown not available for this night.
        </div>
      ) : null}

      {/* Metrics grid */}
      <MetricsGrid log={log} hours={log?.sleepHours ?? null} stages={stages} />

      {/* 30-day calendar */}
      <SleepGrid
        endDate={today}
        selected={selected}
        onPick={(d) => {
          haptic("tap");
          setSelected(d);
        }}
      />
    </div>
  );
}

const STAGE_DEFS = [
  { key: "deepMin" as const, full: "Deep", short: "D", color: "var(--mc-sleep)" },
  { key: "remMin" as const, full: "REM", short: "R", color: "#A78BFA" },
  { key: "lightMin" as const, full: "Light", short: "L", color: "#7DD3FC" },
  { key: "wakeMin" as const, full: "Wake", short: "W", color: "#64748B" },
];

function hasAnyStage(s: SleepStages): boolean {
  return [s.lightMin, s.deepMin, s.remMin, s.wakeMin].some(
    (v) => v != null && v > 0
  );
}

function formatStageDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function StagesBar({ stages }: { stages: SleepStages }) {
  const segments = STAGE_DEFS.map((d) => ({
    ...d,
    min: stages[d.key] ?? 0,
  })).filter((s) => s.min > 0);
  const total = segments.reduce((a, b) => a + b.min, 0);
  if (total <= 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex h-4 overflow-hidden rounded-full border border-[var(--color-stroke)]">
        {segments.map((s) => {
          const pct = (s.min / total) * 100;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => haptic("tap")}
              title={`${s.full} · ${formatStageDuration(s.min)}`}
              aria-label={`${s.full}: ${formatStageDuration(s.min)}`}
              className="grid place-items-center text-[9px] font-semibold text-white/85 transition active:brightness-110"
              style={{
                width: `${pct}%`,
                background: s.color,
              }}
            >
              {pct >= 14 ? s.short : ""}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-2 text-[11px]">
        {STAGE_DEFS.map((d) => {
          const min = stages[d.key] ?? 0;
          return (
            <div
              key={d.key}
              className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: d.color }}
                />
                <span className="text-[var(--color-fg-2)]">{d.full}</span>
              </div>
              <div className="mt-0.5 tnum text-[var(--color-fg)]">
                {min > 0 ? formatStageDuration(min) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricsGrid({
  log,
  hours,
  stages,
}: {
  log: { wakeTime?: string } | undefined;
  hours: number | null;
  stages?: SleepStages;
}) {
  const asleepMin =
    stages != null
      ? (stages.lightMin ?? 0) + (stages.deepMin ?? 0) + (stages.remMin ?? 0)
      : null;
  const inBedMin =
    stages != null && asleepMin != null
      ? asleepMin + (stages.wakeMin ?? 0)
      : null;
  const efficiencyPct =
    asleepMin != null && inBedMin != null && inBedMin > 0
      ? Math.round((asleepMin / inBedMin) * 100)
      : null;

  const wake = log?.wakeTime ?? null;
  const fellAsleep =
    wake && hours != null ? subtractHours(wake, hours) : null;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Total slept", value: hours != null ? `${round1(hours)}h` : "—" },
    {
      label: "Time in bed",
      value: inBedMin != null ? formatStageDuration(inBedMin) : "—",
    },
    {
      label: "Efficiency",
      value: efficiencyPct != null ? `${efficiencyPct}%` : "—",
    },
    { label: "Fell asleep", value: fellAsleep ? formatClock(fellAsleep) : "—" },
    { label: "Woke up", value: wake ? formatClock(wake) : "—" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((r) => (
        <div
          key={r.label}
          className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-2.5"
        >
          <div className="label text-[9px]">{r.label}</div>
          <div className="mt-0.5 tnum text-[15px] font-semibold text-[var(--color-fg)]">
            {r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatClock(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}:${m.toString().padStart(2, "0")}${ampm}`;
}

function subtractHours(wakeHHMM: string, hours: number): string {
  const [h, m] = wakeHHMM.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return wakeHHMM;
  let mins = h * 60 + m - Math.round(hours * 60);
  while (mins < 0) mins += 24 * 60;
  mins = mins % (24 * 60);
  const oh = Math.floor(mins / 60);
  const om = mins % 60;
  return `${String(oh).padStart(2, "0")}:${String(om).padStart(2, "0")}`;
}

/**
 * 30-day calendar grid. Cell color saturation maps to that night's
 * sleep score; empty cells (no data) stay dim. Tapping a cell drills
 * the parent into that date.
 */
function SleepGrid({
  endDate,
  selected,
  onPick,
}: {
  endDate: DateStr;
  selected: DateStr;
  onPick: (d: DateStr) => void;
}) {
  const health = useStore((s) => s.health);
  // 30 days ending on `endDate`, oldest first.
  const dates = React.useMemo(() => {
    const out: DateStr[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      out.push(shiftDate(endDate, -i));
    }
    return out;
  }, [endDate]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="label">30-day history</h3>
        <span className="text-[11px] text-[var(--color-fg-3)]">
          tap to inspect
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {dates.map((d) => {
          const log = health[d];
          const breakdown =
            log?.sleepHours != null
              ? computeSleepScore({
                  sleepHours: log.sleepHours,
                  sleepStages: log.sleepStages,
                })
              : null;
          const score = breakdown?.score ?? null;
          const isSelected = d === selected;
          const dayNum = parseInt(d.slice(-2), 10);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-current={isSelected ? "date" : undefined}
              aria-label={`${format(fromDateStr(d), "EEE MMM d")}${
                score != null ? `, sleep score ${score}` : ", no data"
              }`}
              className="aspect-square rounded-md border min-h-[44px] transition active:scale-95 flex flex-col items-center justify-center"
              style={cellStyle(score, isSelected)}
            >
              <span className="text-[9px] tabular-nums opacity-60">
                {dayNum}
              </span>
              <span className="tnum text-[12px] font-semibold mt-0.5">
                {score ?? "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cellStyle(score: number | null, selected: boolean): React.CSSProperties {
  if (score == null) {
    return {
      background: "var(--color-elevated)",
      borderColor: selected
        ? "var(--color-fg-3)"
        : "var(--color-stroke)",
      color: "var(--color-fg-3)",
    };
  }
  // 0..100 score → fill opacity 0.18 .. 0.85.
  const alpha = 0.18 + (score / 100) * 0.67;
  return {
    background: `color-mix(in srgb, var(--mc-sleep) ${Math.round(alpha * 100)}%, var(--color-elevated))`,
    borderColor: selected
      ? "var(--mc-sleep)"
      : "color-mix(in srgb, var(--mc-sleep) 25%, transparent)",
    color: "var(--color-fg)",
  };
}

