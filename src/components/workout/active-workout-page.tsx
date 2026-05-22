"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Link2Off,
  Mic,
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
import { computeReadiness } from "@/lib/readiness";
import { todayStr } from "@/lib/date";
import { LiveActivity } from "@/lib/native/live-activity";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { NumericKeypad } from "@/components/workout/numeric-keypad";
import { PlateCalculatorPopup } from "@/components/workout/plate-calculator-popup";
import { ExerciseLibraryPicker } from "@/components/workout/exercise-library-picker";
import { WorkoutSummary } from "@/components/workout/workout-summary";
import { VoiceLoggerModal } from "@/components/workout/voice-logger-modal";

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
  const customCatalog = useStore((s) => s.customExerciseCatalog);
  const addExercise = useStore((s) => s.addActiveWorkoutExercise);
  const removeExercise = useStore((s) => s.removeActiveWorkoutExercise);
  const addSet = useStore((s) => s.addActiveWorkoutSet);
  const removeSet = useStore((s) => s.removeActiveWorkoutSet);
  const updateSet = useStore((s) => s.updateActiveWorkoutSet);
  const toggleComplete = useStore((s) => s.toggleActiveWorkoutSetComplete);
  const toggleSuperset = useStore((s) => s.toggleActiveWorkoutSuperset);
  const breakSuperset = useStore((s) => s.breakActiveWorkoutSuperset);
  const copySetAcrossSuperset = useStore((s) => s.copySetAcrossSuperset);
  const setRestTarget = useStore((s) => s.setActiveWorkoutRestTarget);
  const dismissRest = useStore((s) => s.dismissActiveWorkoutRest);
  const finish = useStore((s) => s.finishActiveWorkout);
  const cancel = useStore((s) => s.cancelActiveWorkout);

  const [keypad, setKeypad] = React.useState<KeypadTarget | null>(null);
  const [plateOpen, setPlateOpen] = React.useState<{ totalWeight: number } | null>(null);
  const [barWeight, setBarWeight] = React.useState(45);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);
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

  // Live Activity lifecycle — start when a session appears, update on
  // every set / rest-target change, end when the session clears.
  const liveStartedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!active) {
      if (liveStartedRef.current) {
        void LiveActivity.end();
        liveStartedRef.current = null;
      }
      return;
    }
    if (liveStartedRef.current !== active.id) {
      void LiveActivity.start({
        workoutType: active.workoutType ?? "Workout",
        startedAt: new Date(active.startedAt).getTime(),
      });
      liveStartedRef.current = active.id;
    }
    const lastEx = [...active.exercises].reverse().find((e) => e.sets.length > 0);
    const lastSet = lastEx?.sets[lastEx.sets.length - 1];
    const totalVolume = active.exercises.reduce(
      (a, e) =>
        a +
        e.sets
          .filter((s) => s.completed !== false)
          .reduce((v, s) => v + s.weight * s.reps, 0),
      0
    );
    void LiveActivity.update({
      setsCompleted: completedSets,
      totalVolume,
      lastExerciseName: lastEx?.name ?? null,
      lastSetSummary: lastSet
        ? `${lastSet.weight > 0 ? lastSet.weight : "BW"} × ${lastSet.reps}`
        : null,
      restEndsAt:
        active.lastSetAt && active.restTargetSeconds && !active.restDismissedAt
          ? new Date(active.lastSetAt).getTime() + active.restTargetSeconds * 1000
          : null,
    });
  }, [active, completedSets]);
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

  const handleFinish = async () => {
    if (!active) return;
    const durationMs = now - new Date(active.startedAt).getTime();
    const session = (await finish()) as LiftSession | null;
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
              onOpenVoice={() => {
                setVoiceOpen(true);
                haptic("tap");
              }}
            />

            <ReadinessChip />

            <StatsStrip
              sets={completedSets}
              volume={totalVolume}
              exercises={active.exercises.length}
            />

            <div className="flex-1 overflow-y-auto px-3 pt-3 space-y-3 pb-[180px]">
              {active.exercises.length === 0 ? (
                <EmptyState onAdd={() => setPickerOpen(true)} />
              ) : (
                computeRenderGroups(active.exercises).map((group) => {
                  const renderCard = (
                    ex: LiftExercise,
                    opts: {
                      variant: "standalone" | "in-superset";
                      supersetLetter?: string;
                      indexInGroup?: number;
                      isLastInGroup?: boolean;
                    }
                  ) => {
                    const arr = active.exercises;
                    const idx = arr.findIndex((e) => e.id === ex.id);
                    const prev = idx > 0 ? arr[idx - 1] : undefined;
                    const next = idx < arr.length - 1 ? arr[idx + 1] : undefined;
                    return (
                      <ExerciseCard
                        key={ex.id}
                        exercise={ex}
                        lastSession={findLastSessionFor(liftSessions, ex.name)}
                        variant={opts.variant}
                        supersetLetter={opts.supersetLetter}
                        indexInGroup={opts.indexInGroup}
                        isLastInGroup={opts.isLastInGroup}
                        prevExercise={prev}
                        nextExercise={next}
                        onAddSet={(isDrop) => {
                          const completed = ex.sets.filter(
                            (s) => s.completed !== false
                          );
                          const lastCompleted = completed[completed.length - 1];
                          const last = lastCompleted ?? ex.sets[ex.sets.length - 1];
                          const hist = findLastSessionFor(liftSessions, ex.name);
                          let seedWeight =
                            last?.weight ?? hist?.topSet?.weight ?? 45;
                          const seedReps = last?.reps ?? hist?.topSet?.reps ?? 8;
                          if (isDrop && seedWeight > 0) {
                            seedWeight = Math.round((seedWeight * 0.8) / 5) * 5;
                          }
                          addSet(ex.name, seedWeight, seedReps, {
                            completed: false,
                          });
                          if (isDrop) {
                            const targetOrder = ex.sets.length + 1;
                            window.setTimeout(() => {
                              updateSet(ex.id, targetOrder, { isDropSet: true });
                            }, 0);
                          }
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
                        onSupersetWith={(direction) => {
                          const other = direction === "up" ? prev : next;
                          if (!other) return;
                          toggleSuperset(ex.id, other.id);
                          haptic("soft");
                        }}
                        onBreakSuperset={() => {
                          breakSuperset(ex.id);
                          haptic("soft");
                        }}
                        onCopySetAcrossSuperset={
                          ex.supersetGroupId
                            ? (order) => {
                                copySetAcrossSuperset(ex.id, order);
                                haptic("success");
                              }
                            : undefined
                        }
                      />
                    );
                  };

                  if (group.type === "single") {
                    return renderCard(group.exercise, { variant: "standalone" });
                  }
                  return (
                    <SupersetBlock
                      key={group.groupId}
                      letter={group.letter}
                      memberCount={group.exercises.length}
                    >
                      {group.exercises.map((ex, i) =>
                        renderCard(ex, {
                          variant: "in-superset",
                          supersetLetter: group.letter,
                          indexInGroup: i + 1,
                          isLastInGroup: i === group.exercises.length - 1,
                        })
                      )}
                    </SupersetBlock>
                  );
                })
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
        customCatalog={customCatalog}
      />

      <VoiceLoggerModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        knownExercises={active?.exercises.map((e) => e.name) ?? []}
        onCommitSet={(s) => {
          addSet(s.exerciseName, s.weight, s.reps, { completed: true });
          if (s.rpe != null) {
            const ex = active?.exercises.find(
              (e) => e.normalizedName === s.exerciseName.trim().toLowerCase()
            );
            if (ex) {
              const order =
                (active?.exercises.find((e) => e.id === ex.id)?.sets.length ??
                  0) + 1;
              window.setTimeout(() => {
                updateSet(ex.id, order, { rpe: s.rpe });
              }, 0);
            }
          }
        }}
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
  onOpenVoice,
}: {
  workoutType: string | undefined;
  elapsedMs: number;
  canFinish: boolean;
  onMinimize: () => void;
  onFinish: () => void;
  onOpenVoice: () => void;
}) {
  return (
    <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-stroke)] bg-[var(--color-card)]">
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
      <button
        type="button"
        onClick={onOpenVoice}
        aria-label="Voice log a set"
        className="h-9 w-9 grid place-items-center rounded-full bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)] active:scale-95 transition-transform duration-[80ms]"
      >
        <Mic size={16} />
      </button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          haptic("success");
          onFinish();
        }}
        disabled={!canFinish}
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

type ExerciseCardVariant = "standalone" | "in-superset";

function ExerciseCard({
  exercise,
  lastSession,
  variant,
  supersetLetter,
  indexInGroup,
  isLastInGroup,
  prevExercise,
  nextExercise,
  onAddSet,
  onTapWeight,
  onTapReps,
  onTapPlate,
  onToggleComplete,
  onRemoveSet,
  onOpenRpeNotes,
  onRemoveExercise,
  onSupersetWith,
  onBreakSuperset,
  onCopySetAcrossSuperset,
}: {
  exercise: LiftExercise;
  lastSession: ExerciseLastSession;
  variant: ExerciseCardVariant;
  supersetLetter?: string;
  indexInGroup?: number;
  isLastInGroup?: boolean;
  prevExercise: LiftExercise | undefined;
  nextExercise: LiftExercise | undefined;
  onAddSet: (isDrop: boolean) => void;
  onTapWeight: (order: number, current: number) => void;
  onTapReps: (order: number, current: number) => void;
  onTapPlate: (totalWeight: number) => void;
  onToggleComplete: (order: number) => void;
  onRemoveSet: (order: number) => void;
  onOpenRpeNotes: (order: number) => void;
  onRemoveExercise: () => void;
  onSupersetWith: (direction: "up" | "down") => void;
  onBreakSuperset: () => void;
  /** Defined only when this exercise is in a superset group with ≥1 sibling.
   *  Caller is the active-workout-page; the row uses it to power the
   *  swipe-right-to-copy gesture. */
  onCopySetAcrossSuperset?: (order: number) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const detailHref = `/gym/exercise/${encodeURIComponent(exercise.name)}`;

  const inSuperset = variant === "in-superset";
  // Hide only when the neighbor is already in *this* exercise's group.
  // Both-undefined means "neither is grouped yet" — that's the most common
  // case for creating a new superset, and must be allowed.
  const alreadyGroupedWith = (other: LiftExercise | undefined) =>
    !!other &&
    !!exercise.supersetGroupId &&
    other.supersetGroupId === exercise.supersetGroupId;
  const canSupersetUp = !!prevExercise && !alreadyGroupedWith(prevExercise);
  const canSupersetDown = !!nextExercise && !alreadyGroupedWith(nextExercise);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "overflow-hidden relative",
        inSuperset
          ? cn(
              "bg-transparent",
              !isLastInGroup &&
                "border-b border-[color:color-mix(in_srgb,var(--pillar-strain)_24%,var(--color-stroke))]"
            )
          : "rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-card)]"
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-3">
        {inSuperset && supersetLetter && indexInGroup != null && (
          <span
            className="shrink-0 h-7 min-w-[28px] px-1.5 grid place-items-center rounded-md text-[11px] font-bold tnum text-white"
            style={{ background: "var(--pillar-strain)" }}
          >
            {supersetLetter}
            {indexInGroup}
          </span>
        )}
        <Link
          href={detailHref}
          onClick={() => haptic("tap")}
          className="flex-1 min-w-0 -m-1 p-1 rounded-md active:bg-[var(--color-elevated)] active:scale-[0.99] transition-transform duration-[80ms]"
        >
          <div className="flex items-center gap-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-tight truncate flex-1 min-w-0">
              {exercise.name}
            </div>
            <ChevronRight
              size={13}
              className="text-[var(--color-fg-3)] shrink-0"
            />
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
        </Link>
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
              <div className="absolute right-0 top-9 z-50 min-w-[200px] rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)] shadow-[var(--shadow-float)] py-1">
                {canSupersetUp && (
                  <button
                    type="button"
                    onClick={() => {
                      onSupersetWith("up");
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-[13px] text-[var(--color-fg)] inline-flex items-center gap-2"
                  >
                    <ArrowUpToLine size={13} />
                    Superset with above
                  </button>
                )}
                {canSupersetDown && (
                  <button
                    type="button"
                    onClick={() => {
                      onSupersetWith("down");
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-[13px] text-[var(--color-fg)] inline-flex items-center gap-2"
                  >
                    <ArrowDownToLine size={13} />
                    Superset with below
                  </button>
                )}
                {inSuperset && (
                  <button
                    type="button"
                    onClick={() => {
                      onBreakSuperset();
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-[13px] text-[var(--color-fg)] inline-flex items-center gap-2"
                  >
                    <Link2Off size={13} />
                    Break superset
                  </button>
                )}
                {(canSupersetUp || canSupersetDown || inSuperset) && (
                  <div className="h-px bg-[var(--color-stroke)] my-1" />
                )}
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
          {(() => {
            const depths = computeDropDepths(exercise.sets);
            return exercise.sets.map((set, i) => (
              <SetRow
                key={set.order}
                set={set}
                dropDepth={depths[i]}
                prev={lastSession?.sets.find((s) => s.order === set.order)}
                onTapWeight={() => onTapWeight(set.order, set.weight)}
                onTapReps={() => onTapReps(set.order, set.reps)}
                onTapPlate={() => onTapPlate(set.weight)}
                onToggleComplete={() => onToggleComplete(set.order)}
                onRemove={() => onRemoveSet(set.order)}
                onOpenRpeNotes={() => onOpenRpeNotes(set.order)}
                onCopyAcross={
                  onCopySetAcrossSuperset
                    ? () => onCopySetAcrossSuperset(set.order)
                    : undefined
                }
              />
            ));
          })()}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
          <button
            type="button"
            onClick={() => onAddSet(false)}
            className="h-10 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[13px] font-medium text-[var(--color-fg-2)] active:scale-[0.99] transition-transform duration-[80ms]"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus size={13} />
              Add set
            </span>
          </button>
          {exercise.sets.length > 0 && (
            <button
              type="button"
              onClick={() => onAddSet(true)}
              aria-label="Add drop set"
              className="h-10 px-3 rounded-lg border border-dashed border-[color:color-mix(in_srgb,var(--color-warning)_45%,transparent)] text-[12px] font-medium text-[var(--color-warning)] active:scale-[0.99] transition-transform duration-[80ms]"
            >
              <span className="inline-flex items-center gap-1">
                <Plus size={11} />
                Drop
              </span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------- Set row ----------------------------- */

function SetRow({
  set,
  prev,
  dropDepth,
  onTapWeight,
  onTapReps,
  onTapPlate,
  onToggleComplete,
  onRemove,
  onOpenRpeNotes,
  onCopyAcross,
}: {
  set: LiftSet;
  prev: LiftSet | undefined;
  dropDepth: number;
  onTapWeight: () => void;
  onTapReps: () => void;
  onTapPlate: () => void;
  onToggleComplete: () => void;
  onRemove: () => void;
  onOpenRpeNotes: () => void;
  /** RepCount-style: when this set is in a superset, swiping the row right
   *  copies its weight + reps to every sibling exercise at the same set
   *  order. undefined → drag is disabled. */
  onCopyAcross?: () => void;
}) {
  const completed = set.completed !== false;
  const hasExtras = (set.rpe ?? null) !== null || !!set.notes;
  const dragX = useMotionValue(0);
  const swipeProgress = useTransform(dragX, [0, 90], [0, 1]);
  const canSwipe = !!onCopyAcross && set.weight > 0 && set.reps > 0;

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

  const isDrop = !!set.isDropSet && dropDepth > 0;

  return (
    <div className="relative">
      {canSwipe && (
        <motion.div
          aria-hidden
          className="absolute inset-y-1 left-2 flex items-center pl-1 pr-3 rounded-md"
          style={{
            opacity: swipeProgress,
            background:
              "color-mix(in srgb, var(--color-accent) 22%, transparent)",
          }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Copy →
          </span>
        </motion.div>
      )}
    <motion.div
      drag={canSwipe ? "x" : false}
      dragConstraints={{ left: 0, right: 110 }}
      dragElastic={0.15}
      dragSnapToOrigin
      style={{
        x: dragX,
        touchAction: canSwipe ? "pan-y" : undefined,
        marginLeft: isDrop ? "12px" : undefined,
      }}
      onDragEnd={(_, info) => {
        if (canSwipe && info.offset.x > 70 && onCopyAcross) {
          onCopyAcross();
        }
      }}
      className={cn(
        "grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_34px_32px] gap-2 items-center",
        "rounded-lg px-1 py-1 relative",
        isDrop
          ? completed
            ? "bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]"
            : "bg-[color:color-mix(in_srgb,var(--color-warning)_5%,transparent)]"
          : completed
            ? "bg-[color:color-mix(in_srgb,var(--color-success)_6%,transparent)]"
            : "bg-transparent"
      )}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
    >
      {isDrop && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-warning) 60%, transparent)" }}
        />
      )}
      <div className="text-center text-[11px] tnum text-[var(--color-fg-3)] relative">
        {isDrop ? (
          <span
            className="text-[9px] uppercase tracking-wider font-bold"
            style={{ color: "var(--color-warning)" }}
          >
            D{dropDepth}
          </span>
        ) : (
          set.order
        )}
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
    </motion.div>
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

/* ----------------------------- Superset wrapper + grouping ----------------------------- */

type RenderGroup =
  | { type: "single"; exercise: LiftExercise }
  | { type: "superset"; groupId: string; letter: string; exercises: LiftExercise[] };

function computeRenderGroups(exercises: LiftExercise[]): RenderGroup[] {
  const out: RenderGroup[] = [];
  let letterCode = "A".charCodeAt(0);
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.supersetGroupId) {
      const members: LiftExercise[] = [];
      let j = i;
      while (
        j < exercises.length &&
        exercises[j].supersetGroupId === ex.supersetGroupId
      ) {
        members.push(exercises[j]);
        j++;
      }
      out.push({
        type: "superset",
        groupId: ex.supersetGroupId,
        letter: String.fromCharCode(letterCode++),
        exercises: members,
      });
      i = j;
    } else {
      out.push({ type: "single", exercise: ex });
      i++;
    }
  }
  return out;
}

function SupersetBlock({
  letter,
  memberCount,
  children,
}: {
  letter: string;
  memberCount: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border-2 overflow-hidden relative bg-[var(--color-card)]"
      style={{
        borderColor: "color-mix(in srgb, var(--pillar-strain) 45%, var(--color-stroke))",
      }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-2"
        style={{
          background: "color-mix(in srgb, var(--pillar-strain) 14%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--pillar-strain) 24%, var(--color-stroke))",
        }}
      >
        <span
          className="h-6 min-w-[24px] px-1.5 grid place-items-center rounded-md text-[11px] font-bold text-white"
          style={{ background: "var(--pillar-strain)" }}
        >
          {letter}
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.16em] font-bold"
          style={{ color: "var(--pillar-strain)" }}
        >
          Superset
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-fg-3)] tnum">
          {memberCount} exercises
        </span>
      </div>
      {children}
    </motion.div>
  );
}

/* ----------------------------- Drop set depth ----------------------------- */

/**
 * For each set in order, compute the drop-chain depth:
 *   regular set → 0
 *   first drop after a regular → 1
 *   second consecutive drop → 2 (and so on)
 *   any regular set resets the chain
 */
function computeDropDepths(sets: LiftSet[]): number[] {
  const out: number[] = [];
  let depth = 0;
  for (const s of sets) {
    if (s.isDropSet) {
      depth += 1;
      out.push(depth);
    } else {
      depth = 0;
      out.push(0);
    }
  }
  return out;
}

/* ----------------------------- Readiness chip ----------------------------- */

/**
 * Pre-workout readiness pill, sourced from the same composite Whoop-style
 * score the Today screen uses. When Fitbit Air HRV+RHR are syncing this
 * gives meaningful "go heavy / take it easy" guidance; before any sensor
 * data it falls back to a sleep proxy.
 */
function ReadinessChip() {
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);
  const result = React.useMemo(
    () =>
      computeReadiness({
        health,
        liftSessions,
        today: todayStr(),
        waterTargetOz,
      }),
    [health, liftSessions, waterTargetOz]
  );

  if (result.bracket === "unknown") return null;
  const tone = bracketTone(result.bracket);
  const label = bracketLabel(result.bracket);

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-stroke)] bg-[var(--color-card)]">
      <div
        className="h-7 px-2.5 rounded-full grid place-items-center text-[11px] font-bold tnum"
        style={{
          background: `color-mix(in srgb, ${tone} 16%, transparent)`,
          color: tone,
        }}
      >
        {result.score}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] font-medium">
          Readiness · {label}
        </div>
        <div className="text-[11px] text-[var(--color-fg-2)] truncate">
          {result.headline}
        </div>
      </div>
    </div>
  );
}

function bracketTone(b: string): string {
  switch (b) {
    case "optimal":
      return "var(--readiness-optimal)";
    case "green":
      return "var(--readiness-green)";
    case "yellow":
      return "var(--readiness-yellow)";
    case "red":
      return "var(--readiness-red)";
    default:
      return "var(--color-fg-3)";
  }
}

function bracketLabel(b: string): string {
  switch (b) {
    case "optimal":
      return "Optimal";
    case "green":
      return "Recovered";
    case "yellow":
      return "Moderate";
    case "red":
      return "Take it easy";
    default:
      return "No data";
  }
}
