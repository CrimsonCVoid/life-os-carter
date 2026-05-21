"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Dumbbell, Play } from "lucide-react";

import { useDay } from "@/components/today/day-context";
import { useWorkoutRoutines } from "@/lib/hooks/use-workout-routines";
import { useStore } from "@/store";
import { fromDateStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { WorkoutRoutine } from "@/lib/types";

export function TodayRoutineCard() {
  const { date, isFuture } = useDay();
  const { routines } = useWorkoutRoutines();
  const activeWorkout = useStore((s) => s.activeWorkout);

  const dayOfWeek = React.useMemo(() => fromDateStr(date).getDay(), [date]);

  const todays = React.useMemo<WorkoutRoutine[]>(
    () =>
      routines
        .filter((r) => r.scheduledDays?.includes(dayOfWeek))
        .sort((a, b) => a.order - b.order),
    [routines, dayOfWeek]
  );

  if (isFuture) return null;
  if (todays.length === 0) return null;

  const handleStart = (routine: WorkoutRoutine) => {
    haptic("success");
    useStore.getState().startWorkoutFromTemplate(routine);
    // TODO: navigate to /gym/active once the active-workout page lands (Phase 3).
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border p-4 space-y-3"
      style={{
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--pillar-strain) 14%, var(--color-card)) 0%, var(--color-card) 70%)",
        borderColor:
          "color-mix(in srgb, var(--pillar-strain) 28%, var(--color-stroke))",
      }}
    >
      <div className="flex items-center gap-1.5">
        <Dumbbell
          size={13}
          style={{ color: "var(--pillar-strain)" }}
          strokeWidth={2.5}
        />
        <span
          className="text-[10px] uppercase tracking-[0.16em] font-semibold"
          style={{ color: "var(--pillar-strain)" }}
        >
          {todays.length === 1 ? "Today's routine" : "Today's routines"}
        </span>
      </div>

      <div className="space-y-2">
        {todays.map((routine) => (
          <RoutineRow
            key={routine.id}
            routine={routine}
            disabled={Boolean(activeWorkout)}
            onStart={() => handleStart(routine)}
          />
        ))}
      </div>

      {activeWorkout && (
        <div className="text-[10px] text-[var(--color-fg-3)]">
          A workout is already in progress.
        </div>
      )}
    </motion.div>
  );
}

function RoutineRow({
  routine,
  disabled,
  onStart,
}: {
  routine: WorkoutRoutine;
  disabled: boolean;
  onStart: () => void;
}) {
  const setsSummary = React.useMemo(() => {
    const exerciseCount = routine.exercises.length;
    const setCount = routine.exercises.reduce(
      (acc, e) => acc + (e.plannedSets?.length ?? 0),
      0
    );
    if (exerciseCount === 0) return "Empty routine";
    const exLabel = `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`;
    if (setCount === 0) return exLabel;
    return `${exLabel} · ${setCount} set${setCount === 1 ? "" : "s"}`;
  }, [routine.exercises]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[var(--color-stroke)]",
        "bg-[var(--color-card)] px-3 py-2.5"
      )}
    >
      <div
        className="h-11 w-11 grid place-items-center rounded-xl text-[20px] shrink-0"
        style={{
          background: "color-mix(in srgb, var(--pillar-strain) 14%, transparent)",
          border:
            "1px solid color-mix(in srgb, var(--pillar-strain) 26%, transparent)",
        }}
      >
        {routine.icon || "💪"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold tracking-tight truncate">
          {routine.name}
        </div>
        <div className="text-[11px] text-[var(--color-fg-3)] tnum truncate">
          {setsSummary}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        aria-label={`Start ${routine.name}`}
        className={cn(
          "inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-[13px] font-semibold shrink-0",
          "active:scale-[0.97] transition-transform duration-[80ms]",
          "disabled:opacity-40 disabled:pointer-events-none"
        )}
        style={{
          background: "var(--pillar-strain)",
          color: "#001018",
        }}
      >
        <Play size={13} strokeWidth={2.5} />
        Start
      </button>
    </div>
  );
}
