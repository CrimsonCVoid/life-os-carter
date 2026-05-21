"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Calculator,
  Check,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Timer,
  Trash2,
  X,
} from "lucide-react";

import { useStore } from "@/store";
import type {
  ActiveWorkoutSession,
  LiftExercise,
  LiftSession,
  LiftSet,
} from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  findLastSessionFor,
  formatDaysAgo,
  type ExerciseLastSession,
} from "@/lib/workout-history";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { NumericKeypad } from "@/components/workout/numeric-keypad";
import { PlateCalculatorPopup } from "@/components/workout/plate-calculator-popup";
import { ExerciseLibraryPicker } from "@/components/workout/exercise-library-picker";
import { WorkoutSummary } from "@/components/workout/workout-summary";

const DEFAULT_REST_SECONDS = 120;
const REST_QUICK_DELTAS = [-30, 30] as const;

type Props = {
  open: boolean;
  /** Minimize the page (workout stays active). */
  onClose: () => void;
};

type KeypadTarget = {
  exerciseId: string;
  exerciseName: string;
  order: number;
  field: "weight" | "reps";
  initialValue: number;
};

type RpeDrawerTarget = {
  exerciseId: string;
  order: number;
};

export function ActiveWorkoutPage({ open, onClose }: Props) {
  const active = useStore((s) => s.activeWorkout);
  const liftSessions = useStore((s) => s.liftSessions);
  const addExercise = useStore((s) => s.addActiveWorkoutExercise);
  const removeExercise = useStore((s) => s.removeActiveWorkoutExercise);
  const addSet = useStore((s) => s.addActiveWorkoutSet);
  const removeSet = useStore((s) => s.removeActiveWorkoutSet);
  const updateSet = useStore((s) => s.updateActiveWorkoutSet);
  const toggleComplete = useStore((s) => s.toggleActiveWorkoutSetComplete);
  const setRestTarget = useStore((s) => s.setActiveWorkoutRestTarget);
  const dismissRest = useStore((s) => s.dismissActiveWorkoutRest);
  const finish = useStore((s) => s.finishActiveWorkout);
  const cancel = useStore((s) => s.cancelActiveWorkout);

  const [keypad, setKeypad] = React.useState<KeypadTarget | null>(null);
  const [plateOpen, setPlateOpen] = React.useState<{ totalWeight: number } | null>(null);
  const [barWeight, setBarWeight] = React.useState(45);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [rpeDrawer, setRpeDrawer] = React.useState<RpeDrawerTarget | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [summary, setSummary] = React.useState<{
    session: LiftSession;
    durationMs: number;
  } | null>(null);

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const elapsedMs = active ? now - new Date(active.startedAt).getTime() : 0;
  const completedSets = active
    ? active.exercises.reduce(
        (a, e) => a + e.sets.filter((s) => s.completed !== false).length,
        0
      )
    : 0;
  const totalVolume = active
    ? active.exercises.reduce(
        (a, e) =>
          a +
          e.sets
            .filter((s) => s.completed !== false)
            .reduce((v, s) => v + s.weight * s.reps, 0),
        0
      )
    : 0;

  const recentExercises = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = liftSessions.length - 1; i >= 0 && out.length < 6; i--) {
      for (const ex of liftSessions[i].exercises) {
        const key = ex.normalizedName;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(ex.name);
          if (out.length >= 6) break;
        }
      }
    }
    return out;
  }, [liftSessions]);

  const handleFinish = () => {
    if (!active) return;
    const durationMs = now - new Date(active.startedAt).getTime();
    const session = finish();
    if (session) {
      setSummary({ session, durationMs });
      haptic("success");
    } else {
      onClose();
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && active && (
          <motion.div
            key="active-workout-page"
            className="fixed inset-0 z-[60] bg-[var(--color-base)] flex flex-col"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <Header
              workoutType={active.workoutType}
              elapsedMs={elapsedMs}
              canFinish={completedSets > 0}
              onMinimize={onClose}
              onFinish={handleFinish}
            />

            <StatsStrip
              sets={completedSets}
              volume={totalVolume}
              exercises={active.exercises.length}
            />

            <div className="flex-1 overflow-y-auto px-3 pt-3 space-y-3 pb-[180px]">
              {active.exercises.length === 0 ? (
                <EmptyState onAdd={() => setPickerOpen(true)} />
              ) : (
                active.exercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    lastSession={findLastSessionFor(liftSessions, ex.name)}
                    onAddSet={() => {
                      const lastCompleted = [...ex.sets]
                        .reverse()
                        .find((s) => s.completed !== false);
                      const last = lastCompleted ?? ex.sets[ex.sets.length - 1];
                      const hist = findLastSessionFor(liftSessions, ex.name);
                      const seedWeight =
                        last?.weight ?? hist?.topSet?.weight ?? 45;
                      const seedReps = last?.reps ?? hist?.topSet?.reps ?? 8;
                      addSet(ex.name, seedWeight, seedReps, { completed: false });
                      haptic("tap");
                    }}
                    onTapWeight={(order, current) =>
                      setKeypad({
                        exerciseId: ex.id,
                        exerciseName: ex.name,
                        order,
                        field: "weight",
                        initialValue: current,
                      })
                    }
                    onTapReps={(order, current) =>
                      setKeypad({
                        exerciseId: ex.id,
                        exerciseName: ex.name,
                        order,
                        field: "reps",
                        initialValue: current,
                      })
                    }
                    onTapPlate={(weight) => {
                      setPlateOpen({ totalWeight: weight });
                      haptic("soft");
                    }}
                    onToggleComplete={(order) => {
                      toggleComplete(ex.id, order);
                      const set = ex.sets.find((s) => s.order === order);
                      const willComplete = (set?.completed ?? true) === false;
                      haptic(willComplete ? "success" : "soft");
                    }}
                    onRemoveSet={(order) => {
                      removeSet(ex.id, order);
                      haptic("warn");
                    }}
                    onOpenRpeNotes={(order) =>
                      setRpeDrawer({ exerciseId: ex.id, order })
                    }
                    onRemoveExercise={() => {
                      removeExercise(ex.id);
                      haptic("warn");
                    }}
                  />
                ))
              )}

              {active.exercises.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full h-12 rounded-xl border border-dashed border-[var(--color-stroke-strong)] text-[14px] font-medium text-[var(--color-fg-2)] active:scale-[0.99] transition-transform duration-[80ms]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus size={14} />
                    Add exercise
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="w-full mt-2 py-2 text-[11px] uppercase tracking-wider text-[var(--color-fg-3)] active:opacity-60"
              >
                Discard workout
              </button>
            </div>

            <FloatingRestPill
              active={active}
              onChangeRestTarget={(s) => {
                setRestTarget(s);
                haptic("tap");
              }}
              onDismiss={() => {
                dismissRest();
                haptic("soft");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <NumericKeypad
        open={!!keypad}
        onClose={() => setKeypad(null)}
        initialValue={keypad?.initialValue ?? 0}
        mode={keypad?.field === "weight" ? "weight" : "reps"}
        unit={keypad?.field === "weight" ? "lb" : ""}
        title={
          keypad
            ? `${keypad.exerciseName} · Set ${keypad.order} ${keypad.field === "weight" ? "Weight" : "Reps"}`
            : ""
        }
        onCommit={(v) => {
          if (!keypad) return;
          updateSet(keypad.exerciseId, keypad.order, { [keypad.field]: v });
        }}
      />

      <PlateCalculatorPopup
        open={!!plateOpen}
        onClose={() => setPlateOpen(null)}
        totalWeight={plateOpen?.totalWeight ?? 0}
        barWeight={barWeight}
        onChangeBarWeight={setBarWeight}
      />

      <ExerciseLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(name) => {
          addExercise(name);
          haptic("success");
        }}
        recentExercises={recentExercises}
      />

      <RpeNotesDrawer
        target={rpeDrawer}
        active={active}
        onClose={() => setRpeDrawer(null)}
        onCommit={(patch) => {
          if (!rpeDrawer) return;
          updateSet(rpeDrawer.exerciseId, rpeDrawer.order, patch);
        }}
      />

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          cancel();
          haptic("warn");
          setConfirmCancel(false);
          onClose();
        }}
        title="Discard this workout?"
        description="All logged sets will be deleted. Tap Keep going + Finish to save instead."
        confirmLabel="Discard"
      />

      <WorkoutSummary
        open={!!summary}
        onClose={() => {
          setSummary(null);
          onClose();
        }}
        session={summary?.session ?? null}
        durationMs={summary?.durationMs ?? 0}
        history={liftSessions.filter((s) => s.id !== summary?.session.id)}
      />
    </>
  );
}

