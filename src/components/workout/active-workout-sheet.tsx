"use client";

import * as React from "react";
import {
  Square,
  X,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Timer,
  Check,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  findLastSessionFor,
  formatDaysAgo,
  formatSetsCompact,
} from "@/lib/workout-history";

/**
 * RepCount-style live workout sheet.
 *
 * Top: workout title + elapsed timer + Finish.
 * Middle: a tabbed exercise selector (prev/next chevrons + name dropdown).
 *         Per-exercise: "last time" chip, today's logged sets list,
 *         big +/- number steppers for weight + reps, "Add set" CTA.
 * Bottom: auto rest timer countdown after each set, dismissible.
 *
 * Designed for tap-only operation — the only keyboard pop you'll ever
 * trigger is renaming an exercise or adding a brand-new one. Everything
 * else is steppers + chip taps.
 */

const REST_PRESETS_SECONDS = [60, 90, 120, 180] as const;
const DEFAULT_REST_SECONDS = 120;

export function ActiveWorkoutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useStore((s) => s.activeWorkout);
  const liftSessions = useStore((s) => s.liftSessions);
  const addSet = useStore((s) => s.addActiveWorkoutSet);
  const removeSet = useStore((s) => s.removeActiveWorkoutSet);
  const removeExercise = useStore((s) => s.removeActiveWorkoutExercise);
  const setFocus = useStore((s) => s.setActiveWorkoutFocus);
  const setRestTarget = useStore((s) => s.setActiveWorkoutRestTarget);
  const dismissRest = useStore((s) => s.dismissActiveWorkoutRest);
  const finish = useStore((s) => s.finishActiveWorkout);
  const cancel = useStore((s) => s.cancelActiveWorkout);

  const [weight, setWeight] = React.useState(0);
  const [reps, setReps] = React.useState(0);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newExerciseName, setNewExerciseName] = React.useState("");

  // Pick the focused exercise (or the last one if no explicit focus).
  const focused = React.useMemo(() => {
    if (!active) return null;
    if (active.focusedExerciseId) {
      const found = active.exercises.find((e) => e.id === active.focusedExerciseId);
      if (found) return found;
    }
    return active.exercises[active.exercises.length - 1] ?? null;
  }, [active]);

  // When the focused exercise changes, prefill the steppers with the last set
  // values for that exercise, or the last historical session's top set.
  React.useEffect(() => {
    if (!focused) return;
    const last = focused.sets[focused.sets.length - 1];
    if (last) {
      setWeight(last.weight);
      setReps(last.reps);
      return;
    }
    const history = findLastSessionFor(liftSessions, focused.name);
    if (history?.topSet) {
      setWeight(history.topSet.weight);
      setReps(history.topSet.reps);
    } else {
      setWeight(45);
      setReps(8);
    }
  }, [focused?.id, focused?.name, focused?.sets.length, liftSessions, focused]);

  if (!active) return null;

  const focusedIndex = active.exercises.findIndex((e) => e.id === focused?.id);
  const restTarget = active.restTargetSeconds ?? DEFAULT_REST_SECONDS;
  const elapsedMs = Date.now() - new Date(active.startedAt).getTime();

  const handleAdd = () => {
    if (!focused) return;
    if (reps <= 0) return;
    addSet(focused.name, weight, reps);
    haptic("success");
  };

  const handleRepeatLastSet = () => {
    if (!focused) return;
    const last = focused.sets[focused.sets.length - 1];
    if (!last) return;
    addSet(focused.name, last.weight, last.reps);
    haptic("soft");
  };

  const handleAddNewExercise = () => {
    const name = newExerciseName.trim();
    if (!name) return;
    addSet(name, weight || 45, reps || 8);
    setNewExerciseName("");
    setAdding(false);
    haptic("success");
  };

  const totalVolume = active.exercises.reduce(
    (acc, e) => acc + e.sets.reduce((a, s) => a + s.weight * s.reps, 0),
    0
  );
  const totalSets = active.exercises.reduce((acc, e) => acc + e.sets.length, 0);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={active.workoutType || "Workout"}
        description={`${fmtElapsed(elapsedMs)} · ${totalSets} set${totalSets === 1 ? "" : "s"} · ${totalVolume.toLocaleString()} lb total`}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmCancel(true)}
            >
              <X size={12} />
              Discard
            </Button>
            <Button
              variant="primary"
              size="default"
              onClick={() => {
                finish();
                haptic("success");
                onClose();
              }}
              disabled={totalSets === 0}
              haptic="success"
            >
              <Square size={14} />
              Finish
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Rest timer banner */}
          {active.lastSetAt && !active.restDismissedAt && (
            <RestTimerBanner
              lastSetAt={active.lastSetAt}
              targetSeconds={restTarget}
              presets={REST_PRESETS_SECONDS}
              onChangeTarget={(s) => setRestTarget(s)}
              onDismiss={dismissRest}
            />
          )}

          {/* Exercise switcher */}
          <ExerciseSwitcher
            active={active}
            focusedIndex={focusedIndex}
            onPrev={() => {
              if (focusedIndex > 0) {
                setFocus(active.exercises[focusedIndex - 1].id);
                haptic("soft");
              }
            }}
            onNext={() => {
              if (focusedIndex < active.exercises.length - 1) {
                setFocus(active.exercises[focusedIndex + 1].id);
                haptic("soft");
              }
            }}
            onPickById={(id) => {
              setFocus(id);
              haptic("soft");
            }}
            onStartAdding={() => setAdding(true)}
          />

          {/* New-exercise input (only when adding) */}
          {adding && (
            <div className="rounded-xl border border-[var(--color-accent)] bg-[var(--color-elevated)]/40 p-3 space-y-2">
              <div className="label">New exercise</div>
              <Input
                autoFocus
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                placeholder="e.g. Cable row"
                autoCapitalize="words"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddNewExercise();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewExerciseName("");
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setNewExerciseName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddNewExercise}
                  disabled={!newExerciseName.trim()}
                >
                  <Check size={12} />
                  Add + log set
                </Button>
              </div>
            </div>
          )}

          {/* Focused exercise panel */}
          {focused && !adding && (
            <FocusedExercisePanel
              exercise={focused}
              lastSession={findLastSessionFor(liftSessions, focused.name)}
              weight={weight}
              reps={reps}
              onWeightChange={setWeight}
              onRepsChange={setReps}
              onAddSet={handleAdd}
              onRepeatLast={handleRepeatLastSet}
              onRemoveSet={(order) => {
                removeSet(focused.id, order);
                haptic("warn");
              }}
              onRemoveExercise={() => {
                removeExercise(focused.id);
                haptic("warn");
              }}
            />
          )}

          {/* Empty state */}
          {!focused && !adding && (
            <div className="rounded-xl border border-dashed border-[var(--color-stroke-strong)] p-6 text-center">
              <Timer size={20} className="mx-auto mb-2 text-[var(--color-fg-3)]" />
              <div className="text-[13px] text-[var(--color-fg-2)]">
                No exercises yet — tap "+ Exercise" to add your first.
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Discard this workout?"
        description="The session and all logged sets will be deleted."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep going
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                cancel();
                haptic("warn");
                setConfirmCancel(false);
                onClose();
              }}
            >
              <X size={14} />
              Discard
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-[var(--color-fg-2)]">
          To save this workout instead, tap "Keep going" and then "Finish."
        </p>
      </Modal>
    </>
  );
}

