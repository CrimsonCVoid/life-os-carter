"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Segmented } from "@/components/ui/segmented";
import { useStore } from "@/store";
import { useSelectedDate } from "./day-context";
import { Exercise, WorkoutType } from "@/lib/types";
import { uid } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const TYPES: WorkoutType[] = ["Push", "Pull", "Legs", "Cardio", "Yoga", "Other"];

export function WorkoutLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const date = useSelectedDate();
  const addWorkout = useStore((s) => s.addWorkout);

  const [type, setType] = React.useState<WorkoutType>("Push");
  const [duration, setDuration] = React.useState("45");
  const [intensity, setIntensity] = React.useState(7);
  const [notes, setNotes] = React.useState("");
  const [exercises, setExercises] = React.useState<Exercise[]>([]);

  React.useEffect(() => {
    if (open) {
      setType("Push");
      setDuration("45");
      setIntensity(7);
      setNotes("");
      setExercises([]);
    }
  }, [open]);

  const addExercise = () =>
    setExercises((arr) => [
      ...arr,
      { id: uid(), name: "", sets: 3, reps: 10 },
    ]);

  const save = () => {
    addWorkout({
      date,
      type,
      durationMin: Math.max(0, parseInt(duration, 10) || 0),
      intensity,
      notes: notes.trim() || undefined,
      exercises: exercises.filter((e) => e.name.trim()),
    });
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log workout"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save workout</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="label mb-2">Type</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={
                  "h-9 px-3 rounded-full text-xs font-medium border transition " +
                  (type === t
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-2">Duration (min)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div>
            <div className="label mb-2">Intensity</div>
            <div className="flex items-center gap-3 h-11">
              <Slider
                value={intensity}
                min={1}
                max={10}
                step={1}
                onChange={setIntensity}
              />
              <span className="text-sm font-semibold tnum w-7 text-right">
                {intensity}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="label">Exercises</span>
            <Button size="sm" variant="ghost" onClick={addExercise}>
              <Plus size={14} />
              Add
            </Button>
          </div>
          {exercises.length === 0 ? (
            <button
              type="button"
              onClick={addExercise}
              className="w-full py-3 rounded-xl border border-dashed border-[var(--color-stroke-strong)] text-xs text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:border-[var(--color-fg-3)] transition"
            >
              Optional — add sets / reps / weight
            </button>
          ) : (
            <ul className="space-y-2">
              {exercises.map((ex, idx) => (
                <li
                  key={ex.id}
                  className="grid grid-cols-[1fr_60px_60px_72px_36px] gap-1.5 items-center"
                >
                  <Input
                    value={ex.name}
                    onChange={(e) =>
                      setExercises((arr) =>
                        arr.map((x, i) =>
                          i === idx ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Exercise"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={ex.sets || ""}
                    onChange={(e) =>
                      setExercises((arr) =>
                        arr.map((x, i) =>
                          i === idx
                            ? { ...x, sets: parseInt(e.target.value, 10) || 0 }
                            : x
                        )
                      )
                    }
                    placeholder="Sets"
                    className="text-center"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={ex.reps || ""}
                    onChange={(e) =>
                      setExercises((arr) =>
                        arr.map((x, i) =>
                          i === idx
                            ? { ...x, reps: parseInt(e.target.value, 10) || 0 }
                            : x
                        )
                      )
                    }
                    placeholder="Reps"
                    className="text-center"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={ex.weight ?? ""}
                    onChange={(e) =>
                      setExercises((arr) =>
                        arr.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                weight: e.target.value
                                  ? parseFloat(e.target.value)
                                  : undefined,
                              }
                            : x
                        )
                      )
                    }
                    placeholder="Wt"
                    className="text-center"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setExercises((arr) => arr.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove exercise"
                    className="h-11 w-9 grid place-items-center rounded-lg text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="label mb-2">Notes</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Felt strong on incline today…"
          />
        </div>
      </div>
    </Modal>
  );
}