/* ----------------------------- Header ----------------------------- */

function Header({
  workoutType,
  elapsedMs,
  canFinish,
  onMinimize,
  onFinish,
}: {
  workoutType: string | undefined;
  elapsedMs: number;
  canFinish: boolean;
  onMinimize: () => void;
  onFinish: () => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-stroke)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={onMinimize}
        aria-label="Minimize workout"
        className="h-9 w-9 grid place-items-center rounded-full bg-[var(--color-elevated)] border border-[var(--color-stroke)] active:scale-95 transition-transform duration-[80ms]"
      >
        <ChevronDown size={16} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] font-medium truncate">
          {workoutType || "Workout"}
        </div>
        <div className="text-[18px] font-bold tnum tracking-tight">
          {fmtElapsed(elapsedMs)}
        </div>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onFinish}
        disabled={!canFinish}
        haptic="success"
      >
        Finish
      </Button>
    </header>
  );
}

function StatsStrip({
  sets,
  volume,
  exercises,
}: {
  sets: number;
  volume: number;
  exercises: number;
}) {
  return (
    <div className="grid grid-cols-3 px-4 py-2.5 border-b border-[var(--color-stroke)] bg-[var(--color-card)] text-center">
      <Stat label="Sets" value={String(sets)} />
      <Stat label="Volume" value={formatVolume(volume)} />
      <Stat label="Exercises" value={String(exercises)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="text-[14px] font-semibold tnum">{value}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-stroke-strong)] py-12 text-center">
      <Timer
        size={20}
        className="mx-auto mb-2 text-[var(--color-fg-3)]"
      />
      <div className="text-[13px] text-[var(--color-fg-2)] mb-3">
        Add an exercise to start logging.
      </div>
      <Button variant="secondary" size="sm" onClick={onAdd}>
        <Plus size={13} /> Add exercise
      </Button>
    </div>
  );
}

