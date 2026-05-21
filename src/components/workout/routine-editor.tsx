"use client";

import * as React from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ExerciseLibraryPicker } from "@/components/workout/exercise-library-picker";
import {
  useWorkoutRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
} from "@/lib/hooks/use-workout-routines";
import type {
  PlannedSet,
  TemplateExerciseEntry,
  WorkoutRoutine,
} from "@/lib/types";
import { WEEK_DAY_SHORT_LABELS, WEEK_DAY_LABELS } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ICON_CHOICES = [
  "💪",
  "🦵",
  "🪢",
  "🔥",
  "⚡",
  "🏋️",
  "🧘",
  "🚀",
  "🥊",
  "🏃",
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** null = create new routine. */
  routineId: string | null;
};

type DraftExercise = TemplateExerciseEntry & { _key: string };

let exerciseKeySeed = 0;
const nextExerciseKey = () => `ex-${++exerciseKeySeed}-${Date.now().toString(36)}`;

export function RoutineEditor({ open, onClose, routineId }: Props) {
  const { routines } = useWorkoutRoutines();

  const existing = React.useMemo<WorkoutRoutine | null>(
    () => routines.find((r) => r.id === routineId) ?? null,
    [routines, routineId]
  );

  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<string>(ICON_CHOICES[0]);
  const [notes, setNotes] = React.useState("");
  const [exercises, setExercises] = React.useState<DraftExercise[]>([]);
  const [scheduledDays, setScheduledDays] = React.useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setIcon(existing.icon || ICON_CHOICES[0]);
      setNotes(existing.notes || "");
      setScheduledDays(existing.scheduledDays ?? []);
      setExercises(
        existing.exercises.map((e) => ({
          ...e,
          plannedSets: e.plannedSets ? e.plannedSets.map((s) => ({ ...s })) : undefined,
          _key: nextExerciseKey(),
        }))
      );
    } else {
      setName("");
      setIcon(ICON_CHOICES[0]);
      setNotes("");
      setScheduledDays([]);
      setExercises([]);
    }
  }, [open, existing]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const toggleScheduledDay = (day: number) => {
    setScheduledDays((curr) =>
      curr.includes(day)
        ? curr.filter((d) => d !== day)
        : [...curr, day].sort((a, b) => a - b)
    );
    haptic("soft");
  };

  const addExercise = (exerciseName: string) => {
    setExercises((curr) => [
      ...curr,
      {
        name: exerciseName,
        plannedSets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
        _key: nextExerciseKey(),
      },
    ]);
    haptic("success");
  };

  const removeExercise = (key: string) => {
    setExercises((curr) => curr.filter((e) => e._key !== key));
    haptic("warn");
  };

  const updateExercise = (
    key: string,
    patch: Partial<TemplateExerciseEntry>
  ) => {
    setExercises((curr) =>
      curr.map((e) => (e._key === key ? { ...e, ...patch } : e))
    );
  };

  const addSet = (key: string) => {
    setExercises((curr) =>
      curr.map((e) => {
        if (e._key !== key) return e;
        const planned = e.plannedSets ? [...e.plannedSets] : [];
        const last = planned[planned.length - 1];
        planned.push(last ? { ...last } : { reps: 8 });
        return { ...e, plannedSets: planned };
      })
    );
    haptic("tap");
  };

  const removeSet = (key: string, setIndex: number) => {
    setExercises((curr) =>
      curr.map((e) => {
        if (e._key !== key) return e;
        const planned = (e.plannedSets ?? []).filter((_, j) => j !== setIndex);
        return { ...e, plannedSets: planned.length > 0 ? planned : undefined };
      })
    );
    haptic("soft");
  };

  const updateSet = (
    key: string,
    setIndex: number,
    patch: Partial<PlannedSet>
  ) => {
    setExercises((curr) =>
      curr.map((e) => {
        if (e._key !== key) return e;
        const planned = (e.plannedSets ?? []).map((s, j) =>
          j === setIndex ? { ...s, ...patch } : s
        );
        return { ...e, plannedSets: planned };
      })
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = exercises.findIndex((ex) => ex._key === active.id);
    const newI = exercises.findIndex((ex) => ex._key === over.id);
    if (oldI < 0 || newI < 0) return;
    setExercises((curr) => arrayMove(curr, oldI, newI));
    haptic("soft");
  };

  const canSave = name.trim().length > 0 && exercises.length > 0 && !saving;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      icon,
      notes: notes.trim() || undefined,
      exercises: exercises.map(({ _key: _omit, ...rest }) => {
        void _omit;
        return rest;
      }),
      scheduledDays: scheduledDays.length > 0 ? scheduledDays : undefined,
    };
    try {
      if (existing) {
        await updateRoutine(existing.id, payload);
      } else {
        await createRoutine({
          ...payload,
          order: routines.length,
          createdAt: new Date().toISOString(),
        });
      }
      haptic("success");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    await deleteRoutine(existing.id);
    haptic("warn");
    setConfirmDelete(false);
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={existing ? "Edit routine" : "New routine"}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            {existing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  haptic("warn");
                  setConfirmDelete(true);
                }}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : "Save routine"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="label mb-1.5">Name</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push Day"
              autoCapitalize="words"
            />
          </div>

          <div>
            <div className="label mb-1.5">Icon</div>
            <div className="flex flex-wrap gap-1.5">
              {ICON_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setIcon(c);
                    haptic("soft");
                  }}
                  className={cn(
                    "h-11 w-11 grid place-items-center rounded-full text-[18px] border",
                    "active:scale-[0.94] transition-transform duration-[80ms]",
                    icon === c
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-stroke)] bg-[var(--color-elevated)]"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="label mb-1.5">Schedule</div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_DAY_SHORT_LABELS.map((label, day) => {
                const selected = scheduledDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={WEEK_DAY_LABELS[day]}
                    aria-pressed={selected}
                    onClick={() => toggleScheduledDay(day)}
                    className={cn(
                      "h-11 rounded-lg text-[13px] font-semibold border",
                      "active:scale-[0.94] transition-transform duration-[80ms]",
                      selected
                        ? "bg-[var(--color-accent-strong)] text-white border-transparent"
                        : "bg-[var(--color-elevated)] border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-[var(--color-fg-3)] mt-1.5">
              Pick days when this routine should surface on Today.
            </div>
          </div>

          <div>
            <div className="label mb-1.5">Notes (optional)</div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Rest 2 min between sets…"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="label">Exercises</div>
              <span className="text-[10px] text-[var(--color-fg-3)] tnum">
                {exercises.length}
              </span>
            </div>

            {exercises.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-stroke-strong)] py-6 text-center">
                <div className="text-[12px] text-[var(--color-fg-3)] mb-2">
                  No exercises yet.
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus size={13} />
                  Add exercise
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={exercises.map((e) => e._key)}
                    strategy={verticalListSortingStrategy}
                  >
                    {exercises.map((ex) => (
                      <ExerciseRow
                        key={ex._key}
                        entry={ex}
                        onRemove={() => removeExercise(ex._key)}
                        onChangeNotes={(n) =>
                          updateExercise(ex._key, { notes: n })
                        }
                        onAddSet={() => addSet(ex._key)}
                        onRemoveSet={(j) => removeSet(ex._key, j)}
                        onUpdateSet={(j, patch) =>
                          updateSet(ex._key, j, patch)
                        }
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className={cn(
                    "w-full h-11 rounded-xl border border-dashed",
                    "border-[var(--color-stroke-strong)] text-[var(--color-fg-2)]",
                    "text-[13px] font-medium",
                    "active:scale-[0.99] transition-transform duration-[80ms]"
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus size={13} />
                    Add exercise
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ExerciseLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this routine?"
        description="The routine is removed from your library. Past workout sessions you logged from it stay intact."
        confirmLabel="Delete"
      />
    </>
  );
}

function ExerciseRow({
  entry,
  onRemove,
  onChangeNotes,
  onAddSet,
  onRemoveSet,
  onUpdateSet,
}: {
  entry: DraftExercise;
  onRemove: () => void;
  onChangeNotes: (n: string) => void;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
  onUpdateSet: (index: number, patch: Partial<PlannedSet>) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const planned = entry.plannedSets ?? [];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry._key });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn(
        "rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)]",
        isDragging && "shadow-[var(--shadow-float)]"
      )}
    >
      <div className="flex items-center gap-2 px-2 py-2.5">
        <button
          type="button"
          aria-label="Reorder"
          className="h-11 w-8 grid place-items-center text-[var(--color-fg-3)] touch-none cursor-grab active:cursor-grabbing shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-[14px] font-semibold tracking-tight truncate">
            {entry.name}
          </div>
          <div className="text-[10px] text-[var(--color-fg-3)] tnum mt-0.5">
            {planned.length > 0
              ? `${planned.length} planned set${planned.length === 1 ? "" : "s"}`
              : "No planned sets"}
          </div>
        </button>
        <button
          type="button"
          aria-label="Remove exercise"
          onClick={onRemove}
          className="h-11 w-11 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] active:scale-90 shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--color-stroke)] pt-2.5">
          {planned.length > 0 && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[28px_1fr_1fr_42px_24px] gap-1.5 items-center text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] px-1">
                <div className="text-center">#</div>
                <div>Weight</div>
                <div>Reps</div>
                <div>RPE</div>
                <div />
              </div>
              {planned.map((s, j) => (
                <div
                  key={j}
                  className="grid grid-cols-[28px_1fr_1fr_42px_24px] gap-1.5 items-center"
                >
                  <div className="text-[11px] text-[var(--color-fg-3)] tnum text-center">
                    {j + 1}
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={s.weight ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onUpdateSet(j, {
                        weight: v === "" ? undefined : Number(v),
                      });
                    }}
                    placeholder="—"
                    className="h-9 text-[13px] px-2"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={s.reps ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onUpdateSet(j, {
                        reps: v === "" ? undefined : parseInt(v, 10),
                      });
                    }}
                    placeholder="—"
                    className="h-9 text-[13px] px-2"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={s.rpe ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onUpdateSet(j, {
                        rpe: v === "" ? undefined : Number(v),
                      });
                    }}
                    placeholder="—"
                    className="h-9 text-[12px] px-1.5 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveSet(j)}
                    aria-label="Remove set"
                    className="h-9 w-9 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-90"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onAddSet}
            className="w-full h-11 rounded-lg border border-dashed border-[var(--color-stroke-strong)] text-[12px] text-[var(--color-fg-2)] active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus size={11} />
              Add set
            </span>
          </button>

          <div>
            <div className="label mb-1 text-[9px]">Exercise note</div>
            <Input
              value={entry.notes ?? ""}
              onChange={(e) => onChangeNotes(e.target.value)}
              placeholder="Form cue, rest target…"
              className="h-9 text-[12px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