function ExerciseSwitcher({
  active,
  focusedIndex,
  onPrev,
  onNext,
  onPickById,
  onStartAdding,
}: {
  active: NonNullable<ReturnType<typeof useStore.getState>["activeWorkout"]>;
  focusedIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onPickById: (id: string) => void;
  onStartAdding: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous exercise"
          onClick={onPrev}
          disabled={focusedIndex <= 0}
          className="h-9 w-9 grid place-items-center rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] disabled:opacity-30 active:scale-95"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0 flex items-center justify-center text-center px-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
              Exercise {Math.max(0, focusedIndex) + 1} / {active.exercises.length || 1}
            </div>
            <div className="text-[17px] font-semibold tracking-tight truncate">
              {active.exercises[focusedIndex]?.name ?? "—"}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Next exercise"
          onClick={onNext}
          disabled={focusedIndex >= active.exercises.length - 1}
          className="h-9 w-9 grid place-items-center rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] disabled:opacity-30 active:scale-95"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Horizontal chip strip of all exercises */}
      <div className="-mx-5 px-5 overflow-x-auto hide-scroll">
        <div className="flex items-center gap-1.5 min-w-min">
          {active.exercises.map((e, i) => {
            const sets = e.sets.length;
            const isFocused = i === focusedIndex;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onPickById(e.id)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-full text-[12px] tnum",
                  "border transition-colors duration-100",
                  isFocused
                    ? "bg-[var(--color-accent-strong)] text-white border-transparent"
                    : "bg-[var(--color-elevated)] text-[var(--color-fg-2)] border-[var(--color-stroke)]"
                )}
              >
                {e.name}
                {sets > 0 && (
                  <span className={cn("ml-1.5", isFocused ? "opacity-80" : "opacity-60")}>
                    {sets}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onStartAdding}
            className={cn(
              "shrink-0 px-2.5 py-1 rounded-full text-[12px]",
              "border border-dashed border-[var(--color-stroke-strong)]",
              "text-[var(--color-fg-2)] active:scale-95"
            )}
          >
            + Exercise
          </button>
        </div>
      </div>
    </div>
  );
}

function FocusedExercisePanel({
  exercise,
  lastSession,
  weight,
  reps,
  onWeightChange,
  onRepsChange,
  onAddSet,
  onRepeatLast,
  onRemoveSet,
  onRemoveExercise,
}: {
  exercise: { id: string; name: string; sets: { weight: number; reps: number; order: number }[] };
  lastSession: ReturnType<typeof findLastSessionFor>;
  weight: number;
  reps: number;
  onWeightChange: (n: number) => void;
  onRepsChange: (n: number) => void;
  onAddSet: () => void;
  onRepeatLast: () => void;
  onRemoveSet: (order: number) => void;
  onRemoveExercise: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Last-time chip */}
      {lastSession ? (
        <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-0.5">
            Last time · {formatDaysAgo(lastSession.daysAgo)}
          </div>
          <div className="text-[13px] text-[var(--color-fg)] tnum">
            {formatSetsCompact(lastSession.sets)}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/30 px-3 py-2">
          <div className="text-[12px] text-[var(--color-fg-3)]">
            First time logging this — set your starting weight + reps below.
          </div>
        </div>
      )}

      {/* Today's sets */}
      {exercise.sets.length > 0 ? (
        <div className="space-y-1">
          {exercise.sets.map((s) => (
            <div
              key={s.order}
              className="flex items-center justify-between rounded-lg bg-[var(--color-elevated)]/40 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-fg-3)] text-[12px] tnum w-6">
                  #{s.order}
                </span>
                <span className="text-[15px] tnum">
                  {s.weight > 0 ? `${s.weight} lb` : "BW"} ×{" "}
                  <span className="font-semibold">{s.reps}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveSet(s.order)}
                aria-label="Remove set"
                className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-95"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-[12px] text-[var(--color-fg-3)] py-2">
          No sets logged for this exercise yet.
        </div>
      )}

      {/* Stepper pad */}
      <div className="rounded-2xl border border-[var(--color-stroke-strong)] bg-[var(--color-elevated)]/40 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberStepper
            value={weight}
            onChange={onWeightChange}
            step={5}
            min={0}
            max={1500}
            unit="lb"
            label="Weight"
            accentColor="var(--color-accent)"
          />
          <NumberStepper
            value={reps}
            onChange={onRepsChange}
            step={1}
            min={0}
            max={100}
            unit="reps"
            label="Reps"
            accentColor="var(--color-accent)"
          />
        </div>

        <Button onClick={onAddSet} disabled={reps <= 0} className="w-full" size="lg" haptic="success">
          <Check size={16} />
          Add set
        </Button>

        {exercise.sets.length > 0 && (
          <button
            type="button"
            onClick={onRepeatLast}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-[var(--color-stroke)] text-[12px] text-[var(--color-fg-2)] active:scale-[0.99]"
          >
            <RotateCcw size={11} />
            Repeat last set
          </button>
        )}
      </div>

      {/* Remove exercise (subtle) */}
      <button
        type="button"
        onClick={onRemoveExercise}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-[var(--color-fg-3)] active:opacity-70"
      >
        <Trash2 size={11} />
        Remove "{exercise.name}" from this workout
      </button>
    </div>
  );
}

function RestTimerBanner({
  lastSetAt,
  targetSeconds,
  presets,
  onChangeTarget,
  onDismiss,
}: {
  lastSetAt: string;
  targetSeconds: number;
  presets: readonly number[];
  onChangeTarget: (s: number) => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  const firedZeroRef = React.useRef(false);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSeconds = Math.floor((now - new Date(lastSetAt).getTime()) / 1000);
  const remaining = Math.max(0, targetSeconds - elapsedSeconds);
  const pct = targetSeconds > 0 ? Math.min(1, elapsedSeconds / targetSeconds) : 1;
  const isDone = remaining === 0 && elapsedSeconds > 0;

  // Fire one haptic + auto-dismiss when the timer hits zero.
  React.useEffect(() => {
    if (isDone && !firedZeroRef.current) {
      firedZeroRef.current = true;
      haptic("success");
    }
  }, [isDone]);

  // After 30 seconds of "rest done" the banner auto-clears so it doesn't
  // hang around if the user got distracted.
  const autoDismissed = isDone && elapsedSeconds > targetSeconds + 30;
  React.useEffect(() => {
    if (autoDismissed) onDismiss();
  }, [autoDismissed, onDismiss]);

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 relative overflow-hidden",
        isDone
          ? "border-[color:color-mix(in_srgb,var(--color-success)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--color-success)_8%,var(--color-card))]"
          : "border-[var(--color-stroke-strong)] bg-[var(--color-elevated)]/40"
      )}
    >
      {/* Progress fill behind content */}
      <div
        className="absolute inset-y-0 left-0 -z-0"
        style={{
          width: `${pct * 100}%`,
          background: isDone
            ? "color-mix(in srgb, var(--color-success) 14%, transparent)"
            : "color-mix(in srgb, var(--color-accent) 10%, transparent)",
          transition: "width 240ms linear",
        }}
      />
      <div className="relative flex items-center gap-3">
        <Timer
          size={18}
          className={isDone ? "text-[var(--color-success)]" : "text-[var(--color-accent)]"}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
            {isDone ? "Rested" : "Rest"}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-[18px] font-semibold tnum">
              {fmtClock(isDone ? elapsedSeconds : remaining)}
            </span>
            <span className="text-[11px] text-[var(--color-fg-3)] tnum">
              {isDone ? "+ overtime" : `of ${fmtClock(targetSeconds)}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {presets.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChangeTarget(s);
                haptic("tap");
              }}
              className={cn(
                "h-7 px-2 rounded-md text-[11px] tnum",
                s === targetSeconds
                  ? "bg-[var(--color-accent-strong)] text-white"
                  : "bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)]"
              )}
            >
              {s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? `${s % 60}` : ""}` : `${s}s`}
            </button>
          ))}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss rest"
            className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-95"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

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
