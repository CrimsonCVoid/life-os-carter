"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/store";
import { todayStr, fromDateStr, format } from "@/lib/date";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * 7-day calendar grid. Rows are metrics (mood, sleep, water, steps, weight,
 * workout). Columns are weekdays. Each cell is a colored dot whose
 * saturation reflects how complete that day's value is vs target. Tap a
 * day column header to deep-link into that day's view.
 *
 * Differs from the existing Heatmap (which is per-metric, 90 days, density
 * style) — this is per-day, all-metrics, glance-able.
 */
export function WeekViewCard() {
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);
  const body = useStore((s) => s.body);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(new Date()));

  const dates = React.useMemo(() => {
    const out: string[] = [];
    const start = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(toISODate(d));
    }
    return out;
  }, [weekStart]);

  const today = todayStr();

  const liftDates = React.useMemo(
    () => new Set(liftSessions.map((s) => s.date)),
    [liftSessions]
  );

  const weights = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of body) if (e.weight != null) m.set(e.date, e.weight);
    return m;
  }, [body]);

  const rangeLabel = `${format(fromDateStr(dates[0]), "MMM d")} – ${format(fromDateStr(dates[6]), "MMM d")}`;
  const isCurrentWeek = dates.includes(today);

  const shift = (days: number) => {
    haptic("tap");
    setWeekStart((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const rows: Array<{
    key: string;
    label: string;
    color: string;
    fill: (date: string) => number; // 0..1 saturation
    display: (date: string) => string;
  }> = [
    {
      key: "water",
      label: "Water",
      color: "var(--mc-water)",
      fill: (d) => clamp01((health[d]?.waterOz ?? 0) / Math.max(1, waterTargetOz)),
      display: (d) => `${health[d]?.waterOz ?? 0}oz`,
    },
    {
      key: "sleep",
      label: "Sleep",
      color: "var(--mc-sleep)",
      fill: (d) => clamp01((health[d]?.sleepHours ?? 0) / 8),
      display: (d) => {
        const h = health[d]?.sleepHours;
        return h != null && h > 0 ? `${h.toFixed(1)}h` : "—";
      },
    },
    {
      key: "mood",
      label: "Mood",
      color: "var(--mc-mood-high)",
      fill: (d) => clamp01((health[d]?.mood ?? 0) / 10),
      display: (d) => {
        const m = health[d]?.mood;
        return m != null && m > 0 ? `${m}/10` : "—";
      },
    },
    {
      key: "steps",
      label: "Steps",
      color: "var(--mc-steps)",
      fill: (d) => clamp01((health[d]?.steps ?? 0) / 10000),
      display: (d) => {
        const s = health[d]?.steps;
        return s != null && s > 0 ? formatThousands(s) : "—";
      },
    },
    {
      key: "weight",
      label: "Weight",
      color: "var(--mc-weight)",
      // Just "logged" presence — no target for weight.
      fill: (d) => (weights.has(d) ? 1 : 0),
      display: (d) => (weights.has(d) ? `${weights.get(d)!.toFixed(1)}lb` : "—"),
    },
    {
      key: "lift",
      label: "Workout",
      color: "var(--color-accent)",
      fill: (d) => (liftDates.has(d) ? 1 : 0),
      display: (d) => (liftDates.has(d) ? "✓" : "—"),
    },
  ];

  return (
    <div className="rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-card)] p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
          Week view
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-7)}
            aria-label="Previous week"
            className="h-7 w-7 grid place-items-center rounded-full text-[var(--color-fg-2)] active:scale-95"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="text-[12px] tnum text-[var(--color-fg-2)] min-w-[88px] text-center">
            {isCurrentWeek ? "This week" : rangeLabel}
          </div>
          <button
            type="button"
            onClick={() => shift(7)}
            aria-label="Next week"
            className="h-7 w-7 grid place-items-center rounded-full text-[var(--color-fg-2)] active:scale-95"
            disabled={isCurrentWeek}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(56px,auto) repeat(7, minmax(0, 1fr))" }}>
        {/* Header row */}
        <div />
        {dates.map((d) => {
          const isToday = d === today;
          const dt = fromDateStr(d);
          return (
            <div key={d} className="text-center pb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
                {format(dt, "EEEEE")}
              </div>
              <div
                className={cn(
                  "text-[12px] font-semibold tnum",
                  isToday && "text-[var(--color-accent)]"
                )}
              >
                {format(dt, "d")}
              </div>
            </div>
          );
        })}

        {/* Metric rows */}
        {rows.map((row) => (
          <React.Fragment key={row.key}>
            <div className="text-[11px] text-[var(--color-fg-2)] flex items-center pr-1 truncate">
              {row.label}
            </div>
            {dates.map((d) => {
              const f = row.fill(d);
              const dt = fromDateStr(d);
              const future = dt.getTime() > new Date().getTime();
              return (
                <div
                  key={d}
                  className="grid place-items-center py-1"
                  title={`${row.label} ${format(dt, "MMM d")}: ${row.display(d)}`}
                >
                  <div
                    className="h-5 w-5 rounded-full"
                    style={{
                      background:
                        future
                          ? "var(--color-stroke)"
                          : f > 0
                          ? `color-mix(in srgb, ${row.color} ${Math.round(20 + f * 75)}%, transparent)`
                          : "var(--color-stroke)",
                      border:
                        f >= 1
                          ? `1.5px solid color-mix(in srgb, ${row.color} 100%, transparent)`
                          : "1px solid transparent",
                    }}
                  />
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-2.5 text-[10px] text-[var(--color-fg-3)] flex items-center gap-2">
        <span>Empty</span>
        <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-[var(--color-stroke)] via-[color:color-mix(in_srgb,var(--color-accent)_50%,transparent)] to-[var(--color-accent)]" />
        <span>Goal</span>
      </div>
    </div>
  );
}

function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(d.getDate() + diff);
  return m;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function formatThousands(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
