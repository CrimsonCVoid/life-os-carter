"use client";

import * as React from "react";
import { Square, Timer, X, Trash2, Plus, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Set-logger sheet — opens from the floating banner. Shows the live
 * exercise list with each set, a quick-add row at the bottom, an
 * elapsed-time header, and a rest timer that counts up from the last
 * set so the user knows how long they've been resting.
 */
export function ActiveWorkoutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useStore((s) => s.activeWorkout);
  const addSet = useStore((s) => s.addActiveWorkoutSet);
  const removeSet = useStore((s) => s.removeActiveWorkoutSet);
  const removeExercise = useStore((s) => s.removeActiveWorkoutExercise);
  const finish = useStore((s) => s.finishActiveWorkout);
  const cancel = useStore((s) => s.cancelActiveWorkout);

  const [exerciseName, setExerciseName] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [reps, setReps] = React.useState("");
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  // Auto-prefill the next exercise input with the last one used — most
  // users do multiple sets of the same lift in a row.
  React.useEffect(() => {
    if (!active || active.exercises.length === 0) return;
    if (exerciseName.trim()) return;
    setExerciseName(active.exercises[active.exercises.length - 1].name);
  }, [active, exerciseName]);

  if (!active) {
    return null;
  }

  const handleAdd = () => {
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (!exerciseName.trim() || !Number.isFinite(r) || r <= 0) return;
    addSet(exerciseName.trim(), Number.isFinite(w) ? w : 0, r);
    setReps("");
    haptic("success");
  };

  const handleFinish = () => {
    const session = finish();
    haptic("success");
    onClose();
    // Caller is responsible for any post-finish UI (toast, navigate to /gym).
    void session;
  };

  const elapsedMs = Date.now() - new Date(active.startedAt).getTime();

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={active.workoutType || "Workout"}
        description={`${fmtElapsed(elapsedMs)} elapsed${active.lastSetAt ? ` · resting ${fmtElapsed(Date.now() - new Date(active.lastSetAt).getTime())}` : ""}`}
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
              onClick={handleFinish}
              disabled={active.exercises.length === 0}
              haptic="success"
            >
              <Square size={14} />
              Finish
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Exercises + sets */}
          {active.exercises.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-stroke-strong)] p-6 text-center">
              <Timer
                size={20}
                className="mx-auto mb-2 text-[var(--color-fg-3)]"
              />
              <div className="text-[13px] text-[var(--color-fg-2)]">
                Log your first set below to start tracking.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {active.exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="text-[14px] font-semibold">{ex.name}</div>
                    <button
                      type="button"
                      onClick={() => removeExercise(ex.id)}
                      aria-label="Remove exercise"
                      className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-95"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {ex.sets.map((s) => (
                      <div
                        key={s.order}
                        className="flex items-center justify-between text-[13px] py-1"
                      >
                        <span className="text-[var(--color-fg-3)] tnum w-8">
                          #{s.order}
                        </span>
                        <span className="tnum">
                          {s.weight > 0 ? `${s.weight} lb` : "BW"} ×{" "}
                          <span className="font-semibold">{s.reps}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSet(ex.id, s.order)}
                          aria-label="Remove set"
                          className="h-6 w-6 grid place-items-center rounded text-[var(--color-fg-3)] active:scale-95"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick-add row */}
          <div className="rounded-xl border border-[var(--color-stroke-strong)] bg-[var(--color-elevated)]/40 p-3">
            <div className="label mb-2">Add set</div>
            <div className="space-y-2">
              <Input
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                placeholder="Exercise (e.g. Bench press)"
                autoCapitalize="words"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="2.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Weight (lb)"
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  placeholder="Reps"
                />
              </div>
              <Button
                onClick={handleAdd}
                disabled={
                  !exerciseName.trim() ||
                  !Number.isFinite(parseInt(reps, 10)) ||
                  parseInt(reps, 10) <= 0
                }
                className="w-full"
                haptic="soft"
              >
                <Plus size={14} />
                Add set
              </Button>
            </div>
          </div>

          {/* Repeat-last-exercise shortcut */}
          {active.exercises.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const last = active.exercises[active.exercises.length - 1];
                const lastSet = last.sets[last.sets.length - 1];
                addSet(last.name, lastSet.weight, lastSet.reps);
                haptic("soft");
              }}
              className={cn(
                "w-full flex items-center justify-center gap-2 text-[13px]",
                "py-2.5 rounded-xl border border-[var(--color-stroke)]",
                "text-[var(--color-fg-2)] active:scale-[0.99] transition-transform duration-[60ms]"
              )}
            >
              <RotateCcw size={12} />
              Repeat last set ·{" "}
              <span className="text-[var(--color-fg-3)] tnum">
                {fmtLastSet(active.exercises)}
              </span>
            </button>
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
          To save this workout, tap "Keep going" and then "Finish."
        </p>
      </Modal>
    </>
  );
}

function fmtLastSet(exs: { sets: { weight: number; reps: number }[] }[]): string {
  const last = exs[exs.length - 1];
  if (!last) return "";
  const s = last.sets[last.sets.length - 1];
  if (!s) return "";
  return `${s.weight > 0 ? `${s.weight}lb` : "BW"} × ${s.reps}`;
}

function fmtElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