/* ----------------------------- Exercise card ----------------------------- */

function ExerciseCard({
  exercise,
  lastSession,
  onAddSet,
  onTapWeight,
  onTapReps,
  onTapPlate,
  onToggleComplete,
  onRemoveSet,
  onOpenRpeNotes,
  onRemoveExercise,
}: {
  exercise: LiftExercise;
  lastSession: ExerciseLastSession;
  onAddSet: () => void;
  onTapWeight: (order: number, current: number) => void;
  onTapReps: (order: number, current: number) => void;
  onTapPlate: (totalWeight: number) => void;
  onToggleComplete: (order: number) => void;
  onRemoveSet: (order: number) => void;
  onOpenRpeNotes: (order: number) => void;
  onRemoveExercise: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-card)] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3.5 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-tight truncate">
            {exercise.name}
          </div>
          {lastSession ? (
            <div className="text-[10px] text-[var(--color-fg-3)] tnum truncate mt-0.5">
              Last · {formatDaysAgo(lastSession.daysAgo)} ·{" "}
              {lastSession.sets
                .slice(0, 4)
                .map((s) => `${s.weight > 0 ? s.weight : "BW"}×${s.reps}`)
                .join(", ")}
              {lastSession.sets.length > 4 ? "…" : ""}
            </div>
          ) : (
            <div className="text-[10px] text-[var(--color-fg-3)] mt-0.5">
              First time logging
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Exercise menu"
            className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-90"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-9 z-50 min-w-[160px] rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)] shadow-[var(--shadow-float)] py-1">
                <button
                  type="button"
                  onClick={() => {
                    onRemoveExercise();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-[13px] text-[var(--color-danger)] inline-flex items-center gap-2"
                >
                  <Trash2 size={13} />
                  Remove exercise
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_34px_32px] gap-2 items-center text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] pb-1.5 border-b border-[var(--color-stroke)] mb-1.5">
          <div className="text-center">#</div>
          <div>Prev</div>
          <div>Weight</div>
          <div>Reps</div>
          <div className="text-center">✓</div>
          <div />
        </div>

        <div className="space-y-1">
          {exercise.sets.map((set) => (
            <SetRow
              key={set.order}
              set={set}
              prev={lastSession?.sets.find((s) => s.order === set.order)}
              onTapWeight={() => onTapWeight(set.order, set.weight)}
              onTapReps={() => onTapReps(set.order, set.reps)}
              onTapPlate={() => onTapPlate(set.weight)}
              onToggleComplete={() => onToggleComplete(set.order)}
              onRemove={() => onRemoveSet(set.order)}
              onOpenRpeNotes={() => onOpenRpeNotes(set.order)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onAddSet}
          className="w-full mt-2 h-10 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[13px] font-medium text-[var(--color-fg-2)] active:scale-[0.99] transition-transform duration-[80ms]"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus size={13} />
            Add set
          </span>
        </button>
      </div>
    </motion.div>
  );
}

/* ----------------------------- Set row ----------------------------- */

function SetRow({
  set,
  prev,
  onTapWeight,
  onTapReps,
  onTapPlate,
  onToggleComplete,
  onRemove,
  onOpenRpeNotes,
}: {
  set: LiftSet;
  prev: LiftSet | undefined;
  onTapWeight: () => void;
  onTapReps: () => void;
  onTapPlate: () => void;
  onToggleComplete: () => void;
  onRemove: () => void;
  onOpenRpeNotes: () => void;
}) {
  const completed = set.completed !== false;
  const hasExtras = (set.rpe ?? null) !== null || !!set.notes;

  // Long-press on the row → open RPE/notes drawer. Short tap on the row is a
  // no-op (cells handle their own taps); long-press just gives quick access.
  const pressTimerRef = React.useRef<number | null>(null);
  const longFiredRef = React.useRef(false);
  const startPress = () => {
    longFiredRef.current = false;
    pressTimerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      onOpenRpeNotes();
      haptic("long");
    }, 420);
  };
  const endPress = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const prevLabel = prev
    ? `${prev.weight > 0 ? prev.weight : "BW"}×${prev.reps}`
    : "—";

  return (
    <div
      className={cn(
        "grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_34px_32px] gap-2 items-center",
        "rounded-lg px-1 py-1",
        completed
          ? "bg-[color:color-mix(in_srgb,var(--color-success)_6%,transparent)]"
          : "bg-transparent"
      )}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
    >
      <div className="text-center text-[12px] tnum text-[var(--color-fg-3)] relative">
        {set.order}
        {hasExtras && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
          />
        )}
      </div>

      <div className="text-[11px] tnum text-[var(--color-fg-3)] truncate">
        {prevLabel}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onTapWeight}
          className={cn(
            "flex-1 min-w-0 h-9 rounded-md px-2 text-left tnum text-[15px] font-medium",
            "bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
            "active:scale-[0.97] transition-transform duration-[60ms]",
            completed ? "text-[var(--color-fg)]" : "text-[var(--color-fg-2)]"
          )}
        >
          {set.weight > 0 ? set.weight : "BW"}
        </button>
        {set.weight > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTapPlate();
            }}
            aria-label="Plate calculator"
            className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-90"
          >
            <Calculator size={13} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onTapReps}
        className={cn(
          "h-9 rounded-md px-2 text-left tnum text-[15px] font-medium",
          "bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
          "active:scale-[0.97] transition-transform duration-[60ms]",
          completed ? "text-[var(--color-fg)]" : "text-[var(--color-fg-2)]"
        )}
      >
        {set.reps}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
        aria-label={completed ? "Mark incomplete" : "Mark set complete"}
        className={cn(
          "h-9 w-9 grid place-items-center rounded-md border transition-transform duration-[80ms] active:scale-90",
          completed
            ? "bg-[var(--color-success)] border-[var(--color-success)] text-white"
            : "bg-transparent border-[var(--color-stroke-strong)] text-[var(--color-fg-3)]"
        )}
      >
        <Check size={16} strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove set"
        className="h-9 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-90"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/* ----------------------------- Floating rest pill ----------------------------- */

