"use client";

import * as React from "react";
import { Flame, Sunrise } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/store";
import {
  useRoutine,
  useRoutineLongestStreak,
  useRoutineStreak,
  useRoutineCompletionRate,
  useRoutineAvgCompletionMin,
  useRoutinePerItemRate,
} from "@/store/selectors";
import { lastNDates, format, fromDateStr } from "@/lib/date";
import { cn } from "@/lib/utils";

const BIN_BG = [
  "var(--color-elevated)",
  "color-mix(in srgb, var(--color-accent-strong) 18%, transparent)",
  "color-mix(in srgb, var(--color-accent-strong) 42%, transparent)",
  "color-mix(in srgb, var(--color-accent-strong) 70%, transparent)",
  "var(--color-accent-strong)",
];

function bin(pct: number) {
  if (pct <= 0) return 0;
  if (pct < 0.25) return 1;
  if (pct < 0.5) return 2;
  if (pct < 0.75) return 3;
  return 4;
}

function formatTime(mins: number) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function MorningRoutineStatsCard({ days }: { days: number }) {
  const routine = useRoutine();
  const streak = useRoutineStreak();
  const longest = useRoutineLongestStreak();
  const rate = useRoutineCompletionRate(days);
  const avgMin = useRoutineAvgCompletionMin(days);
  const perItem = useRoutinePerItemRate(days);
  const history = useStore((s) => s.routine);

  const heatmapDays = Math.min(days, 30);
  const dates = React.useMemo(() => lastNDates(heatmapDays), [heatmapDays]);
  const dayPcts = dates.map((d) => {
    if (!routine.length) return 0;
    const done = history.filter((r) => r.history[d]?.completed).length;
    return done / history.length;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Morning Routine</CardTitle>
        <span className="text-xs text-[var(--color-fg-2)] tnum">
          {Math.round(rate * 100)}% · {days}d
        </span>
      </CardHeader>

      {routine.length === 0 ? (
        <div className="text-xs text-[var(--color-fg-3)] text-center py-6">
          Set up your routine in Today to see stats.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat
              label="Current"
              value={
                <span className="inline-flex items-center gap-1">
                  <Flame
                    size={12}
                    fill="currentColor"
                    className="text-[var(--color-warning)]"
                  />
                  <span className="tnum">{streak}</span>
                </span>
              }
            />
            <Stat label="Longest" value={<span className="tnum">{longest}</span>} />
            <Stat
              label="Avg finish"
              value={
                avgMin == null ? (
                  <span className="text-[var(--color-fg-3)]">—</span>
                ) : (
                  <span className="tnum text-sm">{formatTime(avgMin)}</span>
                )
              }
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="label">Last {heatmapDays} days</span>
              <div className="flex items-center gap-1">
                {BIN_BG.map((c, i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-sm"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${Math.ceil(heatmapDays / 7)}, minmax(0, 1fr))`,
                gridAutoFlow: "column",
                gridTemplateRows: "repeat(7, minmax(0, 1fr))",
              }}
            >
              {dayPcts.map((pct, i) => (
                <div
                  key={dates[i]}
                  title={`${format(fromDateStr(dates[i]), "MMM d")} — ${Math.round(pct * 100)}%`}
                  className="aspect-square rounded-[3px]"
                  style={{ background: BIN_BG[bin(pct)] }}
                />
              ))}
            </div>
          </div>

          {avgMin != null && (
            <div className="mb-4 flex items-center gap-2 text-xs text-[var(--color-fg-2)]">
              <Sunrise size={13} className="text-[var(--color-accent)]" />
              You usually finish by {formatTime(avgMin)}.
            </div>
          )}

          <div>
            <div className="label mb-2">Per item</div>
            <div className="space-y-1.5">
              {perItem.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2"
                >
                  <span className="text-base leading-none w-5 text-center">
                    {item.icon}
                  </span>
                  <span className="flex-1 text-[12px] text-[var(--color-fg-2)] truncate">
                    {item.name}
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-[var(--color-elevated)] overflow-hidden shrink-0">
                    <div
                      className={cn(
                        "h-full",
                        item.pct >= 75
                          ? "bg-[var(--color-accent)]"
                          : item.pct >= 40
                            ? "bg-[color:color-mix(in_srgb,var(--color-accent)_60%,transparent)]"
                            : "bg-[var(--color-stroke-strong)]"
                      )}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--color-fg-3)] tnum w-8 text-right">
                    {item.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-2">
      <div className="label text-[9px]">{label}</div>
      <div className="text-base font-semibold tnum mt-0.5">{value}</div>
    </div>
  );
}
