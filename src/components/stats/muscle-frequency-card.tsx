"use client";

import * as React from "react";
import { useStore } from "@/store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EXERCISE_LIBRARY, type MuscleGroup } from "@/lib/exercise-library";
import { shiftDate, todayStr } from "@/lib/date";
import { cn } from "@/lib/utils";

type Range = "28" | "56";

const MUSCLE_ORDER: MuscleGroup[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
];

export function MuscleFrequencyCard() {
  const liftSessions = useStore((s) => s.liftSessions);
  const [range, setRange] = React.useState<Range>("28");

  const days = parseInt(range, 10);
  const cutoff = React.useMemo(() => shiftDate(todayStr(), -days), [days]);

  const counts = React.useMemo(() => {
    const exerciseToMuscle = new Map<string, MuscleGroup>();
    for (const e of EXERCISE_LIBRARY) {
      exerciseToMuscle.set(e.name.toLowerCase(), e.muscleGroup);
      for (const a of e.aliases ?? []) {
        exerciseToMuscle.set(a.toLowerCase(), e.muscleGroup);
      }
    }
    const muscleCount: Record<string, number> = {};
    for (const m of MUSCLE_ORDER) muscleCount[m] = 0;
    for (const s of liftSessions) {
      if (s.date < cutoff) continue;
      for (const ex of s.exercises) {
        const m = exerciseToMuscle.get(ex.normalizedName);
        if (!m || !Object.prototype.hasOwnProperty.call(muscleCount, m)) continue;
        muscleCount[m] += ex.sets.filter((st) => st.completed !== false).length;
      }
    }
    return muscleCount;
  }, [liftSessions, cutoff]);

  const max = Math.max(1, ...MUSCLE_ORDER.map((m) => counts[m] ?? 0));
  const total = MUSCLE_ORDER.reduce((a, m) => a + (counts[m] ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle frequency</CardTitle>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRange("28")}
            className={cn(
              "h-6 px-2 rounded-md text-[11px] tnum",
              range === "28"
                ? "bg-[var(--color-accent-strong)] text-white"
                : "bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)]"
            )}
          >
            4w
          </button>
          <button
            type="button"
            onClick={() => setRange("56")}
            className={cn(
              "h-6 px-2 rounded-md text-[11px] tnum",
              range === "56"
                ? "bg-[var(--color-accent-strong)] text-white"
                : "bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)]"
            )}
          >
            8w
          </button>
        </div>
      </CardHeader>

      {total === 0 ? (
        <div className="py-6 text-center text-[12px] text-[var(--color-fg-3)]">
          No completed sets in the window.
        </div>
      ) : (
        <div className="space-y-1.5">
          {MUSCLE_ORDER.map((m) => {
            const c = counts[m] ?? 0;
            const pct = (c / max) * 100;
            const isLow = c <= Math.max(2, max * 0.2);
            return (
              <div
                key={m}
                className="grid grid-cols-[80px_minmax(0,1fr)_28px] gap-2 items-center"
              >
                <div className="text-[11px] text-[var(--color-fg-2)]">{m}</div>
                <div className="relative h-3 rounded-full bg-[var(--color-elevated)] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                    style={{
                      width: `${pct}%`,
                      background: isLow
                        ? "color-mix(in srgb, var(--color-warning) 60%, transparent)"
                        : "var(--color-accent)",
                    }}
                  />
                </div>
                <div className="text-[11px] tnum text-right text-[var(--color-fg-3)]">
                  {c}
                </div>
              </div>
            );
          })}
          <div className="text-[10px] text-[var(--color-fg-3)] mt-2 px-1">
            Warning color = under 20% of your most-trained muscle. Balance suggestions over the next week.
          </div>
        </div>
      )}
    </Card>
  );
}