function FloatingRestPill({
  active,
  onChangeRestTarget,
  onDismiss,
}: {
  active: ActiveWorkoutSession;
  onChangeRestTarget: (seconds: number) => void;
  onDismiss: () => void;
}) {
  const lastSetAt = active.lastSetAt;
  const target = active.restTargetSeconds ?? DEFAULT_REST_SECONDS;
  const dismissed = !!active.restDismissedAt;

  const [now, setNow] = React.useState(() => Date.now());
  const firedZeroRef = React.useRef(false);

  React.useEffect(() => {
    if (!lastSetAt || dismissed) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [lastSetAt, dismissed]);

  if (!lastSetAt || dismissed) return null;

  const elapsed = Math.max(
    0,
    Math.floor((now - new Date(lastSetAt).getTime()) / 1000)
  );
  const remaining = Math.max(0, target - elapsed);
  const isDone = remaining === 0;
  const pct = target > 0 ? Math.min(1, elapsed / target) : 1;

  if (isDone && !firedZeroRef.current) {
    firedZeroRef.current = true;
    haptic("success");
  }
  if (!isDone) {
    firedZeroRef.current = false;
  }

  // Auto-dismiss 30s after timer hits zero so it doesn't stay forever.
  if (isDone && elapsed > target + 30) {
    setTimeout(onDismiss, 0);
  }

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
      className="fixed inset-x-3 z-[65]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border shadow-[var(--shadow-float)] backdrop-blur",
          isDone
            ? "border-[color:color-mix(in_srgb,var(--color-success)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--color-success)_18%,var(--color-card))]"
            : "border-[var(--color-stroke-strong)] bg-[color:color-mix(in_srgb,var(--color-card)_92%,transparent)]"
        )}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct * 100}%`,
            background: isDone
              ? "color-mix(in srgb, var(--color-success) 26%, transparent)"
              : "color-mix(in srgb, var(--color-accent) 16%, transparent)",
            transition: "width 240ms linear",
          }}
        />
        <div className="relative flex items-center gap-2 px-3 py-2.5">
          <div className="h-9 w-9 grid place-items-center rounded-full bg-[var(--color-card)] border border-[var(--color-stroke)]">
            <Timer
              size={15}
              className={
                isDone
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-accent)]"
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
              {isDone ? "Rest done" : "Resting"}
            </div>
            <div className="text-[16px] font-semibold tnum">
              {fmtClock(isDone ? elapsed : remaining)}
              <span className="text-[11px] text-[var(--color-fg-3)] tnum font-normal ml-1.5">
                {isDone ? "+ overtime" : `of ${fmtClock(target)}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {REST_QUICK_DELTAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeRestTarget(Math.max(15, target + d))}
                className="h-8 px-2 rounded-md bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[12px] tnum text-[var(--color-fg-2)] active:scale-95"
              >
                {d > 0 ? "+" : ""}
                {d}s
              </button>
            ))}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Skip rest"
              className="h-8 w-8 grid place-items-center rounded-md bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)] active:scale-90"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------- RPE / notes drawer ----------------------------- */

function RpeNotesDrawer({
  target,
  active,
  onClose,
  onCommit,
}: {
  target: RpeDrawerTarget | null;
  active: ActiveWorkoutSession | null;
  onClose: () => void;
  onCommit: (patch: Partial<LiftSet>) => void;
}) {
  const set = React.useMemo(() => {
    if (!target || !active) return null;
    const ex = active.exercises.find((e) => e.id === target.exerciseId);
    return ex?.sets.find((s) => s.order === target.order) ?? null;
  }, [target, active]);

  const [rpe, setRpe] = React.useState<number>(7);
  const [notes, setNotes] = React.useState<string>("");

  React.useEffect(() => {
    if (!target || !set) return;
    setRpe(set.rpe ?? 7);
    setNotes(set.notes ?? "");
  }, [target, set]);

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="RPE & notes"
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onCommit({ rpe: undefined, notes: undefined });
              haptic("warn");
              onClose();
            }}
          >
            Clear
          </Button>
          <Button
            onClick={() => {
              onCommit({
                rpe,
                notes: notes.trim() || undefined,
              });
              haptic("success");
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="label">RPE</div>
            <div className="text-[15px] font-semibold tnum">{rpe}</div>
          </div>
          <Slider
            value={rpe}
            min={1}
            max={10}
            step={0.5}
            onChange={(v) => setRpe(v)}
          />
          <div className="flex justify-between text-[9px] text-[var(--color-fg-3)] mt-1 tnum">
            <span>1 easy</span>
            <span>5</span>
            <span>10 max</span>
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Notes</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Form cue, equipment swap, PR attempt…"
          />
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------- Helpers ----------------------------- */

function fmtElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatVolume(v: number): string {
  if (v <= 0) return "0";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}
